package io.github.l2hyunwoo.nitro.webview

/**
 * Mirror of the JS-side `NitroWebViewHttpErrorEvent.nativeEvent`:
 *
 *     { statusCode: number, url: string, description: string }
 *
 * Deliberately a SEPARATE type from [MappedNitroWebViewError] (used by
 * `onError`). An HTTP error carries a `statusCode` but no error `code` /
 * `domain`, and a transport error is the reverse — forcing both through one
 * mapper would be Stamp coupling. The two callbacks are disjoint by
 * construction (transport failure → `onError`; HTTP 4xx/5xx → `onHttpError`).
 */
data class MappedNitroWebViewHttpError(
  val statusCode: Int,
  val url: String,
  val description: String,
)

/**
 * Abstraction over the parts of `android.webkit.WebResourceResponse` the
 * HTTP-error mapper reads. Mirrors the [WebResourceErrorSource] seam pattern
 * so the mapper can be unit-tested with a fake response (no live WebView).
 */
interface WebResourceResponseSource {
  /** Mirrors `WebResourceResponse.getStatusCode()`. */
  val statusCode: Int

  /** Mirrors `WebResourceResponse.getReasonPhrase()`. */
  val reasonPhrase: String
}

/**
 * Pure-function mapper from a [WebResourceResponseSource] (as delivered by
 * `WebViewClient.onReceivedHttpError`) into the structured
 * [MappedNitroWebViewHttpError] the JS-side `onHttpError` callback expects.
 *
 * Reuses [NitroWebViewErrorMapper.extractFailingURL] for URL resolution so
 * the fallback ladder (request URL → delegate URL → `""`) stays identical
 * across both error callbacks.
 */
object NitroWebViewHttpErrorMapper {

  @JvmStatic
  fun event(
    response: WebResourceResponseSource,
    request: WebResourceRequestSource? = null,
    fallbackUrl: String? = null,
  ): MappedNitroWebViewHttpError {
    return MappedNitroWebViewHttpError(
      statusCode = response.statusCode,
      url = NitroWebViewErrorMapper.extractFailingURL(request = request, fallbackUrl = fallbackUrl),
      description = response.reasonPhrase,
    )
  }

  /**
   * Lowest-cost guard exercising the main-frame filter WITHOUT a live
   * WebView: returns `null` for a sub-resource ([isForMainFrame] `false`),
   * otherwise the mapped event. The production `onReceivedHttpError` drops
   * sub-resources before ever calling [event]; this helper lets a JVM unit
   * test assert that drop with a single `assertNull` / `assertNotNull` pair.
   */
  @JvmStatic
  fun httpErrorEventOrNull(
    response: WebResourceResponseSource,
    request: WebResourceRequestSource?,
    isForMainFrame: Boolean,
    fallbackUrl: String? = null,
  ): MappedNitroWebViewHttpError? =
    if (!isForMainFrame) null else event(response, request, fallbackUrl)
}
