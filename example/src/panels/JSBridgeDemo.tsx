/**
 * JSBridgeDemo panel — modularized "postMessage bridge / Evaluate JS" screen.
 *
 * Migrated from the inline pieces in the original `example/App.tsx`:
 *   - the `BRIDGE_SOURCE` WebViewSource HTML literal hosting the
 *     `<button onclick="window.ReactNativeWebView.postMessage(...)">`
 *     bridge demo page
 *   - the `INJECTED_JS` userland script that tints the page background,
 *     stamps the status paragraph, and posts an auto-message back to RN
 *   - the `handleMessage` callback that updates `lastMessage` whenever
 *     the WebView calls `postMessage`
 *   - the "🧪 Evaluate JS" toolbar button + the `evalResult` state slot
 *     that captures the resolution/rejection of
 *     `ref.current.evaluateJavaScript(...)`
 *   - the green onMessage banner and the blue evaluateJavaScript
 *     banner (now rendered via the shared `StatusBanner` primitive)
 *
 * Per the Seed contract this panel owns its own NitroWebView mount
 * (pointed at `BRIDGE_SOURCE` with `injectedJavaScript={INJECTED_JS}`
 * so the bridge round-trip is observable) and uses shared chrome
 * primitives (NavToolbar, SectionLabel, StatusBanner, ToolbarButton)
 * plus tokens from `theme.ts`. Existing demo behavior, HTML literals,
 * and callback wiring are migrated intact rather than rewritten.
 */

import React, { useRef, useState } from 'react'
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  WebViewMessageEvent,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'

import { NavToolbar } from '../components/NavToolbar'
import { SectionLabel } from '../components/SectionLabel'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import { color, fontSize, spacing } from '../components/theme'

// ---------------------------------------------------------------------------
// Static sources — migrated verbatim from example/App.tsx
// ---------------------------------------------------------------------------

const BRIDGE_SOURCE: WebViewSource = {
  html: `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{font-family:-apple-system,sans-serif;padding:24px;}
button{font-size:18px;padding:12px 20px;margin-top:12px;}</style>
</head><body>
<h2>postMessage bridge</h2>
<p>Tap the button to call <code>window.ReactNativeWebView.postMessage</code>.</p>
<button id="b" onclick="window.ReactNativeWebView.postMessage('hello at ' + new Date().toISOString())">Send message</button>
<p id="status"></p>
</body></html>`,
}

const INJECTED_JS = `
  document.body.style.background = '#fff8e1';
  var s = document.getElementById('status');
  if (s) s.textContent = 'injectedJavaScript ran';
  setTimeout(function () {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage('auto-message from injectedJavaScript');
    }
  }, 250);
  true;
`

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function JSBridgeDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(BRIDGE_SOURCE)
  const [navState, setNavState] = useState<WebViewNavigationState>({
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const [lastError, setLastError] = useState<
    NitroWebViewErrorEvent['nativeEvent'] | null
  >(null)
  const [lastMessage, setLastMessage] = useState<
    WebViewMessageEvent['nativeEvent'] | null
  >(null)
  const [evalResult, setEvalResult] = useState<{
    ok: boolean
    value: string
  } | null>(null)

  // onMessage handler — migrated verbatim from App.tsx (the upload-event
  // branch is intentionally not part of this panel; uploads live in
  // FileUploadDemo and own their own onMessage handler).
  const handleMessage = callback((event: WebViewMessageEvent) => {
    setLastMessage(event.nativeEvent)
  })

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>JS bridge demo</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {navState.url || 'loading…'}
        </Text>
        {navState.title ? (
          <Text style={styles.pageTitle} numberOfLines={1}>
            {navState.title}
          </Text>
        ) : null}
      </View>

      <NavToolbar
        canGoBack={navState.canGoBack}
        canGoForward={navState.canGoForward}
        loading={navState.loading}
        onBack={() => ref.current?.goBack()}
        onForward={() => ref.current?.goForward()}
        onReload={() => ref.current?.reload()}
      />

      {lastError ? (
        <StatusBanner
          status="error"
          title={`onError fired (${lastError.domain} ${lastError.code})`}
          body={lastError.description}
          footer={lastError.url || '(no url)'}
        />
      ) : null}

      {lastMessage ? (
        <StatusBanner
          status="message"
          title="onMessage fired"
          body={lastMessage.data}
          footer={`from ${lastMessage.url || '(no url)'}`}
        />
      ) : null}

      {evalResult ? (
        <StatusBanner
          status={evalResult.ok ? 'eval' : 'error'}
          title={`evaluateJavaScript ${evalResult.ok ? 'resolved' : 'rejected'}`}
          body={evalResult.value}
          bodyNumberOfLines={3}
          monospaceBody={evalResult.ok}
        />
      ) : null}

      <NitroWebView
        style={styles.webview}
        source={source}
        injectedJavaScript={INJECTED_JS}
        hybridRef={callback((r: NitroWebViewMethods) => {
          ref.current = r
        })}
        onNavigationStateChange={callback((state: WebViewNavigationState) => {
          setNavState(state)
        })}
        onError={callback((event: NitroWebViewErrorEvent) => {
          setLastError(event.nativeEvent)
        })}
        onMessage={handleMessage}
      />

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        <SectionLabel text="postMessage bridge" />
        <View style={styles.toolbar}>
          <ToolbarButton
            label="📨 Reload bridge page"
            onPress={() => {
              setLastError(null)
              setLastMessage(null)
              setEvalResult(null)
              setSource(BRIDGE_SOURCE)
            }}
          />
        </View>
        <Text style={styles.hint}>
          Tap the button inside the WebView (or wait ~250ms for the injected
          script to auto-post) — the green banner above should fire.
        </Text>

        <SectionLabel text="Evaluate JS" />
        <View style={styles.toolbar}>
          <ToolbarButton
            label="🧪 Evaluate JS"
            onPress={async () => {
              const r = ref.current
              if (!r) return
              setEvalResult(null)
              try {
                const value = await r.evaluateJavaScript(
                  "JSON.stringify({ title: document.title, w: window.innerWidth })",
                )
                setEvalResult({ ok: true, value })
              } catch (e) {
                setEvalResult({ ok: false, value: String(e) })
              }
            }}
          />
        </View>
        <Text style={styles.hint}>
          Reads document.title and window.innerWidth from inside the WebView and
          renders the JSON in the blue banner above.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles — panel-local, tokens sourced from theme.ts
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.appBackground },
  header: {
    paddingHorizontal: spacing.xl3,
    paddingTop: spacing.xl2,
    paddingBottom: spacing.base,
    backgroundColor: color.headerBackground,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: color.textOnDark,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: color.textMutedOnDark,
    marginTop: spacing.xxs,
  },
  pageTitle: {
    fontSize: fontSize.sm,
    color: color.textSecondaryOnDark,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  webview: { flex: 1 },
  controls: {
    backgroundColor: color.appBackground,
    borderTopWidth: 2,
    borderTopColor: color.divider,
  },
  controlsContent: { paddingBottom: spacing.xl5 },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.xxs,
    gap: spacing.md,
  },
  hint: {
    fontSize: fontSize.xxs,
    color: color.textTertiary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    fontStyle: 'italic',
  },
})

export default JSBridgeDemo
