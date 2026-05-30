package com.margelo.nitro.nitrowebview

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

  fun evaluate(
    code: String,
    evaluator: JavaScriptEvaluator,
    resolve: (String) -> Unit,
    reject: (Throwable) -> Unit,
  ) {
    try {
      evaluator.evaluateJavaScriptPayload(code) { rawResult ->
        resolve(normalize(rawResult))
      }
    } catch (t: Throwable) {
      reject(t)
    }
  }

  companion object {
    @JvmStatic
    fun normalize(raw: String?): String {
      return raw ?: ""
    }
  }
}
