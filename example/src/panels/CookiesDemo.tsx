/**
 * CookiesDemo panel — modularized "Cookies demo" screen.
 *
 * Migrated from the inline section in the original `example/App.tsx`:
 *   - the `cookies` / `cookieStatus` useState slots tracking the
 *     last-known cookie jar for `https://httpbin.org` and a short
 *     human-readable status string
 *   - the SectionLabel + status row + "Set cookie" / "Get cookies" /
 *     "Clear cookies" three-button toolbar
 *   - the per-cookie list row (`cookies.slice(0, 3).map(...)`) capped
 *     at three entries with an "…+N more" overflow line
 *   - the inline async handlers wiring `ref.current.setCookie(...)`,
 *     `ref.current.getCookies(...)`, and `ref.current.clearCookies()`
 *     against the same `https://httpbin.org` origin
 *
 * Each handler mutates `cookieStatus` and (where applicable) `cookies`
 * exactly as the original demo did, including the error fallbacks
 * (`'set error: ' + String(e)`, `'get error: ...'`, `'clear error: ...'`),
 * the no-ref guard (`if (!r) { setCookieStatus('no ref'); return }`),
 * and the empty / non-empty rendering paths.
 *
 * Per the Seed contract this panel owns its own NitroWebView mount
 * (pointed at `https://httpbin.org` so the cookie-jar origin is
 * actually visited and visible) and uses shared chrome primitives
 * (NavToolbar, SectionLabel, StatusBanner, ToolbarButton) plus tokens
 * from `theme.ts`. Existing demo behavior, HTML literals, and callback
 * wiring are migrated intact rather than rewritten.
 */

import React, { useRef, useState } from 'react'
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  Cookie,
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
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

const HTTPBIN_SOURCE: WebViewSource = { uri: 'https://httpbin.org' }

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function CookiesDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(HTTPBIN_SOURCE)
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

  // Cookies demo state — migrated verbatim from App.tsx.
  const [cookies, setCookies] = useState<Cookie[]>([])
  const [cookieStatus, setCookieStatus] = useState<string>('—')

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Cookies demo</Text>
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
      />

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        <SectionLabel text="Cookies demo" />
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>cookies for httpbin.org:</Text>
          <Text style={styles.statusValue} numberOfLines={1}>
            {cookieStatus}
          </Text>
        </View>
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Set cookie"
            onPress={async () => {
              const r = ref.current
              if (!r) {
                setCookieStatus('no ref')
                return
              }
              try {
                await r.setCookie('https://httpbin.org', {
                  name: 'nitro_demo',
                  value: 'hello-' + Date.now(),
                  domain: 'httpbin.org',
                  path: '/',
                  secure: false,
                  httpOnly: false,
                })
                setCookieStatus('set ✓')
              } catch (e) {
                setCookieStatus('set error: ' + String(e))
              }
            }}
          />
          <ToolbarButton
            label="Get cookies"
            onPress={async () => {
              const r = ref.current
              if (!r) {
                setCookieStatus('no ref')
                return
              }
              try {
                const result = await r.getCookies('https://httpbin.org')
                setCookies(result)
                if (result.length === 0) {
                  setCookieStatus('no cookies')
                } else {
                  setCookieStatus(
                    result.length +
                      ' cookie(s) — ' +
                      result[0].name +
                      '=' +
                      result[0].value,
                  )
                }
              } catch (e) {
                setCookieStatus('get error: ' + String(e))
              }
            }}
          />
          <ToolbarButton
            label="Clear cookies"
            onPress={async () => {
              const r = ref.current
              if (!r) {
                setCookieStatus('no ref')
                return
              }
              try {
                await r.clearCookies()
                const result = await r.getCookies('https://httpbin.org')
                setCookies(result)
                setCookieStatus(
                  result.length === 0
                    ? 'cleared — no cookies'
                    : result.length + ' remaining',
                )
              } catch (e) {
                setCookieStatus('clear error: ' + String(e))
              }
            }}
          />
        </View>
        {cookies.length > 0 ? (
          <View style={styles.cookieList}>
            {cookies.slice(0, 3).map((c, i) => (
              <Text key={i} style={styles.cookieItem} numberOfLines={1}>
                {c.name}={c.value}
              </Text>
            ))}
            {cookies.length > 3 ? (
              <Text style={styles.cookieItem}>
                …+{cookies.length - 3} more
              </Text>
            ) : null}
          </View>
        ) : null}
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
  cookieList: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    backgroundColor: color.buttonBackgroundDisabled,
    borderRadius: radii.sm,
    padding: spacing.base,
    gap: spacing.xxs,
  },
  cookieItem: {
    fontSize: fontSize.xs,
    color: color.textCookie,
    fontFamily: fontFamily.mono,
  },
})

export default CookiesDemo
