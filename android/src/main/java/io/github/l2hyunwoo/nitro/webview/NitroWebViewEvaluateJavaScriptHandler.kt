package io.github.l2hyunwoo.nitro.webview

import org.json.JSONArray
import org.json.JSONTokener

/**
 * Abstraction over `android.webkit.WebView.evaluateJavascript(String, ValueCallback<String>)`.
 *
 * The Android platform delivers a `String?` to the supplied callback:
 *   - on success: a JSON-encoded representation of the JS result, or `null`
 *     for `undefined` / void.
 *   - the callback fires exactly once per call.
 */
interface JavaScriptEvaluator {
  fun evaluateJavaScriptPayload(
    code: String,
    resultCallback: (String?) -> Unit,
  )
}

/**
 * Native handler for the `evaluateJavaScript` imperative method on Android.
 *
 * Mirrors the JS-side contract: `evaluateJavaScript(code: string): Promise<string>`.
 * Platform results are parsed and returned as JSON. A missing result maps to
 * `"null"`; Android cannot distinguish a page exception from a null result.
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
        val callbacks = pending.remove(evaluationToken) ?: return@evaluateJavaScriptPayload
        try {
          callbacks.resolve(normalize(rawResult))
        } catch (error: Exception) {
          callbacks.reject(error)
        }
      }
    } catch (error: Exception) {
      pending.remove(evaluationToken)?.reject?.invoke(error)
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
      if (raw == null) return "null"
      val input = raw.trim()
      require(input.isNotEmpty()) { "Empty JavaScript evaluation result" }
      // shortcut: uses Android JSON syntax; use strict parsing if input stops coming from WebView.
      val parser = JSONTokener(input)
      val value = parser.nextValue()
      require(parser.nextClean() == '\u0000') { "Trailing JavaScript evaluation result" }
      require(value !is String || input.startsWith('"')) { "Invalid JSON string result" }
      return JSONArray().put(value).toString().let { it.substring(1, it.length - 1) }
    }
  }
}
