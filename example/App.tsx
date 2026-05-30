import React, { useRef, useState } from 'react'
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { callback, NitroWebView } from 'nitro-webview'
import type {
  NitroWebViewErrorEvent,
  NitroWebViewMethods,
  WebViewMessageEvent,
  WebViewNavigationState,
  WebViewSource,
} from 'nitro-webview'

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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
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
          label="💥 Trigger error"
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

      <NitroWebView
        style={styles.webview}
        source={source}
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
        onMessage={callback((event: WebViewMessageEvent) => {
          setLastMessage(event.nativeEvent)
        })}
      />
    </SafeAreaView>
  )
}

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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  pageTitle: { fontSize: 13, color: '#222', marginTop: 4, fontWeight: '500' },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#eef0f5',
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#f5f5f5' },
  buttonLabel: { fontSize: 13, color: '#1d4ed8', fontWeight: '500' },
  buttonLabelDisabled: { color: '#aaa' },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#fff1f0',
    borderColor: '#f5c2c0',
    borderWidth: 1,
    borderRadius: 6,
  },
  errorTitle: { fontSize: 12, fontWeight: '600', color: '#b1241a' },
  errorBody: { fontSize: 12, color: '#7c1d12', marginTop: 2 },
  errorUrl: { fontSize: 11, color: '#7c1d12', marginTop: 2, fontStyle: 'italic' },
  messageBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 6,
  },
  messageTitle: { fontSize: 12, fontWeight: '600', color: '#047857' },
  messageBody: { fontSize: 12, color: '#065f46', marginTop: 2 },
  messageUrl: { fontSize: 11, color: '#065f46', marginTop: 2, fontStyle: 'italic' },
  evalBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 6,
  },
  evalTitle: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
  evalBody: { fontSize: 12, color: '#1e3a8a', marginTop: 2, fontFamily: 'Menlo' },
  webview: { flex: 1 },
})
