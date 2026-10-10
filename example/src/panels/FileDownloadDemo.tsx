import React, { useRef, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  FileDownloadEvent,
  NitroWebViewMethods,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'
import { DemoTabs } from '../components/DemoTabs'
import { NavToolbar } from '../components/NavToolbar'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import { color, fontSize, spacing } from '../components/theme'
import { DOWNLOAD_SOURCE } from './demoFixtures'
import { inspectDownload } from './downloadResult'

const DOWNLOAD_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8099/download'
    : 'http://localhost:8099/download'

export function FileDownloadDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(DOWNLOAD_SOURCE)
  const [nav, setNav] = useState<WebViewNavigationState>({
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const [result, setResult] = useState({
    ok: true,
    title: 'No download yet',
    body: 'Tap Download text Blob inside the page.',
  })
  const handleFileDownload = callback(async (event: FileDownloadEvent) => {
    const download = event.nativeEvent
    setResult({
      ok: true,
      title: 'onFileDownload received',
      body: `${download.fileName || 'download'} · ${
        download.mimeType || 'unknown MIME'
      }\nInspecting returned bytes…`,
    })
    try {
      setResult({
        ok: true,
        title: 'Downloaded bytes inspected',
        body: await inspectDownload(download),
      })
    } catch (error) {
      setResult({
        ok: false,
        title: 'Download inspection failed',
        body: String(error),
      })
    }
  })

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>File downloads</Text>
        <Text style={styles.hint}>
          Offline Blob and optional HTTP attachment
        </Text>
      </View>
      <NavToolbar
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        loading={nav.loading}
        onBack={() => ref.current?.goBack()}
        onForward={() => ref.current?.goForward()}
        onReload={() => ref.current?.reload()}
      />
      <NitroWebView
        style={styles.webview}
        source={source}
        hybridRef={callback((value: NitroWebViewMethods) => {
          ref.current = value
        })}
        onNavigationStateChange={callback(setNav)}
        onFileDownload={handleFileDownload}
        onError={callback(event =>
          setResult({
            ok: false,
            title: `Error: ${event.nativeEvent.domain}`,
            body: event.nativeEvent.description,
          })
        )}
        onHttpError={callback(event =>
          setResult({
            ok: false,
            title: `HTTP ${event.nativeEvent.statusCode}`,
            body: 'Start the local fixture server before loading the attachment.',
          })
        )}
      />
      <DemoTabs
        controls={
          <>
            <View style={styles.row}>
              <ToolbarButton
                label="Local Blob page"
                onPress={() => {
                  if (source === DOWNLOAD_SOURCE) ref.current?.reload()
                  else setSource(DOWNLOAD_SOURCE)
                }}
              />
              <ToolbarButton
                label="HTTP attachment"
                onPress={() => {
                  setSource({ uri: DOWNLOAD_URL })
                  setResult({
                    ok: true,
                    title: 'Waiting for HTTP download',
                    body: DOWNLOAD_URL,
                  })
                }}
              />
            </View>
            <Text style={styles.hint}>
              For HTTP, run node example/e2e-server.mjs from the repository
              root. The URL above targets the iOS simulator or Android emulator.
              Physical devices need host routing (Android: adb reverse tcp:8099
              tcp:8099 and a localhost URL).
            </Text>
            <Text style={styles.hint}>
              iOS Blob files and Android Blob data are inspected directly. HTTP
              events contain metadata, so this demo fetches once into
              app-private cache. Files are read (up to 256 bytes), measured and
              removed; no public Downloads permission is needed. Use these text
              fixtures, not authenticated downloads requiring cookies.
            </Text>
          </>
        }
        results={
          <StatusBanner
            status={result.ok ? 'eval' : 'error'}
            title={result.title}
            body={result.body}
            bodyNumberOfLines={0}
            monospaceBody
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.appBackground },
  header: { padding: spacing.xl3, backgroundColor: color.headerBackground },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: color.headerText },
  hint: {
    fontSize: fontSize.xs,
    color: color.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    lineHeight: 18,
  },
  webview: { flex: 1, minHeight: 120 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.base,
  },
})

export default FileDownloadDemo
