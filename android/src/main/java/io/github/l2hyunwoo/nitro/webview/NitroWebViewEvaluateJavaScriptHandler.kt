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
  private class EvaluationCallbacks(
    val resolve: (String) -> Unit,
    val reject: (Throwable) -> Unit,
  )

  private val pending = mutableMapOf<Any, EvaluationCallbacks>()
  private var disposedError: Throwable? = null

  fun evaluate(
    code: String,
    evaluator: JavaScriptEvaluator,
    resolve: (String) -> Unit,
    reject: (Throwable) -> Unit,
  ) {
    disposedError?.let {
      reject(it)
      return
    }
    // Identical code can have multiple pending evaluations; each needs its own identity.
    val evaluationToken = Any()
    pending[evaluationToken] = EvaluationCallbacks(resolve, reject)
    try {
      evaluator.evaluateJavaScriptPayload(code) { rawResult ->
        pending.remove(evaluationToken)?.resolve?.invoke(normalize(rawResult))
      }
    } catch (t: Throwable) {
      pending.remove(evaluationToken)?.reject?.invoke(t)
    }
  }

  fun dispose(error: Throwable) {
    if (disposedError != null) return
    disposedError = error
    val callbacks = pending.values.toList()
    pending.clear()
    callbacks.forEach { it.reject(error) }
  }

  companion object {
    @JvmStatic
    fun normalize(raw: String?): String {
      return raw ?: ""
    }
  }
}
