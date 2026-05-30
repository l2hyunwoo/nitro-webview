package com.margelo.nitro.nitrowebview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Test

private data class FakeWebResourceError(
  override val errorCode: Int,
  override val errorDescription: String,
) : WebResourceErrorSource

private data class FakeWebResourceRequest(
  override val url: String?,
) : WebResourceRequestSource

class NitroWebViewErrorMapperTest {

  @Test
  fun `event_fromTypicalErrorHostLookup_mapsAllFieldsFaithfully`() {
    val error = FakeWebResourceError(
      errorCode = -2,
      errorDescription = "net::ERR_NAME_NOT_RESOLVED",
    )
    val request = FakeWebResourceRequest(url = "https://nonexistent.example/")

    val event = NitroWebViewErrorMapper.event(error = error, request = request)

    assertEquals(
      "every field of the structured error event must mirror the source WebResourceError + WebResourceRequest",
      MappedNitroWebViewError(
        code = -2,
        description = "net::ERR_NAME_NOT_RESOLVED",
        url = "https://nonexistent.example/",
        domain = "AndroidWebViewErrorDomain",
      ),
      event,
    )
  }

  @Test
  fun `event_code_isPropagatedVerbatim_includingNegatives`() {
    val cases: List<Int> = listOf(
      -1,
      -2,
      -6,
      -8,
      -10,
      -11,
      0,
      42,
      999,
    )
    for (raw in cases) {
      val error = FakeWebResourceError(errorCode = raw, errorDescription = "x")
      val event = NitroWebViewErrorMapper.event(
        error = error,
        request = FakeWebResourceRequest(url = "https://x.test/"),
      )
      assertEquals(
        "code must round-trip from WebResourceError.errorCode (failed for $raw)",
        raw,
        event.code,
      )
    }
  }

  @Test
  fun `event_description_isPropagatedVerbatim`() {
    val cases = listOf(
      "net::ERR_NAME_NOT_RESOLVED",
      "net::ERR_CONNECTION_REFUSED",
      "net::ERR_SSL_PROTOCOL_ERROR",
      "Frame load interrupted",
      "",
      "漢字 with 🎉 and < & >",
    )
    for (raw in cases) {
      val error = FakeWebResourceError(errorCode = -6, errorDescription = raw)
      val event = NitroWebViewErrorMapper.event(
        error = error,
        request = FakeWebResourceRequest(url = "https://x.test/"),
      )
      assertEquals(
        "description must round-trip verbatim (failed for \"$raw\")",
        raw,
        event.description,
      )
    }
  }

  @Test
  fun `event_domain_isAlwaysTheStableAndroidMirrorString`() {
    val cases = listOf(-1, -2, -6, 0, 42, 999)
    for (code in cases) {
      val event = NitroWebViewErrorMapper.event(
        error = FakeWebResourceError(errorCode = code, errorDescription = "x"),
        request = FakeWebResourceRequest(url = "https://x.test/"),
      )
      assertEquals(
        "domain must always be the stable Android mirror string",
        "AndroidWebViewErrorDomain",
        event.domain,
      )
      assertEquals(
        "domain must match the public constant exposed by the mapper",
        NitroWebViewErrorMapper.ANDROID_ERROR_DOMAIN,
        event.domain,
      )
    }
  }

