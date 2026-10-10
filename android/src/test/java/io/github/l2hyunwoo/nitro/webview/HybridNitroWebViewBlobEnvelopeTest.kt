package io.github.l2hyunwoo.nitro.webview

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.UUID

/** Exercises the production request manager and bounded parser, without a Nitro view. */
@RunWith(RobolectricTestRunner::class)
class HybridNitroWebViewBlobEnvelopeTest {
  private fun envelope(
    request: NitroWebViewBlobDownloads.Request,
    fields: Map<String, Any> = emptyMap(),
  ): String {
    val payload =
      JSONObject()
        .put("requestId", request.requestId)
        .put("url", request.url)
        .put("dataUrl", "data:application/pdf;base64,JVBERg==")
        .put("mimeType", "application/pdf")
        .put("size", 4)
    for ((key, value) in fields) payload.put(key, value)
    return JSONObject().put("__nitro_blob__", payload).toString()
  }

  // Android JSONObject does not preserve insertion order on every SDK. The wire protocol does.
  private fun wire(
    request: NitroWebViewBlobDownloads.Request,
    fields: Map<String, Any> = emptyMap(),
  ): String {
    val payload = JSONObject(envelope(request, fields)).getJSONObject("__nitro_blob__")
    val id = payload.remove("requestId")
    val body = payload.toString().removePrefix("{")
    return "{\"__nitro_blob__\":{\"requestId\":" + JSONObject.quote(id as String) + "," + body + "}"
  }

  @Test
  fun `one native UUID request is pending and completion cannot replay`() {
    val downloads = NitroWebViewBlobDownloads()
    val request = downloads.begin("blob:https://x/abc", "report.pdf")!!
    assertNotNull(UUID.fromString(request.requestId))
    assertNull(downloads.begin("blob:https://x/second", "second.pdf"))
    val reply = wire(request)
    val result = downloads.accept(reply)!!
    assertNull(result.error)
    assertEquals("data:application/pdf;base64,JVBERg==", result.dataUrl)
    assertEquals("report.pdf", result.request.fileName)
    assertEquals(4.0, result.size!!, 0.0)
    assertNull(downloads.pending)
    assertNull(downloads.accept(reply))
    assertNotNull(downloads.begin("blob:https://x/new", "new.pdf"))
    assertNull(downloads.accept(reply))
  }

  @Test
  fun `ordinary and forged reserved messages cannot consume pending download`() {
    val downloads = NitroWebViewBlobDownloads()
    val request = downloads.begin("blob:https://x/abc", "report.pdf")!!
    for (raw in listOf("hello", "", "{\"k\":\"v\"}", "{\"__nitro_blob__\":{}}", wire(request, mapOf("requestId" to "forged")))) {
      assertNull(downloads.accept(raw))
      assertEquals(request, downloads.pending)
    }
    assertEquals(request, downloads.cancel())
    assertNull(downloads.accept(wire(request)))
    assertNull(downloads.pending)
  }

  @Test
  fun `mismatched URL malformed sizes and invalid base64 are explicit errors`() {
    val request = NitroWebViewBlobDownloads.Request("native-id", "blob:https://x/abc", "native.pdf")
    for (fields in listOf(
      mapOf("url" to "blob:https://other/abc"),
      mapOf("size" to -1),
      mapOf("size" to 1.5),
      mapOf("size" to "4"),
      mapOf("size" to 5),
      mapOf("size" to NitroWebViewBlobDownloads.MAX_BYTES + 1),
      mapOf("dataUrl" to "https://example.test/file"),
      mapOf("dataUrl" to "data:application/pdf;base64,%%%="),
      mapOf("dataUrl" to "data:application/pdf;base64,AAA\n", "size" to 3),
      mapOf("dataUrl" to "data:application/pdf;base64,A==="),
      mapOf("mimeType" to "x".repeat(257)),
      mapOf("error" to "untrusted error text"),
    )) {
      assertEquals(fields.toString(), "invalid", NitroWebViewBlobDownloads.parse(wire(request, fields), request)?.error)
    }
    val malformed = "{\"__nitro_blob__\":{\"requestId\":\"native-id\",broken"
    assertEquals("invalid", NitroWebViewBlobDownloads.parse(malformed, request)?.error)
    val nested = "{\"__nitro_blob__\":{\"requestId\":\"native-id\",\"extra\":" + "[".repeat(10_000) + "0" + "]".repeat(10_000) + "}}"
    assertEquals("invalid", NitroWebViewBlobDownloads.parse(nested, request)?.error)
    assertEquals(
      "invalid",
      NitroWebViewBlobDownloads.parse(malformed + " ".repeat(NitroWebViewBlobDownloads.MAX_ENVELOPE_CHARS), request)?.error,
    )
  }

  @Test
  fun `zero byte payload and explicit reader errors terminate exactly once`() {
    for (error in listOf("fetch", "read", "abort", "timeout", "too-large", "busy")) {
      val downloads = NitroWebViewBlobDownloads()
      val request = downloads.begin("blob:https://x/abc", "report.pdf")!!
      assertEquals(error, downloads.accept(wire(request, mapOf("error" to error)))?.error)
      assertNull(downloads.pending)
    }
    val downloads = NitroWebViewBlobDownloads()
    val request = downloads.begin("blob:https://x/empty", "empty")!!
    val result = downloads.accept(wire(request, mapOf("dataUrl" to "data:;base64,", "mimeType" to "", "size" to 0)))!!
    assertNull(result.error)
    assertEquals(0.0, result.size!!, 0.0)
  }

  @Test
  fun `script encodes native ID and URL and checks Blob size before FileReader`() {
    val request = NitroWebViewBlobDownloads.Request("native-id", "blob:https://x/a\"b\\c\u2028", "native.pdf")
    val script = NitroWebViewBlobDownloads.readerScript(request)
    assertTrue(script.contains("native-id"))
    assertTrue(script.contains("\\\"b\\\\c\\u2028"))
    assertTrue(script.indexOf("blob.size >") < script.indexOf("new FileReader"))
    assertTrue(NitroWebViewBlobDownloads.cancelScript(request.requestId).contains("native-id"))
  }
}
