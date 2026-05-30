package com.margelo.nitro.nitrowebview

/**
 * Mirror of the JS-side `WebViewErrorEvent.nativeEvent`:
 *
 *     { code: number, description: string, url: string, domain: string }
 */
data class NitroWebViewErrorEvent(
  val code: Int,
  val description: String,
  val url: String,
  val domain: String,
)

/** Abstraction over the parts of `android.webkit.WebResourceError` the mapper reads. */
interface WebResourceErrorSource {
  /** Mirrors `WebResourceError.getErrorCode()`. */
  val errorCode: Int

  /** Mirrors `WebResourceError.getDescription().toString()`. */
  val errorDescription: String
}

/** Abstraction over the parts of `android.webkit.WebResourceRequest` the mapper reads. */
interface WebResourceRequestSource {
  /** Mirrors `WebResourceRequest.getUrl()?.toString()`. */
  val url: String?
}

/**
 * Pure-function mapper from a [WebResourceErrorSource] (as delivered by
 * `WebViewClient.onReceivedError`) into the structured [NitroWebViewErrorEvent]
 * that the JS-side `onError` callback expects.
 */
object NitroWebViewErrorMapper {

  /**
   * Stable domain identifier emitted for every Android-side error event.
   *
   * `android.webkit.WebResourceError` does not carry a domain identifier, unlike
   * `NSError` on iOS. To preserve the cross-platform JS contract
   * (`domain: string`, never absent), we emit this stable mirror string.
   */
  const val ANDROID_ERROR_DOMAIN: String = "AndroidWebViewErrorDomain"

  @JvmStatic
  fun event(
    error: WebResourceErrorSource,
    request: WebResourceRequestSource? = null,
    fallbackUrl: String? = null,
  ): NitroWebViewErrorEvent {
    return NitroWebViewErrorEvent(
      code = error.errorCode,
      description = error.errorDescription,
      url = extractFailingURL(request = request, fallbackUrl = fallbackUrl),
      domain = ANDROID_ERROR_DOMAIN,
    )
  }

  /**
   * Resolve the failing URL, falling back through the delegate-supplied values.
   *
   * Resolution order — first non-null/non-empty hit wins:
   *   1. `request?.url`
   *   2. `fallbackUrl`
   *   3. `""` (preserves JS contract `url: string`)
   */
  @JvmStatic
  fun extractFailingURL(
    request: WebResourceRequestSource?,
    fallbackUrl: String?,
  ): String {
    val fromRequest = request?.url
    if (!fromRequest.isNullOrEmpty()) {
      return fromRequest
    }
    if (!fallbackUrl.isNullOrEmpty()) {
      return fallbackUrl
    }
    return ""
  }
}
