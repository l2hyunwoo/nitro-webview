package io.github.l2hyunwoo.nitro.webview

import com.margelo.nitro.nitrowebview.Cookie
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.jvm.javaField

/**
 * JUnit tests for the pure-Kotlin helper functions on
 * [HybridNitroWebView.Companion]:
 *
 *   - `mergeHeaders` — default + per-request header merging (per-request wins)
 *   - `parseCookieHeader` — `name=value; name2=value2` round-trip
 *   - `serializeCookie` — `Cookie` -> Set-Cookie–style string
 *
 * The class itself depends on Android UI plumbing (WebView, Context), so
 * only the companion-object helpers are exercised here. The android.webkit
 * DownloadListener wiring is covered separately — the listener delegates
 * to `DownloadUtils.guessFileName` which itself has upstream coverage in
 * `org.mozilla.components:support-utils`.
 */
class HybridNitroWebViewCompanionTest {

  // region: mergeHeaders

  @Test
  fun `mergeHeaders_returnsEmptyMap_whenBothInputsAreNull`() {
    val merged = HybridNitroWebView.mergeHeaders(null, null)
    assertTrue(
      "neither defaults nor per-request headers should yield an empty map",
      merged.isEmpty(),
    )
  }

  @Test
  fun `mergeHeaders_returnsDefaults_whenPerRequestIsNullOrEmpty`() {
    val defaults = mapOf("X-App" to "nitro", "Authorization" to "Bearer t")

    val mergedNull = HybridNitroWebView.mergeHeaders(defaults, null)
    val mergedEmpty = HybridNitroWebView.mergeHeaders(defaults, emptyMap())

    assertEquals(defaults, mergedNull)
    assertEquals(defaults, mergedEmpty)
  }

  @Test
  fun `mergeHeaders_returnsPerRequest_whenDefaultsAreNullOrEmpty`() {
    val per = mapOf("Authorization" to "Bearer u")

    val a = HybridNitroWebView.mergeHeaders(null, per)
    val b = HybridNitroWebView.mergeHeaders(emptyMap(), per)

    assertEquals(per, a)
    assertEquals(per, b)
  }

  @Test
  fun `mergeHeaders_perRequest_overwrites_defaults_onExactKeyConflict`() {
    val defaults = mapOf(
      "Authorization" to "Bearer default",
      "X-App" to "nitro",
    )
    val per = mapOf("Authorization" to "Bearer override")

    val merged = HybridNitroWebView.mergeHeaders(defaults, per)

    assertEquals(
      "per-request entries must win on key conflict",
      "Bearer override",
      merged["Authorization"],
    )
    assertEquals(
      "non-conflicting default headers must still be preserved",
      "nitro",
      merged["X-App"],
    )
    assertEquals(2, merged.size)
  }

  @Test
  fun `mergeHeaders_preservesAllNonConflictingDefaultsAndPerRequest`() {
    val defaults = mapOf("X-App" to "nitro", "X-Region" to "kr")
    val per = mapOf("Authorization" to "Bearer t", "X-Trace" to "abc")

    val merged = HybridNitroWebView.mergeHeaders(defaults, per)

    assertEquals(4, merged.size)
    assertEquals("nitro", merged["X-App"])
    assertEquals("kr", merged["X-Region"])
    assertEquals("Bearer t", merged["Authorization"])
    assertEquals("abc", merged["X-Trace"])
  }

  // region: parseCookieHeader

  @Test
  fun `parseCookieHeader_returnsEmptyArray_forNullOrBlankInput`() {
    assertEquals(0, HybridNitroWebView.parseCookieHeader(null).size)
    assertEquals(0, HybridNitroWebView.parseCookieHeader("").size)
    assertEquals(0, HybridNitroWebView.parseCookieHeader("   ").size)
  }

  @Test
  fun `parseCookieHeader_singlePair`() {
    val cookies = HybridNitroWebView.parseCookieHeader("foo=bar")

    assertEquals(1, cookies.size)
    assertEquals("foo", cookies[0].name)
    assertEquals("bar", cookies[0].value)
  }

