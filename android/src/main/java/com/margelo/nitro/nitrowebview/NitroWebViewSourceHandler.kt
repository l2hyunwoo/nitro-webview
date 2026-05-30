package com.margelo.nitro.nitrowebview

/** Normalised payload for the `loadHtml` command from the JS bridge. */
data class NitroLoadHtmlPayload(
  val html: String,
  val baseUrlString: String? = null,
)

/** Abstraction over `android.webkit.WebView.loadDataWithBaseURL(...)`. */
interface WebViewHTMLLoader {
  fun loadDataWithBaseUrlPayload(
    baseUrl: String?,
    data: String,
    mimeType: String,
    encoding: String,
    historyUrl: String?,
  )
}

/** Native handler for the `loadHtml` command on Android. */
class NitroWebViewSourceHandler {

  /** Apply a normalised HTML payload to the given WebView. */
  fun applyHtmlPayload(payload: NitroLoadHtmlPayload, webView: WebViewHTMLLoader) {
    val baseUrl = normalizeBaseUrl(payload.baseUrlString)
    webView.loadDataWithBaseUrlPayload(
      baseUrl = baseUrl,
      data = payload.html,
      mimeType = MIME_TYPE,
      encoding = ENCODING,
      historyUrl = null,
    )
  }

  companion object {
    const val MIME_TYPE: String = "text/html"
    const val ENCODING: String = "UTF-8"

    // Empty baseUrl maps to null to match WebView platform semantics.
    @JvmStatic
    fun normalizeBaseUrl(raw: String?): String? {
      if (raw == null) return null
      if (raw.isEmpty()) return null
      return raw
    }
  }
}
