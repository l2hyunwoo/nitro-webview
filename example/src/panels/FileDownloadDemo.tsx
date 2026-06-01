/**
 * FileDownloadDemo panel — modularized "File download demo" screen.
 *
 * Migrated from the inline section in the original `example/App.tsx`:
 *   - the `DOWNLOAD_URL` constant pointing at a W3C-hosted PDF that
 *     reliably returns `Content-Disposition: attachment`
 *   - the `DOWNLOAD_SOURCE` WebViewSource constant wrapping that URL
 *   - the `lastDownload` useState slot tracking the most recent
 *     `FileDownload` payload reported by `onFileDownload`
 *   - the `handleFileDownload` callback that:
 *       * stores the event on `lastDownload`
 *       * downloads the bytes via `@dr.pogodin/react-native-fs` to the
 *         OS Downloads folder (Android) or Documents folder (iOS) so
 *         the saved file is observable to the user
 *       * appends the resolved on-disk path (or an error string) back
 *         into `lastDownload.fileName`
 *   - the SectionLabel + last-download status row + single-button
 *     "Load PDF (triggers download)" toolbar + hint text
 *
 * Per the Seed contract this panel owns its own NitroWebView mount
 * (initially pointed at the demo PDF so opening the panel immediately
 * triggers the platform's download flow) and uses shared chrome
 * primitives (NavToolbar, SectionLabel, StatusBanner, ToolbarButton)
 * plus tokens from `theme.ts`. Existing demo behavior, HTML literals,
 * and callback wiring are migrated intact rather than rewritten.
 */

import React, { useRef, useState } from 'react'
import { Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native'
import * as RNFS from '@dr.pogodin/react-native-fs'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  FileDownload,
  FileDownloadEvent,
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

// A public PDF that reliably returns Content-Disposition: attachment
const DOWNLOAD_URL =
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
const DOWNLOAD_SOURCE: WebViewSource = { uri: DOWNLOAD_URL }

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function FileDownloadDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(DOWNLOAD_SOURCE)
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

  // Download demo state — migrated verbatim from App.tsx.
  const [lastDownload, setLastDownload] = useState<FileDownload | null>(null)

  // Migrated verbatim from App.tsx's `handleFileDownload`. Records the
  // event, then downloads the bytes via RNFS so the saved file is
  // observable to the user. Android short-circuits navigation before
  // bytes flow and iOS WKWebView delivers this event before any save,
  // so the same fetch+write is correct for both platforms.
  const handleFileDownload = callback(async (event: FileDownloadEvent) => {
    const ev = event.nativeEvent
    setLastDownload(ev)
    try {
      const fileName = ev.fileName ?? `download-${Date.now()}`
      const dest =
        Platform.OS === 'android'
          ? `${RNFS.DownloadDirectoryPath}/${fileName}`
          : `${RNFS.DocumentDirectoryPath}/${fileName}`
      await RNFS.downloadFile({ fromUrl: ev.url, toFile: dest }).promise
      setLastDownload({ ...ev, fileName: `${fileName} (saved to ${dest})` })
    } catch (e) {
      setLastDownload({
        ...ev,
        fileName: `${ev.fileName ?? 'download'} (save error: ${String(e)})`,
      })
    }
  })

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>File download demo</Text>
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
        onFileDownload={handleFileDownload}
      />

      <View style={styles.controls}>
        <SectionLabel text="File download demo" />
        {lastDownload ? (
          <View style={styles.downloadRow}>
            <Text style={styles.downloadLabel}>last download:</Text>
            <Text style={styles.downloadValue} numberOfLines={2}>
              {lastDownload.fileName ?? '(no filename)'}{' '}
              ({lastDownload.mimeType ?? 'unknown mime'},{' '}
              {lastDownload.contentLength != null
                ? lastDownload.contentLength + ' bytes'
                : 'size unknown'})
            </Text>
          </View>
        ) : (
          <View style={styles.downloadRow}>
            <Text style={styles.downloadLabel}>last download:</Text>
            <Text style={styles.downloadValue}>none yet</Text>
          </View>
        )}
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Load PDF (triggers download)"
            onPress={() => {
              setLastError(null)
              setLastDownload(null)
              setSource(DOWNLOAD_SOURCE)
            }}
          />
        </View>
        <Text style={styles.hint}>
          onFileDownload fires; row above updates with fileName + contentLength
        </Text>
      </View>
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
    paddingBottom: spacing.xl5,
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.xxs,
    gap: spacing.md,
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  downloadLabel: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
    fontWeight: '600',
  },
  downloadValue: {
    flex: 1,
    fontSize: fontSize.xs,
    color: color.textPrimary,
    fontFamily: fontFamily.mono,
    backgroundColor: color.downloadHighlightBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    borderRadius: radii.xs,
  },
  hint: {
    fontSize: fontSize.xxs,
    color: color.textTertiary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    fontStyle: 'italic',
  },
})

export default FileDownloadDemo