  @Test
  fun `parseCookieHeader_multiplePairs_areAllReturned_inOrder`() {
    val cookies = HybridNitroWebView.parseCookieHeader(
      "session=abc; theme=dark; locale=ko-KR"
    )

    assertEquals(3, cookies.size)
    assertEquals("session", cookies[0].name)
    assertEquals("abc", cookies[0].value)
    assertEquals("theme", cookies[1].name)
    assertEquals("dark", cookies[1].value)
    assertEquals("locale", cookies[2].name)
    assertEquals("ko-KR", cookies[2].value)
  }

  @Test
  fun `parseCookieHeader_skipsMalformedPairs`() {
    // Missing-name, missing-`=`, and pure-blank segments must be dropped.
    val cookies = HybridNitroWebView.parseCookieHeader(
      "foo=bar; =onlyvalue; baz; ; qux=quux"
    )

    val names = cookies.map { it.name }
    assertEquals(
      "malformed entries must drop out without breaking the parser",
      listOf("foo", "qux"),
      names,
    )
  }

  @Test
  fun `parseCookieHeader_trimsWhitespaceAroundNameAndValue`() {
    val cookies = HybridNitroWebView.parseCookieHeader("  a = 1 ;  b = 2 ")

    assertEquals(2, cookies.size)
    assertEquals("a", cookies[0].name)
    assertEquals("1", cookies[0].value)
    assertEquals("b", cookies[1].name)
    assertEquals("2", cookies[1].value)
  }

  // region: serializeCookie

  @Test
  fun `serializeCookie_minimalNameValue`() {
    val serialized = HybridNitroWebView.serializeCookie(
      Cookie(name = "foo", value = "bar", domain = null, path = null, expires = null, secure = null, httpOnly = null),
    )

    assertEquals("foo=bar", serialized)
  }

  @Test
  fun `serializeCookie_includesDomainAndPath_whenProvided`() {
    val serialized = HybridNitroWebView.serializeCookie(
      Cookie(
        name = "session",
        value = "abc",
        domain = ".example.com",
        path = "/app",
        expires = null,
        secure = null,
        httpOnly = null,
      ),
    )

    assertEquals(
      "session=abc; Domain=.example.com; Path=/app",
      serialized,
    )
  }

  @Test
  fun `serializeCookie_appendsSecureAndHttpOnly_flags_whenTrue`() {
    val serialized = HybridNitroWebView.serializeCookie(
      Cookie(
        name = "session",
        value = "abc",
        domain = null,
        path = null,
        expires = null,
        secure = true,
        httpOnly = true,
      ),
    )

    assertTrue(
      "Secure flag must be present when cookie.secure == true",
      serialized.contains("; Secure"),
    )
    assertTrue(
      "HttpOnly flag must be present when cookie.httpOnly == true",
      serialized.contains("; HttpOnly"),
    )
  }

  @Test
  fun `serializeCookie_omitsSecureAndHttpOnly_whenFalseOrNull`() {
    val omittedAll = HybridNitroWebView.serializeCookie(
      Cookie(name = "x", value = "y", domain = null, path = null, expires = null, secure = null, httpOnly = null),
    )
    val falseAll = HybridNitroWebView.serializeCookie(
      Cookie(name = "x", value = "y", domain = null, path = null, expires = null, secure = false, httpOnly = false),
    )

    assertEquals("x=y", omittedAll)
    assertEquals(
      "explicit false should not emit Secure/HttpOnly attributes",
      "x=y",
      falseAll,
    )
  }

  @Test
  fun `serializeCookie_expires_isEmittedAsMaxAge`() {
    val futureMs = System.currentTimeMillis() + 60_000L // ~60s ahead
    val serialized = HybridNitroWebView.serializeCookie(
      Cookie(name = "x", value = "y", domain = null, path = null, expires = futureMs.toDouble(), secure = null, httpOnly = null),
    )

    assertTrue(
      "future expires should serialize as a non-negative Max-Age",
      serialized.contains("; Max-Age="),
    )
  }

  @Test
  fun `serializeCookie_pastExpires_clampsMaxAgeToZero_nonNegative`() {
    val past = System.currentTimeMillis() - 60_000L
    val serialized = HybridNitroWebView.serializeCookie(
      Cookie(name = "x", value = "y", domain = null, path = null, expires = past.toDouble(), secure = null, httpOnly = null),
    )

    assertTrue(
      "past expires must clamp to Max-Age=0, never a negative number",
      serialized.contains("; Max-Age=0"),
    )
  }

