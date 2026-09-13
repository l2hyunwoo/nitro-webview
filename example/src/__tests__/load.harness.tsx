import { describe, test, expect, render, fn, waitFor } from 'react-native-harness'
import React from 'react'
import { NitroWebView, callback } from 'nitro-webview'
import { E2E_BASE } from './e2eServer'

describe('WebView load', () => {
  // Real on-device smoke: the Nitro-backed WebView mounts against a page served
  // by the e2e-server without crashing. render() resolves only after the native
  // view hierarchy commits, so this exercises the whole build/install/mount path.
  test('mounts a 200 page from the e2e-server', async () => {
    const { unmount } = await render(
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: `${E2E_BASE}/` }}
        onLoadEnd={callback(() => {})}
      />
    )
    unmount()
  })

  // Nitro HybridView event callbacks (onLoadEnd, etc.) do not fire when the view
  // is mounted via react-native-harness 1.3.0's render() overlay: verified locally
  // that the WebView mounts but no callback prop is invoked (even for inline HTML,
  // ruling out networking/ATS). Enable once the harness<->Nitro event bridge lands.
  test.skip('onLoadEnd fires for a 200 page', async () => {
    const onLoadEnd = fn()
    const { unmount } = await render(
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: `${E2E_BASE}/` }}
        onLoadEnd={callback(onLoadEnd)}
      />
    )
    await waitFor(() => expect(onLoadEnd).toHaveBeenCalled(), { timeout: 15000 })
    unmount()
  })
})
