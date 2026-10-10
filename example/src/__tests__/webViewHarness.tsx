import React from 'react'
import { View } from 'react-native'
import { expect, render, waitFor } from 'react-native-harness'
import {
  callback,
  NitroWebView,
  type NitroWebViewType,
  type NitroWebViewHttpErrorEvent,
  type NitroWebViewErrorEvent,
  type WebViewLoadEvent,
  type WebViewLoadProgressEvent,
  type NitroWebViewScrollEvent,
} from 'nitro-webview'

type Props = React.ComponentProps<typeof NitroWebView>

export const WAIT = { timeout: 10000, interval: 50 }

export async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Native operation timed out after 10s')),
          WAIT.timeout
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function renderWebView(props: Props) {
  const observation = {
    ref: null as NitroWebViewType | null,
    events: [] as string[],
    loads: [] as WebViewLoadEvent['nativeEvent'][],
    ends: [] as WebViewLoadEvent['nativeEvent'][],
    messages: [] as string[],
    httpErrors: [] as NitroWebViewHttpErrorEvent['nativeEvent'][],
    errors: [] as NitroWebViewErrorEvent['nativeEvent'][],
    progress: [] as number[],
    scrolls: [] as NitroWebViewScrollEvent['nativeEvent'][],
  }
  await render(
    // Keep the native WebView measurable inside the harness overlay.
    <View collapsable={false} style={{ width: 320, height: 320 }}>
      <NitroWebView
        style={{ flex: 1 }}
        {...props}
        hybridRef={callback(ref => {
          observation.ref = ref
        })}
        onLoadStart={callback(() => {
          observation.events.push('start')
        })}
        onLoad={callback(event => {
          observation.events.push('load')
          observation.loads.push(event.nativeEvent)
        })}
        onLoadEnd={callback(event => {
          observation.events.push('end')
          observation.ends.push(event.nativeEvent)
        })}
        onMessage={callback(event => {
          observation.messages.push(event.nativeEvent.data)
        })}
        onLoadProgress={callback((event: WebViewLoadProgressEvent) => {
          observation.progress.push(event.nativeEvent.progress)
        })}
        onScroll={callback(event => {
          observation.scrolls.push(event.nativeEvent)
        })}
        onHttpError={callback(event => {
          observation.events.push('httpError')
          observation.httpErrors.push(event.nativeEvent)
        })}
        onError={callback(event => {
          observation.events.push('error')
          observation.errors.push(event.nativeEvent)
        })}
      />
    </View>,
    { timeout: 10000 }
  )
  return observation
}

export async function loaded(
  observation: Awaited<ReturnType<typeof renderWebView>>
) {
  await waitFor(() => {
    expect(observation.ref).not.toBeNull()
    expect(observation.ends.length).toBe(1)
  }, WAIT)
  expect(observation.events).toEqual(['start', 'load', 'end'])
  expect(observation.errors).toEqual([])
  expect(observation.httpErrors).toEqual([])
  return observation.ref!
}
