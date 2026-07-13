import { describe, test, expect, render, waitFor } from 'react-native-harness'
import React from 'react'
import { NitroWebView, callback } from 'nitro-webview'
import { E2E_BASE } from './e2eServer'

describe('onHttpError', () => {
  // Real on-device smoke: the WebView mounts against the e2e-server's 404 route
  // with an onHttpError handler wired.
  test('mounts against a 404 route with onHttpError wired', async () => {
    const { unmount } = await render(
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: `${E2E_BASE}/notfound` }}
        onHttpError={callback(() => {})}
      />
    )
    unmount()
  })

  // See load.harness.tsx: Nitro event callbacks (onHttpError) do not fire through
  // the react-native-harness 1.3.0 render() overlay. Enable once the event bridge
  // lands; the /notfound route already returns a real 404 for it.
  test.skip('fires with statusCode 404 for a missing route', async () => {
    let statusCode = 0
    const { unmount } = await render(
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: `${E2E_BASE}/notfound` }}
        onHttpError={callback((e) => {
          statusCode = e.nativeEvent.statusCode
        })}
      />
    )
    await waitFor(() => expect(statusCode).toBe(404), { timeout: 15000 })
    unmount()
  })
})
