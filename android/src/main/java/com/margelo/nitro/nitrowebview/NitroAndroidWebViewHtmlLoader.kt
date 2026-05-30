package com.margelo.nitro.nitrowebview

import android.webkit.WebView

/**
 * Wraps a real [WebView] and conforms to [WebViewHTMLLoader].
 *
 * Thread-safety: `WebView.loadDataWithBaseURL` is UI-thread only; this adapter
 * performs no dispatch and inherits that constraint.
 */
class AndroidWebViewHtmlLoader(private val webView: WebView) : WebViewHTMLLoader {
  override fun loadDataWithBaseUrlPayload(
    baseUrl: String?,
    data: String,
    mimeType: String,
    encoding: String,
    historyUrl: String?,
  ) {
    webView.loadDataWithBaseURL(baseUrl, data, mimeType, encoding, historyUrl)
  }
}
