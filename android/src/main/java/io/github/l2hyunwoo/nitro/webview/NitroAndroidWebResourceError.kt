package io.github.l2hyunwoo.nitro.webview

import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse

/**
 * Wraps a real [WebResourceError] and conforms to [WebResourceErrorSource].
 *
 * `getDescription()` returns a `CharSequence`; we coerce to `String` here so
 * the seam operates on the concrete type the JS contract requires.
 */
class AndroidWebResourceError(private val error: WebResourceError) : WebResourceErrorSource {
  override val errorCode: Int
    get() = error.errorCode

  override val errorDescription: String
    get() = error.description?.toString() ?: ""
}

/** Wraps a real [WebResourceRequest] and conforms to [WebResourceRequestSource]. */
class AndroidWebResourceRequest(private val request: WebResourceRequest) : WebResourceRequestSource {
  override val url: String?
    get() = request.url?.toString()
}

/**
 * Wraps a real [WebResourceResponse] (as delivered by
 * `WebViewClient.onReceivedHttpError`) and conforms to
 * [WebResourceResponseSource].
 *
 * `getReasonPhrase()` may be `null` for a malformed response; we coerce to
 * `""` so the seam operates on the concrete `String` type the JS contract
 * requires.
 */
class AndroidWebResourceResponse(private val response: WebResourceResponse) : WebResourceResponseSource {
  override val statusCode: Int
    get() = response.statusCode

  override val reasonPhrase: String
    get() = response.reasonPhrase ?: ""
}