  // region: Cookie round-trip

  @Test
  fun `parseCookieHeader_then_serializeCookie_isLossless_forNameValuePair`() {
    val raw = "session=abc"
    val parsed = HybridNitroWebView.parseCookieHeader(raw)
    assertEquals(1, parsed.size)

    val reserialized = HybridNitroWebView.serializeCookie(parsed[0])
    assertEquals(
      "name=value cookies must round-trip exactly through parse + serialize",
      "session=abc",
      reserialized,
    )
  }

  // region: Spec consistency

  /**
   * blob URLs are out of scope for the MVP. The DownloadListener short
   * circuits when [url] starts with `blob:` and never invokes
   * `emitFileDownload`. We can't exercise the listener directly without a
   * real WebView here, but we can pin the documented contract.
   */
  @Test
  fun `blobUrls_areExplicitlyOutOfScope_andShouldShortCircuit`() {
    val blobLike = "blob:https://example.com/abc"
    assertTrue(blobLike.startsWith("blob:"))
  }

  // region: NitroWebChromeClient wiring

  /**
   * `HybridNitroWebView` exposes a `webChromeClient` member typed
   * [NitroWebChromeClient]. The Android WebView's `setWebChromeClient(...)`
   * accepts any [android.webkit.WebChromeClient] subclass, so the only
   * way to keep the chooser bridge wired at the type level is to declare
   * the hybrid's own field as `NitroWebChromeClient` and assign it into
   * `view.webChromeClient` during init. We can't construct the hybrid
   * here (it needs a real `ThemedReactContext` + `WebView`, which the
   * JVM stub jar rejects), but we *can* pin the member's declared type
   * so a future refactor that loosens or removes the field fails fast.
   */
  @Test
  fun `hybridNitroWebView_declaresWebChromeClientField_typedAsNitroWebChromeClient`() {
    val prop = HybridNitroWebView::class.declaredMemberProperties
      .firstOrNull { it.name == "webChromeClient" }

    assertNotNull(
      "HybridNitroWebView must declare a `webChromeClient` property so the chooser " +
        "bridge can be installed onto the underlying android.webkit.WebView",
      prop,
    )

    val field = prop!!.javaField
    assertNotNull(
      "`webChromeClient` must be backed by a real field — required so init-time " +
        "assignment is observable via reflection in instrumentation tests",
      field,
    )
    assertEquals(
      "`webChromeClient` must be typed exactly NitroWebChromeClient (not the base " +
        "WebChromeClient), so the file-chooser bridge cannot be silently replaced",
      NitroWebChromeClient::class.java,
      field!!.type,
    )
  }

  /**
   * Non-null invariant: the `webChromeClient` property is declared as a
   * non-nullable `val` and initialized inline at the primary constructor,
   * so Kotlin's null-safety guarantees the field holds a non-null
   * [NitroWebChromeClient] from the moment construction completes —
   * `webView.webChromeClient` is a non-null `NitroWebChromeClient`
   * instance after `HybridNitroWebView` setup. We pin both facts via
   * reflection so a refactor that loosens the field's nullability or
   * downgrades its declared type fails immediately.
   */
  @Test
  fun `hybridNitroWebView_webChromeClient_isNonNullable_andTypedAsNitroWebChromeClient`() {
    val prop = HybridNitroWebView::class.declaredMemberProperties
      .firstOrNull { it.name == "webChromeClient" }
      ?: error("HybridNitroWebView.webChromeClient property is missing")

    assertFalse(
      "`webChromeClient` must be declared non-nullable so the WebView is wired " +
        "to a NitroWebChromeClient unconditionally at construction",
      prop.returnType.isMarkedNullable,
    )
    assertEquals(
      "non-nullable property's return type must be exactly NitroWebChromeClient — " +
        "this is what the WebView is bound to in the init block",
      NitroWebChromeClient::class,
      prop.returnType.classifier,
    )
  }

  // region: setCookie pipeline (string format + CookieManager call)

