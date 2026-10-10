import React, { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView, wrapWithOriginWhitelist } from 'nitro-webview'
import type {
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  ShouldStartLoadRequest,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'

import { DemoTabs } from '../components/DemoTabs'
import { NavToolbar } from '../components/NavToolbar'
import { SectionLabel } from '../components/SectionLabel'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import {
  color,
  fontFamily,
  fontSize,
  radii,
  spacing,
} from '../components/theme'

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

  const [blockedHosts] = useState<string[]>(['example.org'])
  const [lastDecision, setLastDecision] = useState<{
    url: string
    allowed: boolean
    at: number
  } | null>(null)

  const handleShouldStartLoad = callback(
    wrapWithOriginWhitelist((event: ShouldStartLoadRequest) => {
      const u = new URL(event.url)
      const blocked = blockedHosts.some(
        h => u.hostname === h || u.hostname.endsWith('.' + h)
      )
      setLastDecision({ url: event.url, allowed: !blocked, at: Date.now() })
      return !blocked
    })
  )

  return (
    <View style={styles.root}>
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

      <DemoTabs
        controls={
          <>
            <SectionLabel text="Navigation interception demo" />
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
              Tap &quot;Open nav demo page&quot;, then in the WebView tap the
              Allow or Block link. example.com is allowed; example.org is
              blocked silently (the WebView stays on the demo page). This
              callback checks only delivered navigation events. It does not
              cover initial source, Android POST requests, subresources, or
              message origins, and is not a network ACL.
            </Text>
          </>
        }
        results={
          <>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>last decision:</Text>
              <Text style={styles.statusValue}>
                {lastDecision
                  ? `${lastDecision.url} — ${
                      lastDecision.allowed ? 'ALLOWED' : 'BLOCKED'
                    } (${new Date(lastDecision.at).toLocaleTimeString()})`
                  : 'no decisions yet'}
              </Text>
            </View>
            {lastError ? (
              <StatusBanner
                status="error"
                title={`onError fired (${lastError.domain} ${lastError.code})`}
                body={`${lastError.description}\n${lastError.url || '(no url)'}`}
                bodyNumberOfLines={0}
              />
            ) : null}
          </>
        }
      />
    </View>
  )
}

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
    color: color.headerText,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: color.headerMuted,
    marginTop: spacing.xxs,
  },
  pageTitle: {
    fontSize: fontSize.sm,
    color: color.headerSecondary,
    marginTop: spacing.xs,
    fontWeight: '500',
  },
  webview: { flex: 1 },
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
