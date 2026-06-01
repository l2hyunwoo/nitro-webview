package io.github.l2hyunwoo.nitro.webview

import android.webkit.JavascriptInterface

/**
 * The (data, url) pair forwarded to the native event dispatcher.
 *
 * Mirrors the JS-side `nativeEvent` payload of the structured `onMessage`
 * event: `onMessage({ nativeEvent: { data, url } })`.
 */
data class NitroWebViewMessageEvent(
  val data: String,
  val url: String,
)

/** Abstraction over the subset of `android.webkit.WebView` this handler reads. */
interface MessageWebView {
  /** Mirrors `WebView.getUrl()`. `null` is mapped to `""` by the handler. */
  val currentURL: String?
}

/** Sink the handler forwards each event to. */
interface NitroWebViewMessageDispatcher {
  fun dispatchMessage(event: NitroWebViewMessageEvent)
}

/**
 * Android `@JavascriptInterface` host that receives `postMessage` from the
 * injected `window.ReactNativeWebView` bridge and forwards the (data, url)
 * pair to a native event dispatcher.
 *
 * Threading: invoked on Android's private JavaScriptInterface thread, NOT the
 * UI thread. The dispatcher implementation is responsible for any required
 * thread hop to reach the JS runtime. We deliberately do not thread-hop here
 * so `currentURL` reflects the URL at the moment of the JS bridge call.
 */
class NitroWebViewMessageHandler(
  private val messageWebView: MessageWebView,
  var dispatcher: NitroWebViewMessageDispatcher? = null,
) {

  @JavascriptInterface
  fun postMessage(data: String) {
    val url = messageWebView.currentURL ?: ""
    val event = NitroWebViewMessageEvent(data = data, url = url)
    dispatcher?.dispatchMessage(event)
  }

  companion object {
    /**
     * Identifier used to register this handler with
     * `WebView.addJavascriptInterface(handler, name)` and the property name
     * on `window` the injected bridge calls `postMessage` on.
     */
    const val JS_INTERFACE_NAME: String = "ReactNativeWebView"
  }
}