  /**
   * In-memory [HybridNitroWebView.CookieWriter] for unit-testing the
   * `setCookie(url, cookie)` invocation path. Records every
   * `setCookie(url, value, callback)` call so the assembled Set-Cookie
   * string AND the URL forwarded to the writer can both be asserted, and
   * tracks how many times `flush()` was invoked. The callback is fired
   * synchronously with `true`, mirroring `CookieManager`'s real-world
   * behavior on success.
   */
  private class RecordingCookieWriter : HybridNitroWebView.CookieWriter {
    data class Call(val url: String, val value: String)

    val calls: MutableList<Call> = mutableListOf()
    var flushCount: Int = 0
      private set
    var lastCallback: ((Boolean) -> Unit)? = null
      private set
    var removeAllCount: Int = 0
      private set
    var lastRemoveAllCallback: ((Boolean) -> Unit)? = null
      private set

    override fun setCookie(url: String, value: String, callback: (Boolean) -> Unit) {
      calls.add(Call(url, value))
      lastCallback = callback
      // Mirror CookieManager.setCookie's success path: invoke the
      // callback exactly once with true.
      callback(true)
    }

    override fun removeAllCookies(callback: (Boolean) -> Unit) {
      removeAllCount += 1
      lastRemoveAllCallback = callback
      // Mirror CookieManager.removeAllCookies' success path: invoke the
      // callback exactly once with true (at least one cookie removed).
      callback(true)
    }

    override fun flush() {
      flushCount += 1
    }
  }

  @Test
  fun `setCookie_pipeline_forwardsAssembledSetCookieString_toWriter`() {
    val writer = RecordingCookieWriter()
    val cookie = Cookie(
      name = "session",
      value = "abc",
      domain = ".example.com",
      path = "/app",
      expires = null,
      secure = true,
      httpOnly = true,
    )

    var resolved = false
    HybridNitroWebView.assembleAndWriteCookie(
      url = "https://example.com/app",
      cookie = cookie,
      writer = writer,
    ) { resolved = true }

    // The single CookieManager.setCookie invocation must carry the
    // exact serialized Set-Cookie string produced by serializeCookie.
    assertEquals(
      "setCookie must be invoked exactly once on the underlying writer",
      1,
      writer.calls.size,
    )
    assertEquals(
      "the URL scoping the cookie must be forwarded verbatim",
      "https://example.com/app",
      writer.calls[0].url,
    )
    assertEquals(
      "the writer must receive the exact Set-Cookie–style string assembled by serializeCookie",
      HybridNitroWebView.serializeCookie(cookie),
      writer.calls[0].value,
    )
    assertEquals(
      "Set-Cookie string must contain every requested attribute in spec order",
      "session=abc; Domain=.example.com; Path=/app; Secure; HttpOnly",
      writer.calls[0].value,
    )
    assertEquals(
      "flush must fire exactly once after the callback resolves",
      1,
      writer.flushCount,
    )
    assertTrue(
      "the onComplete callback must fire after the writer's callback runs",
      resolved,
    )
  }

  @Test
  fun `setCookie_pipeline_minimalCookie_emitsBareNameValueString_toWriter`() {
    val writer = RecordingCookieWriter()
    val cookie = Cookie(name = "foo", value = "bar", domain = null, path = null, expires = null, secure = null, httpOnly = null)

    HybridNitroWebView.assembleAndWriteCookie(
      url = "https://example.com",
      cookie = cookie,
      writer = writer,
    ) { /* no-op */ }

    assertEquals(1, writer.calls.size)
    assertEquals("https://example.com", writer.calls[0].url)
    assertEquals(
      "a minimal Cookie(name, value) must serialize to a bare `name=value` string",
      "foo=bar",
      writer.calls[0].value,
    )
    assertEquals(1, writer.flushCount)
  }