  @Test
  fun `event_url_prefersRequestUrl_overFallback`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "x"),
      request = FakeWebResourceRequest(url = "https://from-request.test/"),
      fallbackUrl = "https://from-fallback.test/",
    )
    assertEquals("https://from-request.test/", event.url)
  }

  @Test
  fun `event_url_fallsBackToFallbackUrl_whenRequestIsNull`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "x"),
      request = null,
      fallbackUrl = "https://delegate-knew.test/",
    )
    assertEquals("https://delegate-knew.test/", event.url)
  }

  @Test
  fun `event_url_fallsBackToFallbackUrl_whenRequestUrlIsNull`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "x"),
      request = FakeWebResourceRequest(url = null),
      fallbackUrl = "https://delegate-knew.test/",
    )
    assertEquals(
      "an explicit-null request.url must fall through to the fallback",
      "https://delegate-knew.test/",
      event.url,
    )
  }

  @Test
  fun `event_url_fallsBackToFallbackUrl_whenRequestUrlIsEmpty`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "x"),
      request = FakeWebResourceRequest(url = ""),
      fallbackUrl = "https://delegate-knew.test/",
    )
    assertEquals(
      "an empty request.url must not be forwarded as the failing URL — fall through",
      "https://delegate-knew.test/",
      event.url,
    )
  }

  @Test
  fun `event_url_collapsesToEmptyString_whenNothingAvailable`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "x"),
      request = null,
      fallbackUrl = null,
    )
    assertEquals(
      "url must collapse to empty string, NEVER null, to preserve JS contract",
      "",
      event.url,
    )
  }

  @Test
  fun `event_url_collapsesToEmptyString_whenAllInputsAreEmptyOrNull`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "x"),
      request = FakeWebResourceRequest(url = ""),
      fallbackUrl = "",
    )
    assertEquals("", event.url)
  }

  @Test
  fun `extractFailingURL_resolutionLadder`() {
    assertEquals(
      "https://one.test/",
      NitroWebViewErrorMapper.extractFailingURL(
        request = FakeWebResourceRequest(url = "https://one.test/"),
        fallbackUrl = "https://fb.test/",
      ),
    )

    assertEquals(
      "https://two.test/",
      NitroWebViewErrorMapper.extractFailingURL(
        request = null,
        fallbackUrl = "https://two.test/",
      ),
    )

    assertEquals(
      "https://two.test/",
      NitroWebViewErrorMapper.extractFailingURL(
        request = FakeWebResourceRequest(url = null),
        fallbackUrl = "https://two.test/",
      ),
    )

    assertEquals(
      "https://two.test/",
      NitroWebViewErrorMapper.extractFailingURL(
        request = FakeWebResourceRequest(url = ""),
        fallbackUrl = "https://two.test/",
      ),
    )

    assertEquals(
      "",
      NitroWebViewErrorMapper.extractFailingURL(
        request = null,
        fallbackUrl = null,
      ),
    )
    assertEquals(
      "",
      NitroWebViewErrorMapper.extractFailingURL(
        request = FakeWebResourceRequest(url = ""),
        fallbackUrl = "",
      ),
    )
  }

  @Test
  fun `event_isDeterministic_forIdenticalInputs`() {
    val mkError = { FakeWebResourceError(errorCode = -6, errorDescription = "net::ERR_CONNECT") }
    val mkReq = { FakeWebResourceRequest(url = "https://example.test/") }

    val first = NitroWebViewErrorMapper.event(error = mkError(), request = mkReq())
    val second = NitroWebViewErrorMapper.event(error = mkError(), request = mkReq())

    assertEquals(first, second)
  }

  @Test
  fun `event_differsForDifferentInputs`() {
    val a = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "host"),
      request = FakeWebResourceRequest(url = "https://a.test/"),
    )
    val b = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -6, errorDescription = "connect"),
      request = FakeWebResourceRequest(url = "https://b.test/"),
    )
    assertNotEquals(a, b)
    assertFalse(a == b)
  }

  @Test
  fun `event_isAgnosticToWhichOnReceivedErrorOverloadTriggeredIt`() {
    val modern = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "net::ERR_NAME_NOT_RESOLVED"),
      request = FakeWebResourceRequest(url = "https://no-such.test/"),
      fallbackUrl = null,
    )

    val deprecated = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -2, errorDescription = "net::ERR_NAME_NOT_RESOLVED"),
      request = null,
      fallbackUrl = "https://no-such.test/",
    )

    assertEquals(
      "both onReceivedError overloads must produce structurally identical events",
      modern,
      deprecated,
    )
    assertEquals(-2, modern.code)
    assertEquals("net::ERR_NAME_NOT_RESOLVED", modern.description)
    assertEquals("https://no-such.test/", modern.url)
    assertEquals("AndroidWebViewErrorDomain", modern.domain)
  }

  @Test
  fun `event_structuralInvariants_areCrossPlatformCompatible`() {
    val event = NitroWebViewErrorMapper.event(
      error = FakeWebResourceError(errorCode = -8, errorDescription = "net::ERR_TIMED_OUT"),
      request = FakeWebResourceRequest(url = "https://slow.test/"),
    )

    assertEquals(-8, event.code)

    assertFalse(
      "description must never be empty when WebResourceError supplied one",
      event.description.isEmpty(),
    )

    assertFalse(
      "url must never be empty when a request URL was supplied",
      event.url.isEmpty(),
    )

    assertFalse(
      "domain must always be a non-empty string for cross-platform parity",
      event.domain.isEmpty(),
    )
  }
}
