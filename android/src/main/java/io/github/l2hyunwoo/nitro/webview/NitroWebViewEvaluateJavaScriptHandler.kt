package io.github.l2hyunwoo.nitro.webview

/**
 * Abstraction over `android.webkit.WebView.evaluateJavascript(String, ValueCallback<String>)`.
 *
 * The Android platform delivers a `String?` to the supplied callback:
 *   - on success: a JSON-encoded representation of the JS result, or `null`
 *     for `undefined` / void.
 *   - the callback fires exactly once per call.
 */
interface JavaScriptEvaluator {
  fun evaluateJavaScriptPayload(code: String, resultCallback: (String?) -> Unit)
}

/**
 * Native handler for the `evaluateJavaScript` imperative method on Android.
 *
 * Mirrors the JS-side contract: `evaluateJavaScript(code: string): Promise<string>`.
 * `null` results are normalised to `""`; all other values are forwarded verbatim
 * (Android's `evaluateJavascript` already delivers a JSON-encoded string).
 */
class NitroWebViewEvaluateJavaScriptHandler {
  private val pending = mutableMapOf<Any, Pair<(String) -> Unit, (Throwable) -> Unit>>()
  private var disposedError: Throwable? = null

  fun evaluate(
    code: String,
    evaluator: JavaScriptEvaluator,
    resolve: (String) -> Unit,
    reject: (Throwable) -> Unit,
  ) {
    disposedError?.let { reject(it); return }
    val token = Any()
    pending[token] = resolve to reject
    try {
      evaluator.evaluateJavaScriptPayload(code) { rawResult ->
        pending.remove(token)?.first?.invoke(normalize(rawResult))
      }
    } catch (t: Throwable) {
      pending.remove(token)?.second?.invoke(t)
    }
  }

  fun dispose(error: Throwable) {
    if (disposedError != null) return
    disposedError = error
    val callbacks = pending.values.toList()
    pending.clear()
    callbacks.forEach { it.second(error) }
  }

  companion object {
    @JvmStatic
    fun normalize(raw: String?): String {
      return raw ?: ""
    }
  }
}
