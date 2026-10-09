import { describe, test, render } from 'react-native-harness'
import React from 'react'
import { NitroWebView, callback, type NitroWebViewType } from 'nitro-webview'
import { E2E_BASE } from './e2eServer'

describe('postMessage', () => {
  // Real on-device smoke: the WebView mounts with a captured hybridRef and an
  // onMessage handler wired against the e2e-server page.
  test('mounts with a hybridRef and onMessage wired', async () => {
    const ref: { current: NitroWebViewType | null } = { current: null }
    const { unmount } = await render(
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: `${E2E_BASE}/` }}
        hybridRef={callback((r) => {
          ref.current = r
        })}
        onMessage={callback(() => {})}
      />
    )

    // Callback assertions run in RegressionVerificationScreen through the
    // normal AppRegistry root. This overlay test only verifies mounting.
    void ref

    unmount()
  })
})
