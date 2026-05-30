package com.margelo.nitro.nitrowebview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private class SpyHtmlLoader : WebViewHTMLLoader {
  data class Invocation(
    val baseUrl: String?,
    val data: String,
    val mimeType: String,
    val encoding: String,
    val historyUrl: String?,
  )

  val invocations: MutableList<Invocation> = mutableListOf()

  override fun loadDataWithBaseUrlPayload(
    baseUrl: String?,
    data: String,
    mimeType: String,
    encoding: String,
    historyUrl: String?,
  ) {
    invocations.add(
      Invocation(
        baseUrl = baseUrl,
        data = data,
        mimeType = mimeType,
        encoding = encoding,
        historyUrl = historyUrl,
      )
    )
  }
}

class NitroWebViewSourceHandlerTest {

  @Test
  fun `applyHtmlPayload_withNoBaseUrl_callsLoadDataWithBaseURL_withNullBaseUrl`() {
    val handler = NitroWebViewSourceHandler()
    val spy = SpyHtmlLoader()
    val payload = NitroLoadHtmlPayload(html = "<h1>Hello</h1>")

    handler.applyHtmlPayload(payload, spy)

    assertEquals(
      "loadDataWithBaseURL must be invoked exactly once per applyHtmlPayload call",
      1,
      spy.invocations.size,
    )
    val call = spy.invocations.single()
    assertEquals(
      "the html body must be forwarded byte-for-byte to loadDataWithBaseURL's `data` arg",
      "<h1>Hello</h1>",
      call.data,
    )
    assertNull(
      "when no baseUrl is supplied, baseUrl must be null",
      call.baseUrl,
    )
    assertEquals("text/html", call.mimeType)
    assertEquals("UTF-8", call.encoding)
    assertNull("historyUrl must always be null for the HtmlSource branch", call.historyUrl)
  }

  @Test
  fun `applyHtmlPayload_withBaseUrl_callsLoadDataWithBaseURL_withProvidedBaseUrl`() {
    val handler = NitroWebViewSourceHandler()
    val spy = SpyHtmlLoader()
    val payload = NitroLoadHtmlPayload(
      html = "<a href=\"/about\">About</a>",
      baseUrlString = "https://example.com",
    )

    handler.applyHtmlPayload(payload, spy)

    assertEquals(1, spy.invocations.size)
    val call = spy.invocations.single()
    assertEquals(
      "the html body must be forwarded unchanged when a baseUrl is present",
      "<a href=\"/about\">About</a>",
      call.data,
    )
    assertEquals(
      "baseUrl must be the raw string supplied via the JS bridge",
      "https://example.com",
      call.baseUrl,
    )
    assertEquals("text/html", call.mimeType)
    assertEquals("UTF-8", call.encoding)
    assertNull(call.historyUrl)
  }

  @Test
  fun `applyHtmlPayload_preservesHtmlBodyVerbatim_includingMultibyte`() {
    val handler = NitroWebViewSourceHandler()
    val spy = SpyHtmlLoader()
    val body = listOf(
      "<!DOCTYPE html>",
      "<html><head><meta charset=\"utf-8\"><title>π</title></head>",
      "<body>",
      "  <p>Hello, world! 漢字 🎉</p>",
      "  <script>window.x = 1 < 2 && 3 > 0;</script>",
      "</body></html>",
    ).joinToString(separator = "\n")

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html = body, baseUrlString = null),
      spy,
    )

    assertEquals(1, spy.invocations.size)
    assertEquals(body, spy.invocations.single().data)
  }

  @Test
  fun `applyHtmlPayload_emptyBaseUrl_isCollapsedToNull`() {
    val handler = NitroWebViewSourceHandler()
    val spy = SpyHtmlLoader()

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html = "<p>x</p>", baseUrlString = ""),
      spy,
    )

    assertEquals(1, spy.invocations.size)
    assertNull(
      "empty baseUrl must collapse to a null baseUrl, not an empty string",
      spy.invocations.single().baseUrl,
    )
  }

  @Test
  fun `applyHtmlPayload_supportsHttp_https_andFileSchemes`() {
    val handler = NitroWebViewSourceHandler()
    val cases = listOf(
      "http://example.com",
      "https://example.com",
      "file:///android_asset/",
    )

    for (raw in cases) {
      val spy = SpyHtmlLoader()
      handler.applyHtmlPayload(
        NitroLoadHtmlPayload(html = "<p>x</p>", baseUrlString = raw),
        spy,
      )
      assertEquals(
        "baseUrl must round-trip the supplied scheme $raw",
        raw,
        spy.invocations.single().baseUrl,
      )
    }
  }

  @Test
  fun `normalizeBaseUrl_handlesNull_empty_andValidStrings`() {
    assertNull(NitroWebViewSourceHandler.normalizeBaseUrl(null))
    assertNull(NitroWebViewSourceHandler.normalizeBaseUrl(""))
    assertEquals(
      "https://example.com",
      NitroWebViewSourceHandler.normalizeBaseUrl("https://example.com"),
    )
    assertEquals(
      "file:///android_asset/",
      NitroWebViewSourceHandler.normalizeBaseUrl("file:///android_asset/"),
    )
  }

  @Test
  fun `applyHtmlPayload_alwaysUsesTextHtmlMimeAndUtf8Encoding`() {
    val handler = NitroWebViewSourceHandler()
    val spy = SpyHtmlLoader()

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html = "<p>x</p>", baseUrlString = "https://x.test"),
      spy,
    )

    val call = spy.invocations.single()
    assertEquals(NitroWebViewSourceHandler.MIME_TYPE, call.mimeType)
    assertEquals(NitroWebViewSourceHandler.ENCODING, call.encoding)
    assertEquals("text/html", call.mimeType)
    assertEquals("UTF-8", call.encoding)
  }

  @Test
  fun `applyHtmlPayload_invokesLoaderOncePerCall`() {
    val handler = NitroWebViewSourceHandler()
    val spy = SpyHtmlLoader()

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html = "<p>one</p>"),
      spy,
    )
    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html = "<p>two</p>", baseUrlString = "https://a.test"),
      spy,
    )

    assertEquals(2, spy.invocations.size)
    assertEquals("<p>one</p>", spy.invocations[0].data)
    assertNull(spy.invocations[0].baseUrl)
    assertEquals("<p>two</p>", spy.invocations[1].data)
    assertEquals("https://a.test", spy.invocations[1].baseUrl)
  }

  @Test
  fun `payload_distinguishes_null_from_empty_baseUrl`() {
    val nullCase = NitroLoadHtmlPayload(html = "<p>x</p>")
    val emptyCase = NitroLoadHtmlPayload(html = "<p>x</p>", baseUrlString = "")

    assertFalse(
      "payload equality must reflect the JS-bridge difference between null and ''",
      nullCase == emptyCase,
    )
    assertTrue(
      "default constructor implies baseUrlString == null",
      nullCase.baseUrlString == null,
    )
    assertEquals("", emptyCase.baseUrlString)
  }
}
