import React, { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
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

const USER_AGENT_SOURCE: WebViewSource = {
  uri: 'https://httpbin.org/user-agent',
}

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
    <View style={styles.root}>
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

      <DemoTabs
        controls={
          <>
            <SectionLabel text="User-Agent demo" />
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
              configured value shown in Results.
            </Text>
          </>
        }
        results={
          <>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>userAgent:</Text>
              <Text style={styles.statusValue}>
                {userAgent || 'platform default'}
              </Text>
            </View>
            <StatusBanner
              status="eval"
              title="Observed navigation"
              body={`URL: ${navState.url || '(not reported)'}\nTitle: ${navState.title || '(empty)'}\nLoading: ${navState.loading}\nThe server response remains visible in the WebView above.`}
              bodyNumberOfLines={0}
            />
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

export default UserAgentDemo
