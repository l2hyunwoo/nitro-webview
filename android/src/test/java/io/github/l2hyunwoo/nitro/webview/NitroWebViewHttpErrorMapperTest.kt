package io.github.l2hyunwoo.nitro.webview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

private data class FakeWebResourceResponse(
  override val statusCode: Int,
  override val reasonPhrase: String,
) : WebResourceResponseSource

private data class FakeHttpErrorRequest(
  override val url: String?,
) : WebResourceRequestSource

class NitroWebViewHttpErrorMapperTest {

  @Test
  fun `event_mapsStatusUrlAndReasonPhrase`() {
    val response = FakeWebResourceResponse(statusCode = 404, reasonPhrase = "Not Found")
    val request = FakeHttpErrorRequest(url = "https://example.test/missing")

    val event = NitroWebViewHttpErrorMapper.event(response = response, request = request)

    assertEquals(
      MappedNitroWebViewHttpError(
        statusCode = 404,
        url = "https://example.test/missing",
        description = "Not Found",
      ),
      event,
    )
  }

  @Test
  fun `event_statusCode_isPropagatedVerbatim`() {
    val cases = listOf(400, 401, 403, 404, 418, 429, 500, 502, 503)
    for (code in cases) {
      val event = NitroWebViewHttpErrorMapper.event(
        response = FakeWebResourceResponse(statusCode = code, reasonPhrase = "x"),
        request = FakeHttpErrorRequest(url = "https://x.test/"),
      )
      assertEquals("statusCode must round-trip (failed for $code)", code, event.statusCode)
    }
  }

  @Test
  fun `event_url_prefersRequestUrl_thenFallback_reusingErrorMapperLadder`() {
    val fromRequest = NitroWebViewHttpErrorMapper.event(
      response = FakeWebResourceResponse(statusCode = 500, reasonPhrase = "x"),
      request = FakeHttpErrorRequest(url = "https://from-request.test/"),
      fallbackUrl = "https://from-fallback.test/",
    )
    assertEquals("https://from-request.test/", fromRequest.url)

    val fromFallback = NitroWebViewHttpErrorMapper.event(
      response = FakeWebResourceResponse(statusCode = 500, reasonPhrase = "x"),
      request = FakeHttpErrorRequest(url = null),
      fallbackUrl = "https://from-fallback.test/",
    )
    assertEquals("https://from-fallback.test/", fromFallback.url)

    val collapsed = NitroWebViewHttpErrorMapper.event(
      response = FakeWebResourceResponse(statusCode = 500, reasonPhrase = "x"),
      request = null,
      fallbackUrl = null,
    )
    assertEquals(
      "url must collapse to empty string, never null, to preserve JS contract",
      "",
      collapsed.url,
    )
  }

  @Test
  fun `event_reasonPhrase_isPropagatedVerbatim_includingEmpty`() {
    val cases = listOf("Not Found", "Internal Server Error", "", "漢字 with 🎉")
    for (raw in cases) {
      val event = NitroWebViewHttpErrorMapper.event(
        response = FakeWebResourceResponse(statusCode = 404, reasonPhrase = raw),
        request = FakeHttpErrorRequest(url = "https://x.test/"),
      )
      assertEquals("reasonPhrase must round-trip verbatim (failed for \"$raw\")", raw, event.description)
    }
  }

  /**
   * The load-bearing sub-resource-flood guard. `onReceivedHttpError` fires
   * per failing sub-resource; production drops non-main-frame requests
   * before mapping. This exercises that filter WITHOUT a live WebView.
   */
  @Test
  fun `httpErrorEventOrNull_dropsSubResource_emitsMainFrame`() {
    val response = FakeWebResourceResponse(statusCode = 404, reasonPhrase = "Not Found")
    val request = FakeHttpErrorRequest(url = "https://example.test/page")

    assertNull(
      "a sub-resource HTTP error must be dropped (isForMainFrame = false)",
      NitroWebViewHttpErrorMapper.httpErrorEventOrNull(
        response = response,
        request = request,
        isForMainFrame = false,
      ),
    )

    val mainFrame = NitroWebViewHttpErrorMapper.httpErrorEventOrNull(
      response = response,
      request = request,
      isForMainFrame = true,
    )
    assertNotNull("a main-frame HTTP error must surface", mainFrame)
    assertEquals(404, mainFrame!!.statusCode)
  }
}
