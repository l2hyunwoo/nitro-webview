import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewMethods,
  WebViewMessageEvent,
  WebViewNavigationState,
} from 'nitro-webview'
import { DemoTabs } from '../components/DemoTabs'
import { NavToolbar } from '../components/NavToolbar'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import { color, fontSize, spacing } from '../components/theme'
import { BRIDGE_INJECTION, BRIDGE_PAYLOAD, BRIDGE_SOURCE } from './demoFixtures'

export function JSBridgeDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [ready, setReady] = useState(false)
  const [nav, setNav] = useState<WebViewNavigationState>({
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const [result, setResult] = useState({
    ok: true,
    title: 'Bridge',
    body: 'Waiting for the page listener…',
  })
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current)
    },
    []
  )

  const handleMessage = callback((event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data
    try {
      const message = JSON.parse(data)
      if (message.type === 'ready') {
        setReady(true)
        setResult({
          ok: true,
          title: 'Page listener ready',
          body: `Document-start shim observed: ${String(
            message.early
          )}. Android older WebViews can race the first page script.`,
        })
        return
      }
      if (message.type === 'echo') {
        if (pending.current) clearTimeout(pending.current)
        pending.current = null
        const matches = message.data === BRIDGE_PAYLOAD
        setResult({
          ok: matches,
          title: matches ? 'Round trip matched exactly' : 'Round trip mismatch',
          body: String(message.data),
        })
        return
      }
    } catch {
      /* Plain web-to-native messages are also valid. */
    }
    setResult({ ok: true, title: 'Web → native message', body: data })
  })

  const reload = () => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    setReady(false)
    setResult({
      ok: true,
      title: 'Reloading',
      body: 'Waiting for the page listener…',
    })
    ref.current?.reload()
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>JavaScript bridge</Text>
        <Text style={styles.hint}>
          Web messages, native echo, evaluation and injection
        </Text>
      </View>
      <NavToolbar
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        loading={nav.loading}
        onBack={() => ref.current?.goBack()}
        onForward={() => ref.current?.goForward()}
        onReload={reload}
      />
      <NitroWebView
        style={styles.webview}
        source={BRIDGE_SOURCE}
        injectedJavaScriptBeforeContentLoaded="window.nitroEarly = 'installed'; true;"
        injectedJavaScript={BRIDGE_INJECTION}
        hybridRef={callback((value: NitroWebViewMethods) => {
          ref.current = value
        })}
        onMessage={handleMessage}
        onNavigationStateChange={callback(setNav)}
        onError={callback(event =>
          setResult({
            ok: false,
            title: 'WebView error',
            body: event.nativeEvent.description,
          })
        )}
      />
      <DemoTabs
        controls={
          <>
            <View style={styles.row}>
              <ToolbarButton
                label="Native → web → native"
                disabled={!ready}
                onPress={() => {
                  if (!ref.current) return
                  if (pending.current) clearTimeout(pending.current)
                  setResult({
                    ok: true,
                    title: 'Awaiting echo',
                    body: BRIDGE_PAYLOAD,
                  })
                  pending.current = setTimeout(() => {
                    pending.current = null
                    setResult({
                      ok: false,
                      title: 'Echo timed out',
                      body: 'No matching web response within 3 seconds. Reload and retry.',
                    })
                  }, 3000)
                  try {
                    ref.current.postMessage(BRIDGE_PAYLOAD)
                  } catch (error) {
                    clearTimeout(pending.current)
                    pending.current = null
                    setResult({
                      ok: false,
                      title: 'postMessage failed',
                      body: String(error),
                    })
                  }
                }}
              />
            </View>
            <View style={styles.row}>
              <ToolbarButton
                label="Evaluate JS"
                disabled={!ready}
                onPress={async () => {
                  try {
                    const value = await ref.current!.evaluateJavaScript(
                      '({title:document.title,width:window.innerWidth,early:window.earlyInjectionObserved})'
                    )
                    setResult({
                      ok: true,
                      title: 'evaluateJavaScript result',
                      body: JSON.stringify(JSON.parse(value)),
                    })
                  } catch (error) {
                    setResult({
                      ok: false,
                      title: 'Evaluation rejected',
                      body: String(error),
                    })
                  }
                }}
              />
              <ToolbarButton
                label="Inject visible change"
                disabled={!ready}
                onPress={() => {
                  ref.current?.injectJavaScript(
                    "document.getElementById('received').textContent='injectJavaScript changed this text'; true;"
                  )
                  setResult({
                    ok: true,
                    title: 'Injection requested',
                    body: 'Check the page text. injectJavaScript has no completion callback.',
                  })
                }}
              />
            </View>
            <Text style={styles.hint}>
              Echo compares quotes, a newline, backslash, Korean, emoji and
              script-like text. Listeners are installed on window (iOS) and
              document (Android).
            </Text>
          </>
        }
        results={
          <StatusBanner
            status={result.ok ? 'eval' : 'error'}
            title={result.title}
            body={result.body}
            bodyNumberOfLines={0}
            monospaceBody
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.appBackground },
  header: { padding: spacing.xl3, backgroundColor: color.headerBackground },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: color.headerText },
  hint: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  webview: { flex: 1, minHeight: 120 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.base,
  },
})

export default JSBridgeDemo
