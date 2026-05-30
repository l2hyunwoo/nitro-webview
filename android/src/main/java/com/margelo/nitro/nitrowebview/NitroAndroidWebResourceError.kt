package com.margelo.nitro.nitrowebview

import android.webkit.WebResourceError
import android.webkit.WebResourceRequest

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