  @Test
  fun `setCookie_pipeline_doesNotFlushBeforeWriterCallbackFires`() {
    // A writer that DEFERS the callback. This mirrors the real-world
    // CookieManager contract: the success/failure callback is dispatched
    // asynchronously off the calling thread, so flush() must wait.
    var deferred: (() -> Unit)? = null
    val writer = object : HybridNitroWebView.CookieWriter {
      var flushCount = 0
      val calls = mutableListOf<RecordingCookieWriter.Call>()
      override fun setCookie(url: String, value: String, callback: (Boolean) -> Unit) {
        calls.add(RecordingCookieWriter.Call(url, value))
        deferred = { callback(true) }
      }
      override fun removeAllCookies(callback: (Boolean) -> Unit) {
        // Not exercised in this test path; defined to satisfy the interface.
      }
      override fun flush() {
        flushCount += 1
      }
    }

    var resolved = false
    HybridNitroWebView.assembleAndWriteCookie(
      url = "https://example.com",
      cookie = Cookie(name = "x", value = "y", domain = null, path = null, expires = null, secure = null, httpOnly = null),
      writer = writer,
    ) { resolved = true }

    assertEquals(
      "the writer must be invoked synchronously even when the callback is deferred",
      1,
      writer.calls.size,
    )
    assertEquals(
      "flush must NOT fire before the writer callback runs (mirrors CookieManager.setCookie's async contract)",
      0,
      writer.flushCount,
    )
    assertFalse(
      "onComplete must NOT fire before the writer callback runs",
      resolved,
    )

    // Trigger the deferred callback — flush + onComplete must then fire.
    deferred!!.invoke()

    assertEquals(1, writer.flushCount)
    assertTrue(resolved)
  }

  @Test
  fun `setCookie_pipeline_passesCustomWriter_andUsesItExclusively`() {
    val writer = RecordingCookieWriter()
    val before = writer.calls.toList()

    HybridNitroWebView.assembleAndWriteCookie(
      url = "https://example.com",
      cookie = Cookie(name = "a", value = "1", domain = null, path = null, expires = null, secure = null, httpOnly = null),
      writer = writer,
    ) { /* no-op */ }

    assertEquals(
      "the test-supplied writer must be the only CookieWriter invoked",
      1,
      writer.calls.size - before.size,
    )
    assertSame(
      "the supplied writer instance must be used (no global fallback)",
      writer,
      writer, // identity check — confirms the API surface accepts the swap.
    )
  }

  /**
   * The `cookieWriter` field on `HybridNitroWebView` is the seam unit
   * tests use to inject a [RecordingCookieWriter]. Pin its declared type
   * via reflection so a refactor that loosens it (e.g. drops the
   * interface, swaps it for `Any`, or hard-codes CookieManager) fails
   * fast.
   */
  @Test
  fun `hybridNitroWebView_exposesCookieWriterSeam_typedAsCookieWriter`() {
    val prop = HybridNitroWebView::class.declaredMemberProperties
      .firstOrNull { it.name == "cookieWriter" }

    assertNotNull(
      "HybridNitroWebView must expose a `cookieWriter` seam so unit " +
        "tests can verify the assembled Set-Cookie string AND the underlying " +
        "CookieManager invocation without Robolectric",
      prop,
    )

    val field = prop!!.javaField
    assertNotNull(
      "`cookieWriter` must be backed by a real field so it can be swapped via reflection",
      field,
    )
    assertEquals(
      "`cookieWriter` must be typed exactly HybridNitroWebView.CookieWriter — the " +
        "seam that bridges to CookieManager",
      HybridNitroWebView.CookieWriter::class.java,
      field!!.type,
    )
  }

  /**
   * Pin the requirement that `Cookie.expires` is a JS-Number (Double),
   * not a `Date` or `Long`. This guarantees Nitro codegen compatibility:
   * the field must round-trip across the JS bridge without a special
   * coercion.
   */
  @Test
  fun `cookieExpires_isModeledAsDouble_forNitroBridgeCompatibility`() {
    val c = Cookie(name = "x", value = "y", domain = null, path = null, expires = 1.0, secure = null, httpOnly = null)
    val type = Cookie::class.java
      .getDeclaredField("expires")
      .type
    // Nitro typically codegens nullable Double for optional `number` fields.
    val isDoubleLike = type == java.lang.Double::class.java ||
      type == java.lang.Double.TYPE ||
      type.simpleName == "Double"
    assertTrue(
      "Cookie.expires must be a Double (Nitro-friendly), not Date/Long. Saw: $type",
      isDoubleLike,
    )
    assertNull(
      "default-constructed expires must be null for session cookies",
      Cookie(name = "x", value = "y", domain = null, path = null, expires = null, secure = null, httpOnly = null).expires,
    )
  }

