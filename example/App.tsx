import React, { useRef, useState } from 'react'
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import * as RNFS from '@dr.pogodin/react-native-fs'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  Cookie,
  FileDownload,
  FileDownloadEvent,
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  ShouldStartLoadRequest,
  WebViewMessageEvent,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'

// ---------------------------------------------------------------------------
// Static sources
// ---------------------------------------------------------------------------

const INITIAL_SOURCE: WebViewSource = { uri: 'https://example.com' }
const ERROR_SOURCE: WebViewSource = { uri: 'https://nonexistent.invalid' }
const BRIDGE_SOURCE: WebViewSource = {
  html: `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{font-family:-apple-system,sans-serif;padding:24px;}
button{font-size:18px;padding:12px 20px;margin-top:12px;}</style>
</head><body>
<h2>postMessage bridge</h2>
<p>Tap the button to call <code>window.ReactNativeWebView.postMessage</code>.</p>
<button id="b" onclick="window.ReactNativeWebView.postMessage('hello at ' + new Date().toISOString())">Send message</button>
<p id="status"></p>
</body></html>`,
}

const HTTPBIN_SOURCE: WebViewSource = { uri: 'https://httpbin.org' }

const NAV_DEMO_SOURCE: WebViewSource = { uri: 'https://example.com' }
const NAV_BLOCKED_SOURCE: WebViewSource = { uri: 'https://example.org' }

const HEADERS_SOURCE: WebViewSource = {
  uri: 'https://httpbin.org/headers',
  headers: { 'X-Nitro-Test': 'per-request' },
}

const USER_AGENT_SOURCE: WebViewSource = { uri: 'https://httpbin.org/user-agent' }

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

// A public PDF that reliably returns Content-Disposition: attachment
const DOWNLOAD_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
const DOWNLOAD_SOURCE: WebViewSource = { uri: DOWNLOAD_URL }

