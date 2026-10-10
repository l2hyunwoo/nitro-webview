import React, { useRef, useState } from 'react'
import { Platform, StyleSheet, Switch, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewMethods,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'
import { DemoTabs } from '../components/DemoTabs'
import { NavToolbar } from '../components/NavToolbar'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import { color, fontSize, spacing } from '../components/theme'
import { SETTINGS_SOURCE } from './demoFixtures'

const FIXTURE_BASE =
  Platform.OS === 'android' ? 'http://10.0.2.2:8099' : 'http://localhost:8099'

export function SettingsDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [javaScript, setJavaScript] = useState(true)
  const [domStorage, setDomStorage] = useState(true)
  const [scroll, setScroll] = useState(true)
  const [cache, setCache] = useState(true)
  const [source, setSource] = useState<WebViewSource>(SETTINGS_SOURCE)
  const [nav, setNav] = useState<WebViewNavigationState>({
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const [result, setResult] = useState({
    ok: true,
    title: 'Settings fixture',
    body: 'Use the page to observe JavaScript, storage, focus, scrolling and history.',
  })
  const run = async (
    method: 'clearCache' | 'clearHistory' | 'requestFocus'
  ) => {
    if (!ref.current) return
    try {
      await ref.current[method]()
      const detail =
        method === 'clearCache'
          ? 'Platform cache removal completed. Cookies, DOM storage and history are retained. Local HTML has no HTTP cache to measure; use Cache fixture and server request logs.'
          : method === 'clearHistory'
            ? Platform.OS === 'ios'
              ? 'Resolved: iOS clearHistory is a no-op. The Back button retains its history. Toggle JavaScript to remount a fresh view.'
              : 'Resolved: inspect the Back button and try Back; the current page should remain.'
            : 'Resolved: native focus was requested. This does not promise input focus or a keyboard. Tap the page input and verify typing / its focus label.'
      setResult({ ok: true, title: `${method} resolved`, body: detail })
    } catch (error) {
      setResult({
        ok: false,
        title: `${method} rejected`,
        body: String(error),
      })
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings & methods</Text>
        <Text
          style={styles.hint}
        >{`Loading: ${nav.loading} · Back: ${nav.canGoBack} · Forward: ${nav.canGoForward}`}</Text>
      </View>
      <NavToolbar
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        loading={nav.loading}
        onBack={() => ref.current?.goBack()}
        onForward={() => ref.current?.goForward()}
        onReload={() => ref.current?.reload()}
      />
      <NitroWebView
        key={String(javaScript)}
        style={styles.webview}
        source={source}
        javaScriptEnabled={javaScript}
        domStorageEnabled={domStorage}
        scrollEnabled={scroll}
        cacheEnabled={cache}
        hybridRef={callback((value: NitroWebViewMethods) => {
          ref.current = value
        })}
        onNavigationStateChange={callback(setNav)}
        onError={callback(event =>
          setResult({
            ok: false,
            title: `Error: ${event.nativeEvent.domain}`,
            body: event.nativeEvent.description,
          })
        )}
        onHttpError={callback(event =>
          setResult({
            ok: false,
            title: `HTTP ${event.nativeEvent.statusCode}`,
            body: event.nativeEvent.url,
          })
        )}
        onOpenWindow={callback(event =>
          setResult({
            ok: true,
            title: 'onOpenWindow received',
            body: `${event.nativeEvent.url}\nPopup is intercepted; a new window is not opened automatically.`,
          })
        )}
      />
      <DemoTabs
        controls={
          <>
            <View style={styles.toggle}>
              <Text style={styles.label}>JavaScript (remounts view)</Text>
              <Switch
                accessibilityLabel="JavaScript"
                value={javaScript}
                onValueChange={value => {
                  ref.current = null
                  setNav({
                    url: '',
                    title: '',
                    loading: false,
                    canGoBack: false,
                    canGoForward: false,
                  })
                  setJavaScript(value)
                }}
              />
            </View>
            <View style={styles.toggle}>
              <Text style={styles.label}>DOM storage (Android)</Text>
              <Switch
                accessibilityLabel="DOM storage"
                value={domStorage}
                onValueChange={setDomStorage}
                disabled={Platform.OS === 'ios'}
              />
            </View>
            <View style={styles.toggle}>
              <Text style={styles.label}>Scrolling (iOS)</Text>
              <Switch
                accessibilityLabel="Scrolling"
                value={scroll}
                onValueChange={setScroll}
                disabled={Platform.OS === 'android'}
              />
            </View>
            <View style={styles.toggle}>
              <Text style={styles.label}>HTTP cache</Text>
              <Switch
                accessibilityLabel="HTTP cache"
                value={cache}
                onValueChange={setCache}
              />
            </View>
            <Text style={styles.hint}>
              JavaScript changes remount to honor iOS initial-only configuration
              and reset history / input. iOS ignores DOM storage changes;
              Android ignores scrollEnabled. After toggling storage, tap the
              page storage probe. On iOS cacheEnabled affects the next source
              load only.
            </Text>
            <View style={styles.row}>
              <ToolbarButton
                label="Clear cache"
                onPress={() => run('clearCache')}
              />
              <ToolbarButton
                label="Clear history"
                onPress={() => run('clearHistory')}
              />
            </View>
            <View style={styles.row}>
              <ToolbarButton
                label="Request focus"
                onPress={() => run('requestFocus')}
              />
              <ToolbarButton
                label="Stop loading"
                disabled={!nav.loading}
                onPress={() => {
                  ref.current?.stopLoading()
                  setResult({
                    ok: true,
                    title: 'stopLoading requested',
                    body: 'Check Loading above and the page. Cancellation is not a successful load. For a visible in-flight request, use Slow fixture first.',
                  })
                }}
              />
            </View>
            <View style={styles.row}>
              <ToolbarButton
                label="Local page"
                onPress={() => setSource(SETTINGS_SOURCE)}
              />
              <ToolbarButton
                label="Slow fixture (8s)"
                onPress={() =>
                  setSource({ uri: `${FIXTURE_BASE}/slow?run=${Date.now()}` })
                }
              />
              <ToolbarButton
                label="Cache fixture"
                onPress={() => setSource({ uri: `${FIXTURE_BASE}/cache` })}
              />
            </View>
            <Text style={styles.hint}>
              HTTP fixtures are optional: run node example/e2e-server.mjs from
              the repository root. They use simulator / emulator host routing.
              Cache verification needs server request logs; Promise resolution
              alone does not prove a cache hit or native focus.
            </Text>
          </>
        }
        results={
          <StatusBanner
            status={result.ok ? 'eval' : 'error'}
            title={result.title}
            body={result.body}
            bodyNumberOfLines={0}
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
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.base,
    lineHeight: 18,
  },
  label: { flex: 1, color: color.textPrimary, fontSize: fontSize.sm },
  webview: { flex: 1, minHeight: 120 },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl3,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.base,
  },
})

export default SettingsDemo
