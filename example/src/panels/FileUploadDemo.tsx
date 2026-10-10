import React, { useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  WebViewMessageEvent,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'

import { DemoTabs } from '../components/DemoTabs'
import { NavToolbar } from '../components/NavToolbar'
import { SectionLabel } from '../components/SectionLabel'
import { StatusBanner } from '../components/StatusBanner'
import { ToolbarButton } from '../components/ToolbarButton'
import { color, fontSize, radii, spacing } from '../components/theme'

const UPLOAD_SOURCE: WebViewSource = {
  // Android WebView blocks `<input type="file">` on null-origin pages (the
  // default for HTML loaded without a base URL). Pin a real https origin so
  // WebKit forwards the chooser to our WebChromeClient.
  baseUrl: 'https://nitro-webview.local/',
  html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,sans-serif;padding:24px;}input{display:block;margin:12px 0;padding:8px;width:90%;border:1px solid #ccc;border-radius:6px;}pre{background:#f1f5f9;padding:12px;border-radius:6px;font-size:13px;white-space:pre-wrap;word-break:break-all;}#previews{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}#previews img{max-width:120px;max-height:120px;border-radius:6px;border:1px solid #ddd;object-fit:cover;}</style></head><body>
<h2>File upload demo</h2>
<input type="file" accept="image/*" id="single"/>
<input type="file" multiple id="multi"/>
<div id="previews"></div>
<pre id="out">Pick a file above…</pre>
<script>
  function fmt(f) { return f.name + ' (' + f.size + ' bytes, ' + (f.type || 'unknown') + ')'; }
  function renderPreview(file) {
    if (!file.type || file.type.indexOf('image/') !== 0) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = document.createElement('img');
      img.src = e.target.result;
      img.alt = file.name;
      document.getElementById('previews').appendChild(img);
    };
    reader.readAsDataURL(file);
  }
  function report(label, files){
    var lines=[label];
    for (var i=0;i<files.length;i++) { lines.push('  '+fmt(files[i])); renderPreview(files[i]); }
    document.getElementById('out').textContent += '\\n' + lines.join('\\n');
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(label + ' x ' + files.length);
  }
  document.getElementById('single').addEventListener('change', function(e){ report('single', e.target.files); });
  document.getElementById('multi').addEventListener('change', function(e){ report('multi', e.target.files); });
</script>
</body></html>`,
}

export function FileUploadDemo() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(UPLOAD_SOURCE)
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

  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  const handleMessage = callback((event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data
    if (data.startsWith('single') || data.startsWith('multi')) {
      setUploadStatus('upload event: ' + data)
    }
  })

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>File upload demo</Text>
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
        onMessage={handleMessage}
      />

      <DemoTabs
        controls={
          <>
            <SectionLabel text="File upload demo" />
            <View style={styles.toolbar}>
              <ToolbarButton
                label="Open upload page"
                onPress={() => {
                  setLastError(null)
                  setUploadStatus(null)
                  setSource(UPLOAD_SOURCE)
                }}
              />
            </View>
            <Text style={styles.hint}>
              Tap an input in the WebView and pick a file, then open Results.
              Image previews remain visible in the page above.
            </Text>
          </>
        }
        results={
          <>
            {uploadStatus ? (
              <View style={styles.uploadPill}>
                <Text style={styles.uploadPillText}>{uploadStatus}</Text>
              </View>
            ) : (
              <Text style={styles.hint}>No file selection reported yet.</Text>
            )}
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
  uploadPill: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    backgroundColor: color.uploadPillBackground,
    borderColor: color.uploadPillBorder,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl2,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  uploadPillText: {
    fontSize: fontSize.xs,
    color: color.uploadPillText,
    fontWeight: '600',
  },
  hint: {
    fontSize: fontSize.xxs,
    color: color.textTertiary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    fontStyle: 'italic',
  },
})

export default FileUploadDemo
