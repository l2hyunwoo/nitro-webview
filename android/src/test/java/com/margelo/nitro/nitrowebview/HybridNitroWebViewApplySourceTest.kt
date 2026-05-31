package com.margelo.nitro.nitrowebview

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * JUnit tests for the two companion-object helpers extracted from
 * [HybridNitroWebView] to make the URI-source apply path and the download
 * file-name derivation testable without a real `android.webkit.WebView`:
 *
 *   - [HybridNitroWebView.applyUriSource] — merges default + per-request
 *     headers and forwards them to [HybridNitroWebView.UrlLoader].
 *   - [HybridNitroWebView.deriveDownloadFileName] — URL-decodes the
 *     Content-Disposition header, delegates to `DownloadUtils.guessFileName`
 *     as primary, and falls back to `URLUtil.guessFileName` on any exception.
 *
 * `android.webkit.WebView` is unavailable in plain JVM unit tests, so the
 * tests use a fake [HybridNitroWebView.UrlLoader] that records the last
 * invocation and inject lambda seams into [HybridNitroWebView.deriveDownloadFileName]
 * to control both branches without static mocking.
 */
class HybridNitroWebViewApplySourceTest {

  // region: applyUriSource

  /**
   * Fake [HybridNitroWebView.UrlLoader] that records the most-recent
   * `loadUrl` call so tests can assert on both the URL and the header map.
   */
  private class RecordingUrlLoader : HybridNitroWebView.UrlLoader {
    data class Call(val url: String, val headers: Map<String, String>)

    var lastCall: Call? = null
      private set

    override fun loadUrl(url: String, additionalHttpHeaders: Map<String, String>) {
      lastCall = Call(url, additionalHttpHeaders)
    }
  }

  @Test
  fun `applyUriSource_callsLoadUrlWithMergedHeaders`() {
    val loader = RecordingUrlLoader()
    val uriSource = UriSource(
      uri = "https://example.com",
      headers = mapOf("X-Per-Request" to "from-source"),
    )
    val defaults = mapOf("X-App" to "nitro", "X-Per-Request" to "default-value")

    HybridNitroWebView.applyUriSource(uriSource, defaults, loader)

    val call = loader.lastCall
    assertEquals(
      "loadUrl must be called exactly once with the source URI",
      "https://example.com",
      call?.url,
    )
    // Non-conflicting default survives.
    assertEquals(
      "non-conflicting default header must appear in the merged map",
      "nitro",
      call?.headers?.get("X-App"),
    )
    // Per-request wins on conflict.
    assertEquals(
      "per-request header must override default on key conflict",
      "from-source",
      call?.headers?.get("X-Per-Request"),
    )
    assertEquals(
      "merged map must contain exactly two entries",
      2,
      call?.headers?.size,
    )
  }

  @Test
  fun `applyUriSource_perRequestHeadersOverrideDefaults`() {
    val loader = RecordingUrlLoader()
    val uriSource = UriSource(
      uri = "https://api.example.com/data",
      headers = mapOf("Authorization" to "Bearer per-request"),
    )
    val defaults = mapOf("Authorization" to "Bearer default")

    HybridNitroWebView.applyUriSource(uriSource, defaults, loader)

    val headers = loader.lastCall?.headers
    assertEquals(
      "per-request Authorization must override the default",
      "Bearer per-request",
      headers?.get("Authorization"),
    )
    assertEquals(
      "a single conflicting key must yield exactly one entry",
      1,
      headers?.size,
    )
  }

  @Test
  fun `applyUriSource_emptyHeaders_stillInvokesLoadUrl_withEmptyMap`() {
    val loader = RecordingUrlLoader()
    val uriSource = UriSource(
      uri = "https://example.com/empty",
      headers = null,
    )

    HybridNitroWebView.applyUriSource(uriSource, null, loader)

    val call = loader.lastCall
    assertEquals(
      "loadUrl must still be invoked even when both header maps are null",
      "https://example.com/empty",
      call?.url,
    )
    assertEquals(
      "the merged header map must be empty when both inputs are null",
      0,
      call?.headers?.size,
    )
  }

  @Test
  fun `applyUriSource_forwardsExactUri_unmodified`() {
    val loader = RecordingUrlLoader()
    val uri = "https://subdomain.example.com/path?query=1&foo=bar#anchor"
    val uriSource = UriSource(uri = uri, headers = null)

    HybridNitroWebView.applyUriSource(uriSource, null, loader)

    assertEquals(
      "the URI must be forwarded to loadUrl exactly as supplied, without modification",
      uri,
      loader.lastCall?.url,
    )
  }

