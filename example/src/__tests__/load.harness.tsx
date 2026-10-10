import { describe, test, render } from 'react-native-harness'
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
})
