import { cleanup, describe, expect, test, waitFor } from 'react-native-harness'
import { E2E_BASE } from './e2eServer'
import { renderWebView, WAIT } from './webViewHarness'

describe('onHttpError', () => {
  test('reports the main-frame 404, ends loading and never emits success', async () => {
    try {
      const observation = await renderWebView({
        source: { uri: `${E2E_BASE}/notfound` },
      })
      await waitFor(() => {
        expect(observation.httpErrors.length).toBe(1)
        expect(observation.ends.length).toBe(1)
      }, WAIT)
      expect(observation.httpErrors[0]).toMatchObject({
        statusCode: 404,
        url: `${E2E_BASE}/notfound`,
      })
      // Chromium may report the response error before onPageStarted.
      expect(
        observation.events.filter(event => event === 'start')
      ).toHaveLength(1)
      expect(observation.events.indexOf('start')).toBeLessThan(
        observation.events.indexOf('end')
      )
      expect(observation.events.indexOf('httpError')).toBeLessThan(
        observation.events.indexOf('end')
      )
      expect(observation.loads).toEqual([])
      expect(observation.errors).toEqual([])
      expect(observation.ends[0]).toMatchObject({
        url: `${E2E_BASE}/notfound`,
        loading: false,
      })
    } finally {
      cleanup()
    }
  })
})
