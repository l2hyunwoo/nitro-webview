/**
 * HeadersDemo panel — modularized "Headers demo" screen.
 *
 * Migrated from the inline section in the original `example/App.tsx`:
 *   - the HTTPBIN_SOURCE / HEADERS_SOURCE WebViewSource constants
 *   - the SectionLabel + two-button toolbar ("Open httpbin", "Send with
 *     headers")
 *   - the hint text describing the expected request headers
 *
 * Per the Seed contract this panel owns its own NitroWebView mount with
 * `defaultHeaders` set to the global { 'X-Nitro-Default': 'global',
 * 'X-Nitro-Test': 'default-loses' } pair so that the per-request
 * `X-Nitro-Test: per-request` override is observable when the user taps
 * "Send with headers". Existing demo behavior, HTML literals, and
 * callback wiring are migrated intact rather than rewritten.
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
import { color, fontSize, spacing } from '../components/theme'

// ---------------------------------------------------------------------------
// Static sources — migrated verbatim from example/App.tsx
// ---------------------------------------------------------------------------

const HTTPBIN_SOURCE: WebViewSource = { uri: 'https://httpbin.org' }

const HEADERS_SOURCE: WebViewSource = {
  uri: 'https://httpbin.org/headers',
  headers: { 'X-Nitro-Test': 'per-request' },
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function HeadersDemo() {
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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Headers demo</Text>
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
        defaultHeaders={{
          'X-Nitro-Default': 'global',
          'X-Nitro-Test': 'default-loses',
        }}
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
        <SectionLabel text="Headers demo" />
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Open httpbin"
            onPress={() => {
              setLastError(null)
              setSource(HTTPBIN_SOURCE)
            }}
          />
          <ToolbarButton
            label="Send with headers"
            onPress={() => {
              setLastError(null)
              setSource(HEADERS_SOURCE)
            }}
          />
        </View>
        <Text style={styles.hint}>
          Expected: X-Nitro-Default: global • X-Nitro-Test: per-request (not
          &quot;default-loses&quot;)
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

export default HeadersDemo