  // region: deriveDownloadFileName

  @Test
  fun `deriveDownloadFileName_happyPath_callsDownloadUtilsGuessFileName_withDecodedDisposition`() {
    // Records the decoded Content-Disposition string that primary receives.
    var primaryReceivedCd: String? = "NOT_SET"
    var primaryReceivedUrl: String? = null

    val result = HybridNitroWebView.deriveDownloadFileName(
      url = "https://example.com/file",
      contentDisposition = "attachment%3B%20filename%3Dreport.pdf",
      mimetype = "application/pdf",
      decoder = { input, _ ->
        // Simulate URLDecoder.decode succeeding.
        "attachment; filename=report.pdf"
      },
      primary = { cd, _, u, _ ->
        primaryReceivedCd = cd
        primaryReceivedUrl = u
        "report.pdf"
      },
      fallback = { _, _, _ ->
        "fallback.pdf"
      },
    )

    assertEquals(
      "happy-path result must come from the primary (DownloadUtils) branch",
      "report.pdf",
      result,
    )
    assertEquals(
      "primary must receive the decoded Content-Disposition string",
      "attachment; filename=report.pdf",
      primaryReceivedCd,
    )
    assertEquals(
      "primary must receive the original URL unmodified",
      "https://example.com/file",
      primaryReceivedUrl,
    )
  }

  @Test
  fun `deriveDownloadFileName_whenDecoderThrows_fallsBackToUrlUtilGuessFileName`() {
    var fallbackReceivedUrl: String? = null
    var fallbackReceivedCd: String? = "NOT_SET"

    val result = HybridNitroWebView.deriveDownloadFileName(
      url = "https://example.com/download",
      contentDisposition = "malformed%XX",
      mimetype = "application/octet-stream",
      decoder = { _, _ ->
        throw IllegalArgumentException("simulated URLDecoder failure")
      },
      primary = { _, _, _, _ ->
        "should-not-be-called.bin"
      },
      fallback = { u, cd, _ ->
        fallbackReceivedUrl = u
        fallbackReceivedCd = cd
        "fallback-result.bin"
      },
    )

    assertEquals(
      "when the decoder throws the fallback branch must supply the file name",
      "fallback-result.bin",
      result,
    )
    assertEquals(
      "fallback must receive the original (un-decoded) URL",
      "https://example.com/download",
      fallbackReceivedUrl,
    )
    assertEquals(
      "fallback must receive the raw (un-decoded) Content-Disposition string",
      "malformed%XX",
      fallbackReceivedCd,
    )
  }

  @Test
  fun `deriveDownloadFileName_nullContentDisposition_passesNullToPrimary_andDoesNotInvokeDecoder`() {
    var decoderInvoked = false
    var primaryReceivedCd: String? = "SENTINEL"

    val result = HybridNitroWebView.deriveDownloadFileName(
      url = "https://example.com/nocd",
      contentDisposition = null,
      mimetype = null,
      decoder = { _, _ ->
        decoderInvoked = true
        "should-not-be-called"
      },
      primary = { cd, _, _, _ ->
        primaryReceivedCd = cd
        "primary-result.bin"
      },
      fallback = { _, _, _ ->
        "fallback.bin"
      },
    )

    assertEquals(
      "null Content-Disposition must not invoke the decoder",
      false,
      decoderInvoked,
    )
    assertNull(
      "primary must receive null when Content-Disposition is null",
      primaryReceivedCd,
    )
    assertEquals(
      "result must come from the primary branch",
      "primary-result.bin",
      result,
    )
  }

  @Test
  fun `deriveDownloadFileName_whenPrimaryThrows_fallsBackToUrlUtilGuessFileName`() {
    var fallbackInvoked = false

    val result = HybridNitroWebView.deriveDownloadFileName(
      url = "https://example.com/file2",
      contentDisposition = "attachment; filename=doc.pdf",
      mimetype = "application/pdf",
      decoder = { input, _ -> input },
      primary = { _, _, _, _ ->
        throw RuntimeException("simulated DownloadUtils failure")
      },
      fallback = { _, _, _ ->
        fallbackInvoked = true
        "fallback-doc.pdf"
      },
    )

    assertEquals(
      "when primary throws the fallback branch must supply the file name",
      "fallback-doc.pdf",
      result,
    )
    assertEquals(
      "fallback must be invoked when primary throws",
      true,
      fallbackInvoked,
    )
  }
}