const INJECTED_JS = `
  document.body.style.background = '#fff8e1';
  var s = document.getElementById('status');
  if (s) s.textContent = 'injectedJavaScript ran';
  setTimeout(function () {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage('auto-message from injectedJavaScript');
    }
  }, 250);
  true;
`

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const ref = useRef<NitroWebViewMethods | null>(null)
  const [source, setSource] = useState<WebViewSource>(INITIAL_SOURCE)
  const [navState, setNavState] = useState<WebViewNavigationState>({
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
  })
  const [lastError, setLastError] = useState<NitroWebViewErrorEvent['nativeEvent'] | null>(null)
  const [lastMessage, setLastMessage] = useState<WebViewMessageEvent['nativeEvent'] | null>(null)
  const [evalResult, setEvalResult] = useState<{ ok: boolean; value: string } | null>(null)

  // Cookies demo state
  const [cookies, setCookies] = useState<Cookie[]>([])
  const [cookieStatus, setCookieStatus] = useState<string>('—')

  // Upload demo state
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  // Download demo state
  const [lastDownload, setLastDownload] = useState<FileDownload | null>(null)

  // userAgent demo state. `undefined` keeps the platform default.
  const [userAgent, setUserAgent] = useState<string | undefined>(undefined)

  // Navigation interception demo state
  const [blockedHosts] = useState<string[]>(['example.org'])
  const [lastDecision, setLastDecision] = useState<{
    url: string
    allowed: boolean
    at: number
  } | null>(null)

  // Track which demo panel is active to show the right message banner
  const handleMessage = callback((event: WebViewMessageEvent) => {
    setLastMessage(event.nativeEvent)
    const data = event.nativeEvent.data
    if (data.startsWith('single') || data.startsWith('multi')) {
      setUploadStatus('upload event: ' + data)
    }
  })

  const handleShouldStartLoad = callback((event: ShouldStartLoadRequest) => {
    const u = new URL(event.url)
    const blocked = blockedHosts.some(
      h => u.hostname === h || u.hostname.endsWith('.' + h)
    )
    setLastDecision({ url: event.url, allowed: !blocked, at: Date.now() })
    return !blocked
  })

  const handleFileDownload = callback(async (event: FileDownloadEvent) => {
    const ev = event.nativeEvent
    setLastDownload(ev)
    // Download the bytes and save them to the OS Downloads folder for visibility.
    // Android short-circuits navigation before bytes flow, so we fetch from scratch.
    // iOS WKWebView also delivers this event before any save, so the same fetch+write
    // is correct for both platforms.
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
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>nitro-webview</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {navState.url || 'loading…'}
        </Text>
        {navState.title ? (
          <Text style={styles.pageTitle} numberOfLines={1}>
            {navState.title}
          </Text>
        ) : null}
      </View>

      {/* Nav toolbar */}
      <View style={styles.toolbar}>
        <ToolbarButton
          label="◀ Back"
          disabled={!navState.canGoBack}
          onPress={() => ref.current?.goBack()}
        />
        <ToolbarButton
          label="Forward ▶"
          disabled={!navState.canGoForward}
          onPress={() => ref.current?.goForward()}
        />
        <ToolbarButton
          label="⟳ Reload"
          disabled={navState.loading}
          onPress={() => ref.current?.reload()}
        />
      </View>

      {/* Source toolbar */}
      <View style={styles.toolbar}>
        <ToolbarButton
          label="🌐 example.com"
          onPress={() => {
            setLastError(null)
            setLastMessage(null)
            setSource(INITIAL_SOURCE)
          }}
        />
        <ToolbarButton
          label="💥 Error"
          onPress={() => {
            setLastError(null)
            setLastMessage(null)
            setSource(ERROR_SOURCE)
          }}
        />
        <ToolbarButton
          label="📨 Bridge"
          onPress={() => {
            setLastError(null)
            setLastMessage(null)
            setSource(BRIDGE_SOURCE)
          }}
        />
      </View>

      {/* Evaluate JS toolbar */}
      <View style={styles.toolbar}>
        <ToolbarButton
          label="🧪 Evaluate JS"
          onPress={async () => {
            const r = ref.current
            if (!r) return
            setEvalResult(null)
            try {
              const value = await r.evaluateJavaScript(
                "JSON.stringify({ title: document.title, w: window.innerWidth })"
              )
              setEvalResult({ ok: true, value })
            } catch (e) {
              setEvalResult({ ok: false, value: String(e) })
            }
          }}
        />
      </View>

      {/* Status banners */}
      {lastError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle} numberOfLines={1}>
            onError fired ({lastError.domain} {lastError.code})
          </Text>
          <Text style={styles.errorBody} numberOfLines={2}>
            {lastError.description}
          </Text>
          <Text style={styles.errorUrl} numberOfLines={1}>
            {lastError.url || '(no url)'}
          </Text>
        </View>
      ) : null}

      {lastMessage ? (
        <View style={styles.messageBanner}>
          <Text style={styles.messageTitle} numberOfLines={1}>
            onMessage fired
          </Text>
          <Text style={styles.messageBody} numberOfLines={2}>
            {lastMessage.data}
          </Text>
          <Text style={styles.messageUrl} numberOfLines={1}>
            from {lastMessage.url || '(no url)'}
          </Text>
        </View>
      ) : null}

      {evalResult ? (
        <View style={evalResult.ok ? styles.evalBanner : styles.errorBanner}>
          <Text style={evalResult.ok ? styles.evalTitle : styles.errorTitle} numberOfLines={1}>
            evaluateJavaScript {evalResult.ok ? 'resolved' : 'rejected'}
          </Text>
          <Text style={evalResult.ok ? styles.evalBody : styles.errorBody} numberOfLines={3}>
            {evalResult.value}
          </Text>
        </View>
      ) : null}

      {/* WebView */}
      <NitroWebView
        style={styles.webview}
        source={source}
        defaultHeaders={{ 'X-Nitro-Default': 'global', 'X-Nitro-Test': 'default-loses' }}
        userAgent={userAgent}
        injectedJavaScript={INJECTED_JS}
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
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onFileDownload={handleFileDownload}
      />

      {/* Feature demos panel */}
      <ScrollView style={styles.demoPanel} contentContainerStyle={styles.demoPanelContent}>
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
          Expected: X-Nitro-Default: global • X-Nitro-Test: per-request (not "default-loses")
        </Text>

        <SectionLabel text="Navigation interception demo" />
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>last decision:</Text>
          <Text style={styles.statusValue} numberOfLines={2}>
            {lastDecision
              ? `${lastDecision.url} — ${lastDecision.allowed ? 'ALLOWED' : 'BLOCKED'} (${new Date(lastDecision.at).toLocaleTimeString()})`
              : 'no decisions yet'}
          </Text>
        </View>
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Visit example.com (allow)"
            onPress={() => setSource(NAV_DEMO_SOURCE)}
          />
          <ToolbarButton
            label="Visit example.org (block)"
            onPress={() => setSource(NAV_BLOCKED_SOURCE)}
          />
        </View>
        <Text style={styles.hint}>
          Expected: example.com navigation succeeds; example.org navigation is blocked by the hook and the WebView stays on the previous page.
        </Text>

        <SectionLabel text="User-Agent demo" />
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>userAgent:</Text>
          <Text style={styles.statusValue} numberOfLines={1}>
            {userAgent ?? 'platform default'}
          </Text>
        </View>
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Use custom UA"
            onPress={() => {
              setUserAgent('NitroWebView/0.1 (demo)')
              setSource(USER_AGENT_SOURCE)
            }}
          />
          <ToolbarButton
            label="Reset UA"
            onPress={() => {
              setUserAgent(undefined)
              setSource(USER_AGENT_SOURCE)
            }}
          />
        </View>
        <Text style={styles.hint}>
          Hits httpbin.org/user-agent — the rendered JSON should mirror the value above.
        </Text>

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
              if (!r) { setCookieStatus('no ref'); return }
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
              if (!r) { setCookieStatus('no ref'); return }
              try {
                const result = await r.getCookies('https://httpbin.org')
                setCookies(result)
                if (result.length === 0) {
                  setCookieStatus('no cookies')
                } else {
                  setCookieStatus(
                    result.length + ' cookie(s) — ' + result[0].name + '=' + result[0].value
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
              if (!r) { setCookieStatus('no ref'); return }
              try {
                await r.clearCookies()
                const result = await r.getCookies('https://httpbin.org')
                setCookies(result)
                setCookieStatus(result.length === 0 ? 'cleared — no cookies' : result.length + ' remaining')
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
              <Text style={styles.cookieItem}>…+{cookies.length - 3} more</Text>
            ) : null}
          </View>
        ) : null}

        <SectionLabel text="File upload demo" />
        {uploadStatus ? (
          <View style={styles.uploadPill}>
            <Text style={styles.uploadPillText}>{uploadStatus}</Text>
          </View>
        ) : null}
        <View style={styles.toolbar}>
          <ToolbarButton
            label="Open upload page"
            onPress={() => {
              setLastError(null)
              setLastMessage(null)
              setUploadStatus(null)
              setSource(UPLOAD_SOURCE)
            }}
          />
        </View>
        <Text style={styles.hint}>Tap an input in the WebView, pick a file — pill updates above</Text>

        <SectionLabel text="File download demo" />
        {lastDownload ? (
          <View style={styles.downloadRow}>
            <Text style={styles.downloadLabel}>last download:</Text>
            <Text style={styles.downloadValue} numberOfLines={2}>
              {lastDownload.fileName ?? '(no filename)'}{' '}
              ({lastDownload.mimeType ?? 'unknown mime'},{' '}
              {lastDownload.contentLength != null ? lastDownload.contentLength + ' bytes' : 'size unknown'})
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
      </ScrollView>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolbarButton({
  label,
  disabled,
  onPress,
}: {
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonLabel, disabled && styles.buttonLabelDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function SectionLabel({ text }: { text: string }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelAccent} />
      <Text style={styles.sectionLabelText}>{text}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#0f172a',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#f8fafc', letterSpacing: 0.3 },
  subtitle: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  pageTitle: { fontSize: 12, color: '#cbd5e1', marginTop: 3, fontWeight: '500' },

  // Toolbars
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 6,
    paddingTop: 2,
    gap: 6,
  },
  button: {
    flex: 1,
    paddingVertical: 7,
    backgroundColor: '#e0e7ff',
    borderRadius: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  buttonDisabled: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  buttonLabel: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  buttonLabelDisabled: { color: '#94a3b8' },

  // Status banners
  errorBanner: {
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 9,
    backgroundColor: '#fff1f0',
    borderColor: '#f5c2c0',
    borderWidth: 1,
    borderRadius: 7,
  },
  errorTitle: { fontSize: 11, fontWeight: '700', color: '#b1241a' },
  errorBody: { fontSize: 11, color: '#7c1d12', marginTop: 2 },
  errorUrl: { fontSize: 10, color: '#7c1d12', marginTop: 2, fontStyle: 'italic' },
  messageBanner: {
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 9,
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 7,
  },
  messageTitle: { fontSize: 11, fontWeight: '700', color: '#047857' },
  messageBody: { fontSize: 11, color: '#065f46', marginTop: 2 },
  messageUrl: { fontSize: 10, color: '#065f46', marginTop: 2, fontStyle: 'italic' },
  evalBanner: {
    marginHorizontal: 10,
    marginBottom: 6,
    padding: 9,
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 7,
  },
  evalTitle: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  evalBody: { fontSize: 11, color: '#1e3a8a', marginTop: 2, fontFamily: 'Menlo' },

  // WebView
  webview: { height: 220 },

  // Feature demos panel
  demoPanel: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderTopWidth: 2,
    borderTopColor: '#0f172a',
  },
  demoPanelContent: { paddingBottom: 24 },

  // Section labels
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  sectionLabelAccent: {
    width: 3,
    height: 16,
    backgroundColor: '#2563eb',
    borderRadius: 2,
  },
  sectionLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  hint: {
    fontSize: 10,
    color: '#64748b',
    paddingHorizontal: 10,
    paddingBottom: 4,
    fontStyle: 'italic',
  },

  // Cookies
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 4,
    gap: 6,
  },
  statusLabel: { fontSize: 11, color: '#475569', fontWeight: '600' },
  statusValue: {
    flex: 1,
    fontSize: 11,
    color: '#0f172a',
    fontFamily: 'Menlo',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cookieList: {
    marginHorizontal: 10,
    marginBottom: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    padding: 8,
    gap: 2,
  },
  cookieItem: { fontSize: 11, color: '#1e293b', fontFamily: 'Menlo' },

  // Upload
  uploadPill: {
    marginHorizontal: 10,
    marginBottom: 4,
    backgroundColor: '#d1fae5',
    borderColor: '#6ee7b7',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  uploadPillText: { fontSize: 11, color: '#065f46', fontWeight: '600' },

  // Download
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingBottom: 4,
    gap: 6,
  },
  downloadLabel: { fontSize: 11, color: '#475569', fontWeight: '600' },
  downloadValue: {
    flex: 1,
    fontSize: 11,
    color: '#0f172a',
    fontFamily: 'Menlo',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
})
