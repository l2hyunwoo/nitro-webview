import React, { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  Cookie,
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

const HTTPBIN_SOURCE: WebViewSource = { uri: 'https://httpbin.org' }

export function CookiesDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source] = useState<WebViewSource>(HTTPBIN_SOURCE)
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

  const [cookies, setCookies] = useState<Cookie[]>([])
  const [cookieStatus, setCookieStatus] = useState<string>('—')

  return (
    <View style={styles.root}>
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

      <DemoTabs
        controls={
          <>
            <SectionLabel text="Cookies demo" />
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
                          result[0].value
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
                        : result.length + ' remaining'
                    )
                  } catch (e) {
                    setCookieStatus('clear error: ' + String(e))
                  }
                }}
              />
            </View>
          </>
        }
        results={
          <>
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>cookies for httpbin.org:</Text>
              <Text style={styles.statusValue}>{cookieStatus}</Text>
            </View>
            {cookies.length > 0 ? (
              <View style={styles.cookieList}>
                {cookies.map((c, i) => (
                  <Text key={i} style={styles.cookieItem}>
                    {c.name}={c.value}
                  </Text>
                ))}
              </View>
            ) : null}
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
