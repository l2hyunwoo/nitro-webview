package io.github.l2hyunwoo.nitro.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * JVM/Robolectric tests for the native→web `postMessage` statement builder
 * on [HybridNitroWebView.Companion] — the Kotlin mirror of the TS oracle in
 * `src/__tests__/post-message-escaping.test.ts`.
 *
 * Runs under Robolectric so `org.json.JSONObject.quote` resolves to the real
 * implementation (the plain-JVM android.jar stub returns default values under
 * `returnDefaultValues = true`, which would make `quote` a no-op).
 *
 * For each hostile payload the emitted statement must:
 *   1. dispatch a `message` event on `document`,
 *   2. contain no RAW U+2028 / U+2029, and
 *   3. round-trip the payload verbatim through JSON decoding.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class HybridNitroWebViewPostMessageTest {

  private val ls = " "
  private val ps = " "

  private val hostile = listOf(
    "",
    "plain",
    "has \"double\" and 'single' quotes",
    "line1\nline2\ttab\r",
    "</script><script>alert(1)</script>",
    "漢字 🎉 unicode",
    "sep${ls}here${ps}too",
    "{\"nested\":\"json\",\"n\":42}",
    "back\\slash",
  )

  @Test
  fun `postMessageScript dispatches message event on document for every payload`() {
    for (payload in hostile) {
      val stmt = HybridNitroWebView.postMessageScript(payload)
      assertTrue(
        "statement must dispatch a `message` event on document: $stmt",
        stmt.startsWith("document.dispatchEvent(new MessageEvent('message',{data:"),
      )
      assertTrue("statement must be closed: $stmt", stmt.endsWith("}));"))
    }
  }

  @Test
  fun `postMessageScript never emits raw line or paragraph separators`() {
    for (payload in hostile) {
      val stmt = HybridNitroWebView.postMessageScript(payload)
      assertFalse(
        "raw U+2028/U+2029 must not survive into the statement for ${payload.length} chars",
        stmt.contains(ls) || stmt.contains(ps),
      )
    }
  }

  @Test
  fun `encodeJsStringLiteral round-trips every payload verbatim through JSON`() {
    for (payload in hostile) {
      val literal = HybridNitroWebView.encodeJsStringLiteral(payload)
      // The post-escape of U+2028/U+2029 yields JSON-legal   /
      // escapes, so the literal is valid JSON and decodes to the payload.
      val decoded = org.json.JSONArray("[$literal]").getString(0)
      assertEquals(
        "emitted literal must decode back to the payload verbatim",
        payload,
        decoded,
      )
    }
  }

  @Test
  fun `encodeJsStringLiteral is quoted and escapes separators`() {
    val enc = HybridNitroWebView.encodeJsStringLiteral("a${ls}b${ps}c")
    assertTrue("must be a quoted JS literal: $enc", enc.startsWith("\"") && enc.endsWith("\""))
    assertTrue("LS/PS must be escaped: $enc", enc.contains("\\u2028") && enc.contains("\\u2029"))
    assertFalse("no raw LS/PS: $enc", enc.contains(ls) || enc.contains(ps))
  }
}
