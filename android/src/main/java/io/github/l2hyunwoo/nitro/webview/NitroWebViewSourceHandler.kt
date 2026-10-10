package io.github.l2hyunwoo.nitro.webview

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
  fun applyHtmlPayload(
    payload: NitroLoadHtmlPayload,
    webView: WebViewHTMLLoader,
  ) {
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
    /** Validate each input map, then apply case-insensitive per-request precedence. */
    @JvmStatic
    fun mergeHeaders(
      defaults: Map<String, String>?,
      perRequest: Map<String, String>?,
    ): Map<String, String> {
      for (headers in listOf(defaults.orEmpty(), perRequest.orEmpty())) {
        val seen = HashSet<String>()
        for (key in headers.keys) {
          require(seen.add(key.lowercase(java.util.Locale.ROOT))) { "Duplicate HTTP header: $key" }
        }
      }
      val overrides =
        perRequest
          .orEmpty()
          .keys
          .map { it.lowercase(java.util.Locale.ROOT) }
          .toSet()
      val merged = LinkedHashMap<String, String>()
      defaults
        .orEmpty()
        .filterKeys { it.lowercase(java.util.Locale.ROOT) !in overrides }
        .forEach { (key, value) -> merged[key] = value }
      merged.putAll(perRequest.orEmpty())
      return merged
    }

    /** Validate before invoking postUrl, which cannot carry custom headers. */
    @JvmStatic
    fun postBody(
      uri: String,
      method: String?,
      body: String?,
      headers: Map<String, String>,
    ): ByteArray? {
      val verb = method ?: "GET"
      require(verb == "GET" || verb == "POST") { "source.method must be GET or POST" }
      require(verb == "POST" || body == null) { "source.body requires POST" }
      if (verb == "GET") return null
      require(uri.startsWith("http://", ignoreCase = true) || uri.startsWith("https://", ignoreCase = true)) {
        "POST requires an HTTP(S) URI"
      }
      require(headers.isEmpty()) { "Android POST does not support source.headers or defaultHeaders" }
      return (body ?: "").toByteArray(Charsets.UTF_8)
    }

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
