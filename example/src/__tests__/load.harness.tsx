import { describe, test, expect, render, fn, waitFor } from 'react-native-harness'
import React from 'react'
import { NitroWebView, callback } from 'nitro-webview'
import { E2E_BASE } from './e2eServer'

describe('WebView load', () => {
  test('onLoadEnd fires for a 200 page', async () => {
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
