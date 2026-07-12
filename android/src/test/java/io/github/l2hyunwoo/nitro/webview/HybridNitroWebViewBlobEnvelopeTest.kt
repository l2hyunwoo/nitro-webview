package io.github.l2hyunwoo.nitro.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * JVM/Robolectric tests for the Android blob-download demux on
 * [HybridNitroWebView.Companion]:
 *
 *   - `buildBlobReaderScript` — the JS injected into the page to read a
 *     `blob:` URL to a data URL and post a reserved envelope.
 *   - `parseBlobEnvelope` — the demux the message sink runs to route that
 *     envelope to `onFileDownload` instead of `onMessage`.
 *
 * These MUST stay behavior-identical to the canonical TS source in
 * `src/bridgeScript.ts` (whose own round-trip is covered by
 * `src/__tests__/blob-reader-envelope.test.ts`). Robolectric supplies the
 * real `org.json` used by both helpers (the plain JVM stub throws).
 */
@RunWith(RobolectricTestRunner::class)
class HybridNitroWebViewBlobEnvelopeTest {

  // region: parseBlobEnvelope — happy path

  @Test
  fun `parseBlobEnvelope_returnsPayload_forWellFormedEnvelope`() {
    val raw =
      """{"__nitro_blob__":{"url":"blob:https://x/abc","dataUrl":"data:application/pdf;base64,JVBERg==","mimeType":"application/pdf","fileName":"report.pdf","size":5}}"""
    val parsed = HybridNitroWebView.parseBlobEnvelope(raw)
    assertNotNull(parsed)
    assertEquals("blob:https://x/abc", parsed!!.url)
    assertEquals("data:application/pdf;base64,JVBERg==", parsed.dataUrl)
    assertEquals("application/pdf", parsed.mimeType)
    assertEquals("report.pdf", parsed.fileName)
    assertEquals(5.0, parsed.size, 0.0)
  }

  @Test
  fun `parseBlobEnvelope_defaultsOptionalFields_whenAbsent`() {
    val raw = """{"__nitro_blob__":{"url":"blob:https://x/1","dataUrl":"data:;base64,"}}"""
    val parsed = HybridNitroWebView.parseBlobEnvelope(raw)
    assertNotNull(parsed)
    assertEquals("", parsed!!.mimeType)
    assertEquals("", parsed.fileName)
    assertEquals(0.0, parsed.size, 0.0)
  }

  // region: parseBlobEnvelope — channel isolation (normal onMessage falls through)

  @Test
  fun `parseBlobEnvelope_returnsNull_forNormalOnMessagePayloads`() {
    assertNull(HybridNitroWebView.parseBlobEnvelope("hello"))
    assertNull(HybridNitroWebView.parseBlobEnvelope(""))
    assertNull(HybridNitroWebView.parseBlobEnvelope("""{"k":"v"}"""))
    assertNull(HybridNitroWebView.parseBlobEnvelope(null))
  }

  @Test
  fun `parseBlobEnvelope_returnsNull_whenKeyAppearsAsAValueElsewhere`() {
    // The reserved key appearing as a VALUE must not be mistaken for an envelope.
    assertNull(HybridNitroWebView.parseBlobEnvelope("""{"user":"__nitro_blob__"}"""))
  }

  @Test
  fun `parseBlobEnvelope_returnsNull_forMalformedEnvelope`() {
    // Matching prefix but missing required url/dataUrl.
    assertNull(HybridNitroWebView.parseBlobEnvelope("""{"__nitro_blob__":{}}"""))
    // Matching prefix but invalid JSON — must return null, never throw.
    assertNull(HybridNitroWebView.parseBlobEnvelope("""{"__nitro_blob__"broken"""))
  }

  // region: buildBlobReaderScript

  @Test
  fun `buildBlobReaderScript_embedsBridgeAndReservedKey`() {
    val js = HybridNitroWebView.buildBlobReaderScript("blob:https://x/abc", "report.pdf")
    assertTrue("must fetch the blob url", js.contains("blob:https://x/abc"))
    assertTrue("must read as data url", js.contains("readAsDataURL"))
    assertTrue("must post the reserved key", js.contains("__nitro_blob__"))
    assertTrue(
      "must route through the existing bridge",
      js.contains("window.ReactNativeWebView"),
    )
  }

  @Test
  fun `buildBlobReaderScript_jsonEncodesInputs_soQuotesCannotBreakOut`() {
    // A URL/name with quotes+backslashes must be JSON-encoded so it cannot
    // terminate the source-string literal.
    val js = HybridNitroWebView.buildBlobReaderScript("""blob:https://x/a"b\c""", """n"a\me""")
    // The raw unescaped forms must NOT appear verbatim; the escaped forms must.
    assertTrue(js.contains("""blob:https://x/a\"b\\c"""))
    assertTrue(js.contains("""n\"a\\me"""))
  }
}
