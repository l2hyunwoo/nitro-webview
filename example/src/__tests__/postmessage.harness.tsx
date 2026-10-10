import { cleanup, describe, expect, test, waitFor } from 'react-native-harness'
import { E2E_BASE } from './e2eServer'
import { bounded, loaded, renderWebView, WAIT } from './webViewHarness'

describe('JavaScript bridge', () => {
  test('round-trips native messages and JS results without changing special characters', async () => {
    const payload =
      'quotes: " \' backslash: \\ newline:\n한국어 😀 \u2028\u2029 </script>'
    try {
      const observation = await renderWebView({
        source: { uri: `${E2E_BASE}/` },
      })
      const ref = await loaded(observation)
      await waitFor(
        () => expect(observation.messages).toContain('loaded'),
        WAIT
      )
      ref.postMessage(payload)
      await waitFor(
        () => expect(observation.messages).toContain(`echo:${payload}`),
        WAIT
      )
      const result = await bounded(
        ref.evaluateJavaScript(
          `({payload:${JSON.stringify(
            payload
          )},number:42,bool:true,array:[1,null]})`
        )
      )
      expect(JSON.parse(result)).toEqual({
        payload,
        number: 42,
        bool: true,
        array: [1, null],
      })
      expect(await bounded(ref.evaluateJavaScript('null'))).toBe('null')
      expect(observation.errors).toEqual([])
    } finally {
      cleanup()
    }
  })
})
