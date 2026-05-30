package com.margelo.nitro.nitrowebview

import android.webkit.WebView

/**
 * Wraps a real [WebView] and conforms to [JavaScriptEvaluator].
 *
 * `WebView.evaluateJavascript(...)` is main-thread only; this adapter performs
 * no dispatch and inherits that constraint.
 */
class AndroidWebViewJavaScriptEvaluator(
  private val webView: WebView,
) : JavaScriptEvaluator {
  override fun evaluateJavaScriptPayload(
    code: String,
    resultCallback: (String?) -> Unit,
  ) {
    webView.evaluateJavascript(code) { value -> resultCallback(value) }
  }
}
