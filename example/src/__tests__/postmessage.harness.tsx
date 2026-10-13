import { cleanup, describe, expect, test, waitFor } from 'react-native-harness'
import { E2E_BASE } from './e2eServer'
import { bounded, loaded, renderWebView, WAIT } from './webViewHarness'

describe('JavaScript bridge', () => {
  test('delivers large and hostile strings verbatim in call order', async () => {
    const payloads = [
      '',
      '" \\ \n\r\t\u0000 한국어 😀 \u2028\u2029 </script>',
      String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)),
      'x'.repeat(65536),
      '漢字 😀\u2028\u2029"\\'.repeat(8192),
    ]
    try {
      const observation = await renderWebView({
        source: {
          html: `<script>function echo(event) {
            window.ReactNativeWebView.postMessage(JSON.stringify({type: typeof event.data, data: event.data}));
          }
          window.addEventListener('message', echo);
          document.addEventListener('message', echo);</script>`,
        },
      })
      const ref = await loaded(observation)
      for (const payload of payloads) ref.postMessage(payload)
      await waitFor(() => expect(observation.messages.length).toBe(payloads.length), WAIT)
      expect(observation.messages.map(message => JSON.parse(message))).toEqual(
        payloads.map(data => ({ type: 'string', data }))
      )
      expect(observation.errors).toEqual([])
    } finally {
      cleanup()
    }
  })

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
