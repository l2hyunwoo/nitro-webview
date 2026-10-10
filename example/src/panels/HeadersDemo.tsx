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
import { color, fontSize, spacing } from '../components/theme'

const HTTPBIN_SOURCE: WebViewSource = { uri: 'https://httpbin.org' }

const HEADERS_SOURCE: WebViewSource = {
  uri: 'https://httpbin.org/headers',
  headers: { 'x-nitro-test': 'per-request' },
}

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
    <View style={styles.root}>
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

      <DemoTabs
        controls={
          <>
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
              Expected: X-Nitro-Default: global • x-nitro-test: per-request.
              Header names are case-insensitive. Duplicate names within one map
              reject the source.
            </Text>
          </>
        }
        results={
          <>
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
