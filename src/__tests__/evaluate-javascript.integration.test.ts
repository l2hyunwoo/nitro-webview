import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createLoadEndDispatcher,
  type NativeLoadEndPayload,
} from '../events.ts'
import type {
  NitroWebViewMethods,
  WebViewNavigationState,
} from '../specs/NitroWebView.nitro.ts'

interface HybridRefContainer {
  current: NitroWebViewMethods | null
}

function createHybridRef(): HybridRefContainer {
  return { current: null }
}

/**
 * JS-side test double for the native HybridView boundary. Models both the
 * imperative `evaluateJavaScript` and the `onLoadEnd` lifecycle, gating
 * evaluation on the loaded state so calls issued before load-end are
 * queued and flushed once the page finishes loading.
 */
class FakeLoadedWebView implements NitroWebViewMethods {
  private readonly dispatchLoadEnd: (payload: NativeLoadEndPayload) => void

  // Scripted results — anything not registered throws so test typos surface.
  private readonly scripts: Map<string, string>

  private loaded = false
  private readonly pending: Array<{
    code: string
    resolve: (value: string) => void
    reject: (reason: Error) => void
  }> = []

  constructor(opts: {
    onLoadEnd: (event: { nativeEvent: WebViewNavigationState }) => void
    scripts: Record<string, string>
  }) {
    this.dispatchLoadEnd = createLoadEndDispatcher(opts.onLoadEnd)
    this.scripts = new Map(Object.entries(opts.scripts))
  }

  evaluateJavaScript(code: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // Microtask hop mirrors native asynchrony: WebKit's
      // `evaluateJavaScript` resolves its completion handler across the
      // JS<->native boundary even for trivial expressions.
      queueMicrotask(() => {
        if (!this.loaded) {
          this.pending.push({ code, resolve, reject })
          return
        }
        this.deliver(code, resolve, reject)
      })
    })
  }

  goBack(): void {
    /* no-op */
  }

  goForward(): void {
    /* no-op */
  }

  reload(): void {
    /* no-op */
  }

  stopLoading(): void {
    /* no-op */
  }

  /**
   * Fire `onLoadEnd` through the production dispatcher and flip the
   * loaded gate so any queued `evaluateJavaScript` calls flush in order.
   */
  simulateLoadEnd(payload: NativeLoadEndPayload): void {
    this.dispatchLoadEnd(payload)
    this.loaded = true
    const queued = this.pending.splice(0, this.pending.length)
    for (const { code, resolve, reject } of queued) {
      this.deliver(code, resolve, reject)
    }
  }

  private deliver(
    code: string,
    resolve: (value: string) => void,
    reject: (reason: Error) => void
  ): void {
    const result = this.scripts.get(code)
    if (result === undefined) {
      reject(
        new Error(
          `FakeLoadedWebView: no scripted result for code ${JSON.stringify(code)} ` +
            '(integration test must register every expression it exercises)'
        )
      )
      return
    }
    resolve(result)
  }
}

test('hybridRef.current.evaluateJavaScript("1 + 1") against a LOADED WebView resolves to "2"', async () => {
  const hybridRef = createHybridRef()
  const onLoadEndEvents: Array<{ nativeEvent: WebViewNavigationState }> = []

  const view = new FakeLoadedWebView({
    onLoadEnd: (event) => onLoadEndEvents.push(event),
    scripts: {
      '1 + 1': '2',
    },
  })
  hybridRef.current = view

  assert.ok(hybridRef.current, 'hybridRef.current must be bound before use')
  assert.equal(
    typeof hybridRef.current.evaluateJavaScript,
    'function',
    'hybridRef.current.evaluateJavaScript must be a function'
  )

  view.simulateLoadEnd({
    navigationId: 1,
    outcome: 'success',
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })

  assert.equal(
    onLoadEndEvents.length,
    1,
    'load-end must have fired exactly once before evaluateJavaScript runs against a LOADED WebView'
  )

  const promise = hybridRef.current.evaluateJavaScript('1 + 1')

  assert.ok(
    promise instanceof Promise,
    'evaluateJavaScript must return a Promise at runtime, not a synchronous value'
  )

  const result = await promise

  assert.equal(
    typeof result,
    'string',
    'awaited evaluateJavaScript result must be a string (Promise<string> contract)'
  )
  assert.equal(
    result,
    '2',
    'evaluateJavaScript("1 + 1") must resolve to the expected string result "2" end-to-end'
  )
})

test('hybridRef.current.evaluateJavaScript("document.title") resolves to the loaded page title', async () => {
  const hybridRef = createHybridRef()

  const view = new FakeLoadedWebView({
    onLoadEnd: () => {},
    scripts: {
      'document.title': 'Example Domain',
    },
  })
  hybridRef.current = view

  view.simulateLoadEnd({
    navigationId: 1,
    outcome: 'success',
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })

  const result = await hybridRef.current.evaluateJavaScript('document.title')

  assert.equal(typeof result, 'string')
  assert.equal(
    result,
    'Example Domain',
    'evaluateJavaScript("document.title") must resolve to the loaded page title end-to-end'
  )
})

test('a call issued BEFORE load-end resolves to the expected string AFTER the page loads', async () => {
  // A naive implementation that resolved immediately would not match either
  // native side's behaviour — WKWebView on a still-loading page produces
  // inconsistent results; WebView returns null before page-finish.
  const hybridRef = createHybridRef()

  const view = new FakeLoadedWebView({
    onLoadEnd: () => {},
    scripts: {
      '1 + 1': '2',
    },
  })
  hybridRef.current = view

  const promise = hybridRef.current.evaluateJavaScript('1 + 1')

  // Race the promise against a microtask flush — if the load-gate was
  // bypassed the race resolves to the value; if pending, to the sentinel.
  const sentinel = Symbol('still-pending')
  const raced = await Promise.race([
    promise.then((v) => v),
    Promise.resolve(sentinel),
  ])
  assert.equal(
    raced,
    sentinel,
    'evaluateJavaScript must NOT resolve before load-end'
  )

  view.simulateLoadEnd({
    navigationId: 1,
    outcome: 'success',
    url: 'https://example.com',
    title: 'Example Domain',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })

  const result = await promise
  assert.equal(
    result,
    '2',
    'evaluateJavaScript("1 + 1") issued before load-end must resolve to "2" once the page is loaded'
  )
})
