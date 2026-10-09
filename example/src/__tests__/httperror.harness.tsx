import { describe, test, render } from 'react-native-harness'
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
})
