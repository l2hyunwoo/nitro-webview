package io.github.l2hyunwoo.nitro.webview

import android.webkit.WebView

/**
 * Wraps a real [WebView] and conforms to [MessageWebView].
 *
 * `currentURL` is computed (not stored) so the value is always read live at
 * message-delivery time, never cached.
 */
class AndroidWebViewMessageSource(private val webView: WebView) : MessageWebView {
  override val currentURL: String?
    get() = webView.url
}
