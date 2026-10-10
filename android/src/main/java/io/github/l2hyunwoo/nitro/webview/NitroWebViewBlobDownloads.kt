package io.github.l2hyunwoo.nitro.webview

import org.json.JSONException
import org.json.JSONObject
import java.util.UUID

/** UI-thread-owned blob requests. The bounded parser never decodes another copy of the bytes. */
internal class NitroWebViewBlobDownloads {
  data class Request(
    val requestId: String,
    val url: String,
    val fileName: String,
  )

  data class Result(
    val request: Request,
    val dataUrl: String? = null,
    val mimeType: String? = null,
    val size: Double? = null,
    val error: String? = null,
  )

  var pending: Request? = null
    private set

  fun begin(
    url: String,
    fileName: String,
  ): Request? {
    if (pending != null) return null
    return Request(UUID.randomUUID().toString(), url, fileName.take(512)).also { pending = it }
  }

  fun cancel(): Request? = pending.also { pending = null }

  fun accept(raw: String): Result? {
    val request = pending ?: return null
    val result = parse(raw, request) ?: return null
    pending = null
    return result
  }

  companion object {
    // shortcut: blobs use base64 up to 8 MiB, add file streaming if larger blobs are required.
    private fun quote(value: String): String = JSONObject.quote(value).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

    const val MAX_BYTES = 8 * 1024 * 1024
    const val MAX_DATA_URL_CHARS = 4 * ((MAX_BYTES + 2) / 3) + 512
    const val MAX_ENVELOPE_CHARS = MAX_DATA_URL_CHARS + 8192
    const val TIMEOUT_MS = 30_000L
    private val BASE64 = Regex("[A-Za-z0-9+/]*={0,2}")
    private val HEADER = Regex("data:[^,\\r\\n]*;base64")
    private val ERRORS = setOf("fetch", "read", "abort", "timeout", "too-large", "invalid", "busy")

    fun parse(
      raw: String?,
      request: Request,
    ): Result? {
      if (raw == null || !raw.startsWith("{\"__nitro_blob__\":{\"requestId\":" + JSONObject.quote(request.requestId) + ",")) return null

      fun invalid() = Result(request, error = "invalid")
      if (raw.length > MAX_ENVELOPE_CHARS) return invalid()
      // org.json recurses into containers; this protocol has only two objects and scalar fields.
      var depth = 0
      var quoted = false
      var escaped = false
      for (character in raw) {
        if (quoted) {
          if (escaped) {
            escaped = false
          } else if (character == '\\') {
            escaped = true
          } else if (character == '"') {
            quoted = false
          }
        } else {
          when (character) {
            '"' -> {
              quoted = true
            }

            '[' -> {
              return invalid()
            }

            '{' -> {
              depth++
              if (depth > 2) return invalid()
            }

            '}' -> {
              depth--
            }
          }
        }
      }
      return try {
        val blob = JSONObject(raw).optJSONObject("__nitro_blob__") ?: return invalid()
        if (blob.opt("requestId") != request.requestId || blob.opt("url") != request.url) return invalid()
        if (blob.has("error")) {
          val error = blob.opt("error")
          return if (error is String && error in ERRORS) Result(request, error = error) else invalid()
        }
        val dataUrl = blob.opt("dataUrl") as? String ?: return invalid()
        val mimeType = blob.opt("mimeType") as? String ?: return invalid()
        val size = (blob.opt("size") as? Number)?.toDouble() ?: return invalid()
        if (dataUrl.length > MAX_DATA_URL_CHARS || mimeType.length > 256 ||
          !size.isFinite() || size < 0 || size > MAX_BYTES || size % 1.0 != 0.0
        ) {
          return invalid()
        }
        val comma = dataUrl.indexOf(',')
        if (comma !in 0..512 || !HEADER.matches(dataUrl.substring(0, comma))) return invalid()
        val encoded = dataUrl.substring(comma + 1)
        if (encoded.length != 4 * ((size.toInt() + 2) / 3) || !BASE64.matches(encoded)) return invalid()
        val padding =
          if (encoded.endsWith("==")) {
            2
          } else if (encoded.endsWith("=")) {
            1
          } else {
            0
          }
        if (encoded.length / 4 * 3 - padding != size.toInt()) return invalid()
        Result(request, dataUrl, mimeType, size)
      } catch (_: JSONException) {
        invalid()
      }
    }

    fun cancelScript(requestId: String): String =
      "(function(){var r=window.__nitroBlobReader;if(r&&r.requestId===" +
        quote(requestId) + "){r.cancel();}})();"

    fun readerScript(request: Request): String {
      val idLiteral = quote(request.requestId)
      val urlLiteral = quote(request.url)
      return """;(function () {
  var id = $idLiteral, url = $urlLiteral, done = false, reader = null, timer = null;
  var controller = null;
  function finish(error, silent) {
    if (done) { return; }
    done = true;
    if (timer !== null) { window.clearTimeout(timer); }
    if (window.__nitroBlobReader && window.__nitroBlobReader.requestId === id) {
      delete window.__nitroBlobReader;
    }
    if (error) {
      if (controller) { controller.abort(); }
      if (reader && reader.readyState === 1) { reader.abort(); }
    }
    if (!silent) {
      var payload = { requestId: id, url: url };
      if (error) { payload.error = error; }
      else {
        payload.dataUrl = reader.result;
        payload.mimeType = reader.__nitroMimeType;
        payload.size = reader.__nitroSize;
      }
      var envelope = { __nitro_blob__: payload };
      var bridge = window.ReactNativeWebView;
      if (bridge && typeof bridge.postMessage === 'function') {
        bridge.postMessage(JSON.stringify(envelope));
      }
    }
  }
  if (window.__nitroBlobReader) { finish('busy'); return; }
  window.__nitroBlobReader = { requestId: id, cancel: function () { finish('abort', true); } };
  timer = window.setTimeout(function () { finish('timeout'); }, $TIMEOUT_MS);
  try {
    if (typeof AbortController === 'function') { controller = new AbortController(); }
    fetch(url, controller ? { signal: controller.signal } : {}).then(function (response) {
      if (done) { return; }
      if (!response.ok) { throw new Error('fetch'); }
      return response.blob();
    }).then(function (blob) {
      if (done) { return; }
      if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 0) { finish('invalid'); return; }
      if (blob.size > $MAX_BYTES) { finish('too-large'); return; }
      try {
        reader = new FileReader();
        reader.__nitroSize = blob.size;
        reader.__nitroMimeType = blob.type || '';
        reader.onload = function () {
          if (typeof reader.result !== 'string' || reader.result.length > $MAX_DATA_URL_CHARS) {
            finish('invalid'); return;
          }
          finish(null);
        };
        reader.onerror = function () { finish('read'); };
        reader.onabort = function () { finish('abort'); };
        reader.readAsDataURL(blob);
      } catch (error) { finish('read'); }
    })['catch'](function () { finish('fetch'); });
  } catch (error) { finish('fetch'); }
})();"""
    }
  }
}
