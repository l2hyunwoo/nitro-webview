import { describe, test, expect, render, waitFor } from 'react-native-harness'
import React from 'react'
import { NitroWebView, callback, type NitroWebViewType } from 'nitro-webview'
import { E2E_BASE } from './e2eServer'

describe('postMessage', () => {
  test('native -> web postMessage is echoed back via onMessage', async () => {
    const received: string[] = []
    const ref: { current: NitroWebViewType | null } = { current: null }

    const { unmount } = await render(
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: `${E2E_BASE}/` }}
        hybridRef={callback((r) => {
          ref.current = r
        })}
        onMessage={callback((e) => {
          received.push(e.nativeEvent.data)
        })}
      />
    )

    // The page posts 'loaded' on load; wait for it before pushing a message in.
    await waitFor(() => expect(received).toContain('loaded'), { timeout: 15000 })

    // native -> web: the page's 'message' listener echoes it back as 'echo:ping'.
    ref.current?.postMessage('ping')

    await waitFor(() => expect(received).toContain('echo:ping'), {
      timeout: 15000,
    })

    unmount()
  })
})
