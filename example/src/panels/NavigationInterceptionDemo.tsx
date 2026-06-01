/**
 * NavigationInterceptionDemo panel — modularized "Navigation
 * interception demo" screen.
 *
 * Migrated from the inline section in the original `example/App.tsx`:
 *   - the NAV_DEMO_SOURCE WebViewSource constant with its two real
 *     `<a href>` links so user-initiated navigation flows through
 *     Android's WebViewClient.shouldOverrideUrlLoading hook (a
 *     programmatic `view.loadUrl(...)` would bypass that hook on
 *     Android, while iOS WKWebView fires decidePolicyFor for every
 *     navigation including programmatic ones).
 *   - the `blockedHosts` state seeded with `['example.org']`
 *   - the `handleShouldStartLoad` callback wired through
 *     `onShouldStartLoadWithRequest`
 *   - the `lastDecision` state used to surface the most recent allow /
 *     block verdict in the chrome below the WebView
 *   - the SectionLabel + status row + "Open nav demo page" button + hint
 *     copy describing the cross-platform caveats
 *
 * Per the Seed contract this panel owns its own NitroWebView mount and
 * uses shared chrome primitives (NavToolbar, SectionLabel, StatusBanner,
 * ToolbarButton) plus tokens from `theme.ts`. Existing demo behavior,
 * HTML literals, and callback wiring are migrated intact rather than
 * rewritten.
 */

import React, { useRef, useState } from 'react'
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  ShouldStartLoadRequest,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'

import { NavToolbar } from '../components/NavToolbar'
import { SectionLabel } from '../components/SectionLabel'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import { color, fontFamily, fontSize, radii, spacing } from '../components/theme'

// ---------------------------------------------------------------------------
// Static sources — migrated verbatim from example/App.tsx
// ---------------------------------------------------------------------------

/**
 * Navigation-interception demo page. Hosts two real `<a href>` links so
 * the user-initiated navigation flows through Android's
 * `WebViewClient.shouldOverrideUrlLoading` — a programmatic
 * `view.loadUrl(...)` (the path `setSource(...)` takes) bypasses that hook
 * on Android, while iOS WKWebView fires `decidePolicyFor` for every
 * navigation including programmatic ones.
 */
const NAV_DEMO_SOURCE: WebViewSource = {
  baseUrl: 'https://nitro-webview.local/',
  html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;padding:24px;line-height:1.5;}a{display:inline-block;padding:12px 18px;margin:8px 8px 0 0;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;}a.block{background:#dc2626;}p{color:#475569;}</style></head><body>
<h2>Navigation interception demo</h2>
<p>Tap a link. The native hook decides whether the navigation is allowed.</p>
<a href="https://example.com/">Allow (example.com)</a>
<a class="block" href="https://example.org/">Block (example.org)</a>
</body></html>`,
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function NavigationInterceptionDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(NAV_DEMO_SOURCE)
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

  // Navigation interception demo state — migrated verbatim from App.tsx.
  const [blockedHosts] = useState<string[]>(['example.org'])
  const [lastDecision, setLastDecision] = useState<{
    url: string
    allowed: boolean
    at: number
  } | null>(null)

  const handleShouldStartLoad = callback((event: ShouldStartLoadRequest) => {
    const u = new URL(event.url)
    const blocked = blockedHosts.some(
      h => u.hostname === h || u.hostname.endsWith('.' + h)
    )
    setLastDecision({ url: event.url, allowed: !blocked, at: Date.now() })
    return !blocked
  })

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Navigation interception demo</Text>
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

      <NitroWebView
        style={styles.webview}
        source={source}
        hybridRef={callback((r: NitroWebViewMethods) => {
          ref.current = r
        })}
        onNavigationStateChange={callback((state: WebViewNavigationState) => {
          setNavState(state)
        })}
        onError={callback((event: NitroWebViewErrorEvent) => {
          setLastError(event.nativeEvent)
        })}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
      />

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        <SectionLabel text="Navigation interception demo" />
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>last decision:</Text>
          <Text style={styles.statusValue} numberOfLines={2}>
            {lastDecision
              ? `${lastDecision.url} — ${lastDecision.allowed ? 'ALLOWED' : 'BLOCKED'} (${new Date(lastDecision.at).toLocaleTimeString()})`
              : 'no decisions yet'}
          </Text>
        </View>
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Open nav demo page"
            onPress={() => {
              setLastError(null)
              setSource(NAV_DEMO_SOURCE)
            }}
          />
        </View>
        <Text style={styles.hint}>
          Tap &quot;Open nav demo page&quot;, then in the WebView tap the green
          or red link. example.com is allowed; example.org is blocked silently
          (the WebView stays on the demo page). Android requires user-initiated
          taps — programmatic loads bypass `shouldOverrideUrlLoading`.
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  statusLabel: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
    fontWeight: '600',
  },
  statusValue: {
    flex: 1,
    fontSize: fontSize.xs,
    color: color.textPrimary,
    fontFamily: fontFamily.mono,
    backgroundColor: color.buttonBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: radii.xs,
  },
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

export default NavigationInterceptionDemo
