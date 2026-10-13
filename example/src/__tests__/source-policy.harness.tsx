import React from 'react'
import { View } from 'react-native'
import { cleanup, expect, render, test, waitFor } from 'react-native-harness'
import { callback, NitroWebView, type NitroWebViewType } from 'nitro-webview'
import { bounded, WAIT } from './webViewHarness'
import { E2E_BASE } from './e2eServer'

type Props = React.ComponentProps<typeof NitroWebView>

async function mount(props: Props) {
  let ref: NitroWebViewType | null = null
  let loads = 0
  const messages: string[] = []
  const errors: string[] = []
  const element = (next: Props) => (
    <View style={{ width: 320, height: 320 }}>
      <NitroWebView
        {...next}
        style={{ flex: 1 }}
        hybridRef={callback(value => {
          ref = value
        })}
        onLoadEnd={callback(() => {
          loads++
        })}
        onMessage={callback(event => {
          messages.push(event.nativeEvent.data)
        })}
        onError={callback(event => {
          errors.push(event.nativeEvent.description)
        })}
      />
    </View>
  )
  const mounted = await render(element(props), { timeout: 10000 })
  await waitFor(() => expect(loads).toBe(1), WAIT)
  return {
    rerender: (next: Props) => mounted.rerender(element(next)),
    evaluate: async (code: string) =>
      JSON.parse(await bounded(ref!.evaluateJavaScript(code))),
    loads: () => loads,
    messages,
    errors,
  }
}

const quiet = () => new Promise<void>(resolve => setTimeout(resolve, 250))

test('equal HTML source values preserve page state while HTML and base URL changes load', async () => {
  try {
    const source = { html: '<title>one</title>', baseUrl: `${E2E_BASE}/` }
    const page = await mount({ source })
    await page.evaluate('window.marker = 42')
    await page.rerender({ source: { ...source } })
    await quiet()
    expect(page.loads()).toBe(1)
    expect(await page.evaluate('window.marker')).toBe(42)
    await page.rerender({ source: { ...source, html: '<title>two</title>' } })
    await waitFor(() => expect(page.loads()).toBe(2), WAIT)
    expect(await page.evaluate('document.title')).toBe('two')
    await page.rerender({
      source: { ...source, baseUrl: `${E2E_BASE}/changed/` },
    })
    await waitFor(() => expect(page.loads()).toBe(3), WAIT)
    expect(await page.evaluate('document.baseURI')).toBe(`${E2E_BASE}/changed/`)
    expect(page.errors).toEqual([])
  } finally {
    cleanup()
  }
})

test('URI source equality preserves header and defaultHeaders update semantics', async () => {
  try {
    const source = {
      uri: `${E2E_BASE}/headers`,
      headers: { 'X-Request': 'one', 'X-Other': 'value' },
    }
    const defaults = { 'X-Default': 'one' }
    const page = await mount({ source, defaultHeaders: defaults })
    await page.evaluate('window.marker = 42')
    await page.rerender({
      source: {
        ...source,
        headers: { 'X-Other': 'value', 'X-Request': 'one' },
      },
      defaultHeaders: { ...defaults },
    })
    await quiet()
    expect(page.loads()).toBe(1)
    expect(await page.evaluate('window.marker')).toBe(42)
    await page.rerender({ source, defaultHeaders: { 'X-Default': 'two' } })
    await quiet()
    expect(page.loads()).toBe(1)
    expect(
      await page.evaluate('window.observedRequest.headers["x-default"]')
    ).toBe('one')
    await page.rerender({
      source: { ...source, headers: { 'X-Request': 'two' } },
      defaultHeaders: { 'X-Default': 'two', 'X-Request': 'default' },
    })
    await waitFor(() => expect(page.loads()).toBe(2), WAIT)
    expect(
      await page.evaluate(
        '({request:window.observedRequest.headers["x-request"], defaults:window.observedRequest.headers["x-default"]})'
      )
    ).toEqual({ request: 'two', defaults: 'two' })
    expect(page.errors).toEqual([])
  } finally {
    cleanup()
  }
})

test('equal POST bodies do not reload and changed bodies or methods do reload', async () => {
  try {
    const source = {
      uri: `${E2E_BASE}/headers`,
      method: 'POST' as const,
      body: 'one',
    }
    const page = await mount({ source })
    expect(await page.evaluate('window.observedRequest.body')).toBe('one')
    await page.rerender({ source: { ...source } })
    await quiet()
    expect(page.loads()).toBe(1)
    await page.rerender({ source: { ...source, body: 'two' } })
    await waitFor(() => expect(page.loads()).toBe(2), WAIT)
    expect(await page.evaluate('window.observedRequest.body')).toBe('two')
    await page.rerender({ source: { uri: source.uri, method: 'GET' } })
    await waitFor(() => expect(page.loads()).toBe(3), WAIT)
    expect(await page.evaluate('window.observedRequest.method')).toBe('GET')
    expect(page.errors).toEqual([])
  } finally {
    cleanup()
  }
})

test('document-start injection precedes main page scripts and excludes iframes', async () => {
  try {
    const page = await mount({
      source: {
        html: `<!doctype html><script>window.mainObserved = window.beforeCount || null;</script><iframe srcdoc="<script>window.frameObserved = window.beforeCount || null;</script>"></iframe>`,
        baseUrl: `${E2E_BASE}/`,
      },
      injectedJavaScriptBeforeContentLoaded:
        'window.beforeCount = (window.beforeCount || 0) + 1;',
    })
    expect(
      await page.evaluate(
        '({main:window.beforeCount, early:window.mainObserved, frame:document.querySelector("iframe").contentWindow.beforeCount || null, frameEarly:document.querySelector("iframe").contentWindow.frameObserved})'
      )
    ).toEqual({ main: 1, early: 1, frame: null, frameEarly: null })
    expect(page.errors).toEqual([])
  } finally {
    cleanup()
  }
})

test('origin policy changes invalidate cached allowlists without reloading the page', async () => {
  try {
    const source = { uri: `${E2E_BASE}/headers` }
    const page = await mount({ source, allowedMessageOrigins: [E2E_BASE] })
    await page.evaluate(
      'window.marker = 42; window.ReactNativeWebView.postMessage("allowed"); true'
    )
    await waitFor(() => expect(page.messages).toEqual(['allowed']), WAIT)
    await page.rerender({
      source: { ...source },
      allowedMessageOrigins: ['https://other.test'],
    })
    await page.evaluate('window.ReactNativeWebView.postMessage("denied"); true')
    await quiet()
    expect(page.messages).toEqual(['allowed'])
    await page.rerender({ source, allowedMessageOrigins: [] })
    await page.evaluate(
      'window.ReactNativeWebView.postMessage("empty-denied"); true'
    )
    await quiet()
    expect(page.messages).toEqual(['allowed'])
    await page.rerender({ source, allowedMessageOrigins: [E2E_BASE, '*'] })
    await waitFor(() => expect(page.errors.length).toBe(1), WAIT)
    await page.evaluate(
      'window.ReactNativeWebView.postMessage("invalid-denied"); true'
    )
    await quiet()
    expect(page.messages).toEqual(['allowed'])
    await page.rerender({ source, allowedMessageOrigins: [E2E_BASE] })
    await page.evaluate(
      'window.ReactNativeWebView.postMessage("restored"); true'
    )
    await waitFor(
      () => expect(page.messages).toEqual(['allowed', 'restored']),
      WAIT
    )
    expect(await page.evaluate('window.marker')).toBe(42)
    expect(page.loads()).toBe(1)
  } finally {
    cleanup()
  }
})