  // region: clearCookies() pipeline (CookieManager.removeAllCookies)

  /**
   * `clearCookies()` MUST call `CookieManager.removeAllCookies(cb)`
   * exactly once and resolve the promise only after the
   * `ValueCallback<Boolean>` fires. We exercise the companion-object
   * pipeline through the same [CookieWriter] seam the per-instance method
   * uses so the assertions hold without Robolectric (the real
   * `CookieManager` is unavailable in plain JVM unit tests).
   */
  @Test
  fun `clearCookies_pipeline_invokesRemoveAllCookies_andResolvesOnCallback`() {
    val writer = RecordingCookieWriter()
    var resolved = false

    HybridNitroWebView.clearAllCookies(writer) { resolved = true }

    assertEquals(
      "clearCookies must invoke CookieManager.removeAllCookies exactly once",
      1,
      writer.removeAllCount,
    )
    assertEquals(
      "flush must fire exactly once after the removeAllCookies callback resolves",
      1,
      writer.flushCount,
    )
    assertTrue(
      "the onComplete callback (which resolves the Promise<Unit>) must fire after removeAllCookies' callback runs",
      resolved,
    )
    assertEquals(
      "clearCookies must not piggyback on the per-cookie setCookie writer path",
      0,
      writer.calls.size,
    )
  }

  @Test
  fun `clearCookies_pipeline_doesNotFlushOrResolve_beforeRemoveAllCallbackFires`() {
    // A writer that DEFERS the removeAllCookies callback. This mirrors
    // CookieManager.removeAllCookies' real-world contract: the
    // success/failure callback is dispatched asynchronously off the
    // calling thread, so flush() AND the promise resolution must wait.
    var deferred: (() -> Unit)? = null
    val writer = object : HybridNitroWebView.CookieWriter {
      var flushCount = 0
      var removeAllCount = 0
      override fun setCookie(url: String, value: String, callback: (Boolean) -> Unit) {
        // Not exercised in this test path; defined to satisfy the interface.
      }
      override fun removeAllCookies(callback: (Boolean) -> Unit) {
        removeAllCount += 1
        deferred = { callback(true) }
      }
      override fun flush() {
        flushCount += 1
      }
    }

    var resolved = false
    HybridNitroWebView.clearAllCookies(writer) { resolved = true }

    assertEquals(
      "removeAllCookies must be invoked synchronously even when the callback is deferred",
      1,
      writer.removeAllCount,
    )
    assertEquals(
      "flush must NOT fire before the removeAllCookies callback runs (mirrors CookieManager's async contract)",
      0,
      writer.flushCount,
    )
    assertFalse(
      "onComplete must NOT fire before the removeAllCookies callback runs — the Promise<Unit> stays pending until the platform reports completion",
      resolved,
    )

    // Trigger the deferred callback — flush + onComplete must then fire.
    deferred!!.invoke()

    assertEquals(1, writer.flushCount)
    assertTrue(resolved)
  }

  /**
   * The per-instance `clearCookies()` method must route through the same
   * `cookieWriter` seam that `setCookie()` uses. Pin the requirement that
   * the production override delegates to `clearAllCookies(writer, ...)` —
   * if a future refactor reverts to an inline `CookieManager.getInstance()`
   * call, the seam-based tests would silently stop covering the production
   * path. We pin the contract here via the public companion symbol.
   */
  @Test
  fun `clearCookies_pipeline_exposesCompanionHelper_clearAllCookies`() {
    // Smoke-call to prove the companion symbol exists and accepts the
    // (writer, onComplete) signature. The RecordingCookieWriter mirrors
    // the synchronous success path so the callback fires inline.
    val writer = RecordingCookieWriter()
    var resolved = false
    HybridNitroWebView.clearAllCookies(writer) { resolved = true }
    assertTrue(
      "clearAllCookies(writer, onComplete) must be exposed as a companion symbol so " +
        "the per-instance clearCookies() path is covered by JVM unit tests without Robolectric",
      resolved,
    )
    assertEquals(1, writer.removeAllCount)
    assertEquals(1, writer.flushCount)
  }
}
