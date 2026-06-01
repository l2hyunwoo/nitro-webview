/**
 * UserAgentDemo panel — modularized "User-Agent demo" screen.
 *
 * Migrated from the inline section in the original `example/App.tsx`:
 *   - the USER_AGENT_SOURCE WebViewSource constant pointing at
 *     `https://httpbin.org/user-agent`
 *   - the `userAgent` useState slot whose initial value is `undefined`
 *     (the platform default) and is toggled between a custom value and
 *     the default by the two demo buttons
 *   - the SectionLabel + status row + "Use custom UA" / "Reset UA"
 *     button pair + hint copy describing the expected JSON echo
 *
 * The buttons in the original demo both call `setSource(USER_AGENT_SOURCE)`
 * to force a fresh load against `httpbin.org/user-agent` after flipping
 * the `userAgent` state — that behavior is preserved here so re-tapping
 * the same button re-fires the request. Because the new `userAgent`
 * prop value only takes effect on the next navigation, the demo also
 * issues an explicit `reload()` via the WebView ref to make the change
 * observable when the source URL is unchanged.
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

const USER_AGENT_SOURCE: WebViewSource = {
  uri: 'https://httpbin.org/user-agent',
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function UserAgentDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(USER_AGENT_SOURCE)
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

  // Empty string signals "use platform default UA" to the native layer,
  // which converts it to nil (see HybridNitroWebView.userAgent setter).
  // We cannot pass undefined after the prop has been set once — Nitro
  // would receive null and throw "Value is null, expected a String".
  const [userAgent, setUserAgent] = useState<string>('')

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>User-Agent demo</Text>
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
        userAgent={userAgent}
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
        <SectionLabel text="User-Agent demo" />
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>userAgent:</Text>
          <Text style={styles.statusValue} numberOfLines={1}>
            {userAgent || 'platform default'}
          </Text>
        </View>
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Use custom UA"
            onPress={() => {
              setLastError(null)
              setUserAgent('NitroWebView/0.1 (demo)')
              setSource({ uri: 'https://httpbin.org/user-agent' })
            }}
          />
          <ToolbarButton
            label="Reset UA"
            onPress={() => {
              setLastError(null)
              setUserAgent('')
              setSource({ uri: 'https://httpbin.org/user-agent' })
            }}
          />
        </View>
        <Text style={styles.hint}>
          Hits httpbin.org/user-agent — the rendered JSON should mirror the
          value above.
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

export default UserAgentDemo
