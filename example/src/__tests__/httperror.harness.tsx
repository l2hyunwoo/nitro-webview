import { describe, test, expect, render, waitFor } from 'react-native-harness'
import React from 'react'
import { NitroWebView, callback } from 'nitro-webview'
import { E2E_BASE } from './e2eServer'

describe('onHttpError', () => {
  test('fires with statusCode 404 for a missing route', async () => {
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
