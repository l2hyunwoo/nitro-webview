import { cleanup, describe, expect, test, waitFor } from 'react-native-harness'
import { PixelRatio, Platform } from 'react-native'
import { E2E_BASE } from './e2eServer'
import { bounded, loaded, renderWebView, WAIT } from './webViewHarness'

describe('WebView load', () => {
  test('emits start, success, end and exposes the real HTTP page', async () => {
    try {
      const observation = await renderWebView({
        source: { uri: `${E2E_BASE}/` },
      })
      const ref = await loaded(observation)
      await waitFor(
        () => expect(observation.messages).toContain('loaded'),
        WAIT
      )
      await waitFor(() => expect(observation.progress.at(-1)).toBe(1), WAIT)
      expect(
        observation.progress.every(
          value => Number.isFinite(value) && value >= 0 && value <= 1
        )
      ).toBe(true)
      expect(observation.loads[0].url).toBe(`${E2E_BASE}/`)
      expect(observation.loads[0].loading).toBe(false)
      // WKWebView can emit an empty title snapshot; verify the actual DOM below.
      expect(typeof observation.loads[0].title).toBe('string')
      expect(observation.ends[0]).toMatchObject({
        url: `${E2E_BASE}/`,
        loading: false,
      })
      const result = await bounded(
        ref.evaluateJavaScript(
          '({title:document.title,text:document.getElementById("ready").textContent})'
        )
      )
      expect(JSON.parse(result)).toEqual({ title: 'e2e', text: 'ready' })
    } finally {
      cleanup()
    }
  })

  test('reports native scroll offsets after scrolling a long page', async () => {
    try {
      const observation = await renderWebView({
        source: { uri: `${E2E_BASE}/long` },
      })
      const ref = await loaded(observation)
      const result = await bounded(
        ref.evaluateJavaScript('window.scrollTo(0,240); window.scrollY')
      )
      expect(JSON.parse(result)).toBe(240)
      const scale = Platform.OS === 'android' ? PixelRatio.get() : 1
      await waitFor(() => {
        expect(
          (observation.scrolls.at(-1)?.contentOffset.y ?? -1) / scale
        ).toBeGreaterThan(0)
      }, WAIT)
      const first = observation.scrolls.at(-1)!.contentOffset
      expect(first.x).toBe(0)
      expect(
        JSON.parse(
          await bounded(
            ref.evaluateJavaScript('window.scrollTo(0,480); window.scrollY')
          )
        )
      ).toBe(480)
      // iOS adjusts absolute offsets for safe areas; the native delta must match CSS movement.
      await waitFor(() => {
        const offset = observation.scrolls.at(-1)?.contentOffset
        expect(offset?.x).toBe(0)
        expect(((offset?.y ?? -1) - first.y) / scale).toBeCloseTo(240, 0)
      }, WAIT)
      expect(observation.errors).toEqual([])
    } finally {
      cleanup()
    }
  })

  test('loads HTML and runs before-content and after-load injection', async () => {
    try {
      const observation = await renderWebView({
        source: {
          html: '<!DOCTYPE html><title>inline fixture</title><script>window.observedBefore = window.beforeInjection</script>',
          baseUrl: `${E2E_BASE}/`,
        },
        injectedJavaScriptBeforeContentLoaded:
          'window.beforeInjection = "before";',
        injectedJavaScript:
          'window.afterInjection = "after"; window.ReactNativeWebView.postMessage("injected"); true;',
      })
      const ref = await loaded(observation)
      await waitFor(
        () => expect(observation.messages).toContain('injected'),
        WAIT
      )
      const result = await bounded(
        ref.evaluateJavaScript(
          '({title:document.title,before:window.observedBefore,after:window.afterInjection})'
        )
      )
      expect(JSON.parse(result)).toEqual({
        title: 'inline fixture',
        before: 'before',
        after: 'after',
      })
    } finally {
      cleanup()
    }
  })
})
