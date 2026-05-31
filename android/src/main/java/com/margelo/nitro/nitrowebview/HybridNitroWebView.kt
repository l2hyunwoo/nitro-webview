package com.margelo.nitro.nitrowebview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.core.Promise
import mozilla.components.support.utils.DownloadUtils
import java.net.URLDecoder

@SuppressLint("SetJavaScriptEnabled")
class HybridNitroWebView(context: ThemedReactContext) : HybridNitroWebViewSpec() {

  override val view: WebView = WebView(context).also { wv ->
    wv.settings.javaScriptEnabled = true
    wv.settings.domStorageEnabled = true
    // Required for `<input type="file">` to open the file chooser via the
    // WebChromeClient bridge (NitroWebChromeClient). Without these, Android
    // WebView short-circuits the input element to a no-op.
    wv.settings.allowFileAccess = true
    wv.settings.allowContentAccess = true
  }

  private val sourceHandler = NitroWebViewSourceHandler()
  private val evaluator = NitroWebViewEvaluateJavaScriptHandler()
  private val htmlLoaderAdapter = AndroidWebViewHtmlLoader(view)
  private val jsEvaluatorAdapter = AndroidWebViewJavaScriptEvaluator(view)

  // Thin adapter that forwards UrlLoader calls to the underlying WebView.
  // Extracted so applyUriSource (companion) can be exercised in unit tests
  // via a fake UrlLoader without a real android.webkit.WebView.
  private val viewLoader: UrlLoader = object : UrlLoader {
    override fun loadUrl(url: String, additionalHttpHeaders: Map<String, String>) {
      view.loadUrl(url, additionalHttpHeaders)
    }
  }

  /**
   * File-upload bridge. Bound to the WebView's `webChromeClient` so HTML
   * `<input type="file">` opens the system chooser. The host Activity is
   * resolved lazily through an [ActivityResolver] that reads
   * `ThemedReactContext.currentActivity` at each chooser invocation, so the
   * client keeps working after configuration changes that swap the host
   * Activity. Callers may still override via
   * [NitroWebChromeClient.hostActivity] for tests / late binding.
   */
  internal val webChromeClient: NitroWebChromeClient =
    NitroWebChromeClient(
      context = context.applicationContext,
      activityResolver = ActivityResolver { context.currentActivity },
      chooserLauncher = chooserLauncher@{ intent, code ->
        // Route the chooser through the real ReactApplicationContext, the
        // same instance our ActivityEventListener is registered against. The
        // ThemedReactContext passed to view managers does not own the
        // activity-event listener set in bridgeless / new-arch mode.
        context.reactApplicationContext.startActivityForResult(intent, code, null)
        true
      },
    )

  /**
   * Forwards the host Activity's `onActivityResult` to [webChromeClient] so
   * the file chooser callback registered in
   * [NitroWebChromeClient.onShowFileChooser] is resolved without the consumer
   * app having to wire anything in their `MainActivity`. Registered once on
   * construction and removed in [onDropView].
   */
  private val activityEventListener: ActivityEventListener =
    object : ActivityEventListener {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        webChromeClient.handleFileChooserResult(requestCode, resultCode, data)
      }

      override fun onNewIntent(intent: Intent) {
        // File chooser results never arrive via a new Intent.
      }
    }

  // Activity events are dispatched against the real ReactApplicationContext,
  // never the ThemedReactContext that wraps it for the view tree. RNW does the
  // same lookup (`reactContext.getNativeModule(...)` finds the module that
  // registered itself against the application context). We resolve the
  // underlying application context here so `addActivityEventListener` lands on
  // the listener set that actually fires from `onActivityResult`.
  private val reactContext: ReactContext = context.reactApplicationContext

  override var source: WebViewSource = WebViewSource.create(UriSource("about:blank", null))
    set(value) {
      field = value
      applySource(value)
    }

  /**
   * Default HTTP headers applied to every main-frame navigation triggered
   * by a `source` change. Per-request `source.headers` win on key conflict
   * (exact-match comparison on Android; callers should use a single
   * canonical casing per key). Mutating `defaultHeaders` alone does not
   * trigger a navigation — the next `source` update is when merged headers
   * are forwarded to `WebView.loadUrl(url, headers)`.
   */
  override var defaultHeaders: Map<String, String>? = null

  /**
   * Forwards to `WebSettings.userAgentString`. A `null` or empty value
   * restores the platform default Chromium UA by writing `""`, which
   * Android treats as "use the system default" per
   * `WebSettings.setUserAgentString` docs. The mutation hops to the UI
   * thread because `WebSettings` is not thread-safe.
   */
  override var userAgent: String? = null
    set(value) {
      field = value
      view.post {
        view.settings.userAgentString = value ?: ""
      }
    }

  override var injectedJavaScript: String? = null
    set(value) {
      field = value
      // Re-injects on every page load via onPageFinished hook below.
    }

  override var onLoadStart: ((event: WebViewLoadEvent) -> Unit)? = null
  override var onLoadEnd: ((event: WebViewLoadEvent) -> Unit)? = null
  override var onNavigationStateChange: ((state: WebViewNavigationState) -> Unit)? = null
  override var onMessage: ((event: WebViewMessageEvent) -> Unit)? = null
  override var onError: ((event: NitroWebViewErrorEvent) -> Unit)? = null
  override var onFileDownload: ((event: FileDownloadEvent) -> Unit)? = null

  init {
    // Android WebView defaults are extremely conservative — JavaScript is
    // disabled and DOM storage is off. Without JS, `<input type="file">`
    // taps never reach the WebChromeClient (Chromium routes the picker
    // through its renderer process, which is dormant when JS is off). Turn
    // on the minimal surface our injected bridge and the four MVP features
    // depend on.
    view.settings.javaScriptEnabled = true
    view.settings.domStorageEnabled = true
    view.webViewClient = ClientImpl()
    view.webChromeClient = webChromeClient
    view.addJavascriptInterface(BridgeInterface(), BRIDGE_NAME)
    // File-download bridge. Every Android-side download notification is
    // translated 1:1 into an `onFileDownload` emission. The WebView itself
    // does NOT save anything — JS decides.
    view.setDownloadListener(DownloadListenerImpl())
    // Wire up the file chooser result path. The ReactContext dispatches
    // onActivityResult to every registered listener, so the consumer app's
    // MainActivity does not need any manual wiring.
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun goBack() {
    view.post { view.goBack() }
  }

  override fun goForward() {
    view.post { view.goForward() }
  }

  override fun reload() {
    view.post { view.reload() }
  }

  override fun stopLoading() {
    view.post { view.stopLoading() }
  }

  override fun evaluateJavaScript(code: String): Promise<String> {
    val promise = Promise<String>()
    view.post {
      evaluator.evaluate(
        code = code,
        evaluator = jsEvaluatorAdapter,
        resolve = { promise.resolve(it) },
        reject = { promise.reject(it) },
      )
    }
    return promise
  }

  // region: Cookie API

  /**
   * Test seam over the `CookieManager` singleton. Production code uses the
   * default [SystemCookieWriter] which delegates 1:1 to
   * `CookieManager.getInstance()`. Unit tests swap in an in-memory
   * implementation to verify that `setCookie(url, cookie)` assembles the
   * documented Set-Cookie–style string AND forwards it to the writer.
   *
   * The field is `internal` (not `public`) so consumer apps cannot
   * accidentally rebind the cookie store at runtime.
   */
  internal var cookieWriter: CookieWriter = SystemCookieWriter()

  /**
   * Return every cookie the shared `CookieManager` holds for the origin of
   * [url]. Android's document cookie header does not expose `httpOnly`,
   * `secure`, `expires`, `domain`, or `path` — only name/value pairs survive
   * the round-trip — so each returned [Cookie] only carries name and value.
   */
  override fun getCookies(url: String): Promise<Array<Cookie>> {
    val promise = Promise<Array<Cookie>>()
    val raw = CookieManager.getInstance().getCookie(url)
    val cookies = parseCookieHeader(raw)
    promise.resolve(cookies)
    return promise
  }

  /**
   * Persist a single [cookie] into the shared `CookieManager`. The `url`
   * scopes the cookie and is also used to derive default `domain`/`path`
   * when those fields are omitted from [cookie]. The result is `flush()`-ed
   * before the promise resolves so callers see the cookie immediately on
   * subsequent [getCookies] reads.
   */
  override fun setCookie(url: String, cookie: Cookie): Promise<Unit> {
    val promise = Promise<Unit>()
    // Delegated through the companion helper so unit tests can pin both
    // the assembled Set-Cookie string AND the underlying `CookieManager`
    // invocation without needing Robolectric. Production code paths use
    // the default writer which delegates 1:1 to
    // `CookieManager.getInstance().setCookie(url, value, callback)` and
    // `flush()`. See [HybridNitroWebView.Companion.assembleAndWriteCookie].
    assembleAndWriteCookie(url, cookie, cookieWriter) { promise.resolve(Unit) }
    return promise
  }

  /**
   * Remove every cookie from the shared `CookieManager`. The promise
   * resolves only after `removeAllCookies` reports completion AND `flush()`
   * has been called, so callers observing the side effect can rely on
   * post-resolve reads being empty.
   *
   * Delegated through the [cookieWriter] seam so unit tests can verify
   * both the `removeAllCookies` invocation AND the `flush()` follow-up
   * without a real `CookieManager` (which is unavailable in plain JVM
   * unit tests). Production code paths use the default writer which
   * delegates 1:1 to `CookieManager.getInstance().removeAllCookies(cb)`
   * and `flush()`. See
   * [HybridNitroWebView.Companion.clearAllCookies].
   */
  override fun clearCookies(): Promise<Unit> {
    val promise = Promise<Unit>()
    clearAllCookies(cookieWriter) { promise.resolve(Unit) }
    return promise
  }

  override fun onDropView() {
    view.webViewClient = WebViewClient() // detach our client
    // Release the chooser-bound activity to avoid leaking the host while
    // the WebView itself is being torn down. The chooser client is
    // GC-eligible once the WebView drops its strong reference below.
    webChromeClient.hostActivity = null
    view.webChromeClient = null
    view.removeJavascriptInterface(BRIDGE_NAME)
    view.stopLoading()
    // Deregister the activity-result forwarder so this WebView can be GC'd
    // cleanly and no stale chooser callbacks fire after teardown.
    reactContext.removeActivityEventListener(activityEventListener)
  }

  /**
   * Bridge for the host Activity's `onActivityResult` so the file chooser
   * callback registered in [NitroWebChromeClient.onShowFileChooser] can be
   * resolved. Returns true when the result was consumed.
   */
  fun handleFileChooserActivityResult(
    requestCode: Int,
    resultCode: Int,
    data: android.content.Intent?,
  ): Boolean = webChromeClient.handleFileChooserResult(requestCode, resultCode, data)

  /**
   * Late-binding setter for the host Activity. Useful when the WebView is
   * created before the Activity is attached (or the [ThemedReactContext]'s
   * `currentActivity` was null at construction time).
   */
  fun bindHostActivity(activity: Activity?) {
    webChromeClient.hostActivity = activity
  }

  private fun applySource(source: WebViewSource) {
    view.post {
      source.match(
        first = { uriSource ->
          // Delegate to the companion helper so the header-merge + loadUrl
          // call can be verified in unit tests via the UrlLoader seam.
          applyUriSource(uriSource, defaultHeaders, viewLoader)
        },
        second = { html ->
          val payload = NitroLoadHtmlPayload(
            html = html.html,
            baseUrlString = html.baseUrl,
          )
          sourceHandler.applyHtmlPayload(payload, htmlLoaderAdapter)
        },
      )
    }
  }

  private fun emitFileDownload(event: FileDownload) {
    onFileDownload?.invoke(FileDownloadEvent(event))
  }

  private fun emitLoadStart() {
    onLoadStart?.invoke(WebViewLoadEvent(snapshotNavigationState()))
  }

  private fun emitLoadEnd() {
    onLoadEnd?.invoke(WebViewLoadEvent(snapshotNavigationState()))
  }

  private fun emitNavigationState() {
    onNavigationStateChange?.invoke(snapshotNavigationState())
  }

  private fun emitError(
    error: WebResourceErrorSource,
    request: WebResourceRequestSource?,
    fallbackUrl: String?,
  ) {
    val mapped = NitroWebViewErrorMapper.event(
      error = error,
      request = request,
      fallbackUrl = fallbackUrl,
    )
    val payload = NitroWebViewErrorEvent(
      NitroWebViewErrorNativeEvent(
        code = mapped.code.toDouble(),
        description = mapped.description,
        url = mapped.url,
        domain = mapped.domain,
      ),
    )
    onError?.invoke(payload)
  }

  private fun snapshotNavigationState(): WebViewNavigationState =
    WebViewNavigationState(
      url = view.url ?: "",
      title = view.title ?: "",
      loading = view.progress < 100,
      canGoBack = view.canGoBack(),
      canGoForward = view.canGoForward(),
    )

  private inner class ClientImpl : WebViewClient() {
    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
      emitLoadStart()
      emitNavigationState()
    }

    override fun onPageFinished(view: WebView, url: String?) {
      val script = injectedJavaScript
      if (!script.isNullOrEmpty()) {
        view.evaluateJavascript(script, null)
      }
      emitLoadEnd()
      emitNavigationState()
    }

    override fun onReceivedError(
      view: WebView,
      request: WebResourceRequest,
      error: WebResourceError,
    ) {
      // Only main-frame errors should surface to JS, matching iOS semantics.
      if (request.isForMainFrame) {
        emitError(
          error = AndroidWebResourceError(error),
          request = AndroidWebResourceRequest(request),
          fallbackUrl = view.url,
        )
        emitLoadEnd()
        emitNavigationState()
      }
    }
  }

  private inner class BridgeInterface {
    @JavascriptInterface
    fun postMessage(data: String) {
      // @JavascriptInterface runs on a dedicated `JavaBridge` thread.
      // WebView.url / onMessage delivery must hop back to the UI thread.
      view.post {
        val payload = WebViewMessageEvent(
          WebViewMessageNativeEvent(
            data = data,
            url = view.url ?: "",
          ),
        )
        onMessage?.invoke(payload)
      }
    }
  }

  /**
   * Bridges Android's `WebView.setDownloadListener` callback to JS via
   * `onFileDownload`. Every `onDownloadStart` invocation maps 1:1 to a
   * single emission and the WebView never persists the file — JS decides.
   *
   * The native side performs NO automatic `DownloadManager.enqueue` and
   * NO file save: the listener exists purely to surface metadata to JS.
   *
   * `fileName` is derived primarily via
   * [DownloadUtils.guessFileName] from `org.mozilla.components:support-utils`,
   * which honors RFC 5987 extended filenames in the `Content-Disposition`
   * header. We URL-decode the raw disposition string with UTF-8 first
   * because Android's WebView surfaces it in percent-encoded form. If the
   * Mozilla helper throws (malformed input, unsupported encoding, etc.)
   * we fall back to the platform's [URLUtil.guessFileName] which is the
   * historic default the AOSP DownloadManager uses.
   *
   * The MVP excludes blob URLs by short-circuiting `blob:` schemes.
   */
  private inner class DownloadListenerImpl : DownloadListener {
    override fun onDownloadStart(
      url: String?,
      userAgent: String?,
      contentDisposition: String?,
      mimetype: String?,
      contentLength: Long,
    ) {
      if (url == null) return
      // blob: URLs are out of scope for the MVP.
      if (url.startsWith("blob:")) return
      val fileName = deriveDownloadFileName(url, contentDisposition, mimetype)
      val event = FileDownload(
        url = url,
        mimeType = mimetype?.takeIf { it.isNotEmpty() },
        fileName = fileName,
        contentLength = if (contentLength <= 0L) null else contentLength.toDouble(),
        userAgent = userAgent?.takeIf { it.isNotEmpty() },
      )
      // Surface to JS. The native side performs NO automatic
      // DownloadManager.enqueue and NO file save — JS decides what to do.
      view.post { emitFileDownload(event) }
    }
  }

  /**
   * Minimal seam over the `WebView.loadUrl(url, headers)` call that
   * [applySource] issues for URI sources. Lets unit tests verify that the
   * merged header map and the exact URI are forwarded to the 2-arg overload
   * without a real `android.webkit.WebView` (unavailable in JVM unit tests).
   */
  internal interface UrlLoader {
    /** Mirror of `WebView.loadUrl(url, additionalHttpHeaders)`. */
    fun loadUrl(url: String, additionalHttpHeaders: Map<String, String>)
  }

  /**
   * Minimal seam over the parts of `android.webkit.CookieManager` that
   * [HybridNitroWebView.setCookie] depends on. Lets unit tests pin both
   * the assembled Set-Cookie–style string and the underlying invocation
   * without a real `CookieManager` (which is unavailable in plain JVM
   * unit tests).
   */
  internal interface CookieWriter {
    /**
     * Mirror of `CookieManager.setCookie(url, value, ValueCallback<Boolean>)`.
     * The callback is invoked exactly once with `true` on success.
     */
    fun setCookie(url: String, value: String, callback: (Boolean) -> Unit)

    /**
     * Mirror of
     * `CookieManager.removeAllCookies(ValueCallback<Boolean>)`. The callback
     * is invoked exactly once with `true` when at least one cookie was
     * removed (mirroring `CookieManager`'s real-world contract). Production
     * code calls `flush()` from inside the callback so subsequent
     * `getCookies` reads observe an empty cookie store.
     */
    fun removeAllCookies(callback: (Boolean) -> Unit)

    /**
     * Mirror of `CookieManager.flush()`. Production code calls this after
     * the per-cookie callback fires so the cookie is visible to subsequent
     * `getCookies` reads before the promise resolves.
     */
    fun flush()
  }

  /**
   * Default [CookieWriter] backed by `CookieManager.getInstance()`. Behavior
   * is byte-for-byte equivalent to the inline calls this seam replaced.
   */
  private class SystemCookieWriter : CookieWriter {
    override fun setCookie(url: String, value: String, callback: (Boolean) -> Unit) {
      CookieManager.getInstance().setCookie(url, value) { ok -> callback(ok) }
    }

    override fun removeAllCookies(callback: (Boolean) -> Unit) {
      CookieManager.getInstance().removeAllCookies { ok -> callback(ok) }
    }

    override fun flush() {
      CookieManager.getInstance().flush()
    }
  }

  companion object {
    private const val BRIDGE_NAME = "ReactNativeWebView"

    /**
     * URI-source apply pipeline. Merges [defaultHeaders] and
     * [uriSource.headers] with per-request entries overriding defaults on
     * exact-key conflict, then forwards the merged map and the URI to
     * [loader]. Extracted from [applySource] so the header-merge and
     * the `loadUrl` invocation can be exercised in unit tests via a
     * fake [UrlLoader] without a real `android.webkit.WebView`.
     */
    @JvmStatic
    internal fun applyUriSource(
      uriSource: UriSource,
      defaultHeaders: Map<String, String>?,
      loader: UrlLoader,
    ) {
      val merged = HashMap<String, String>().apply {
        putAll(defaultHeaders ?: emptyMap())
        putAll(uriSource.headers ?: emptyMap())
      }
      loader.loadUrl(uriSource.uri, merged)
    }

    /**
     * Derives the download file name from the WebView-supplied metadata.
     * Mirrors the try/catch block in [DownloadListenerImpl.onDownloadStart]
     * byte-for-byte, but accepts injectable [decoder], [primary], and
     * [fallback] parameters so unit tests can exercise both branches
     * without static mocking.
     *
     * Default arguments preserve the real production behavior:
     * - [decoder] calls `URLDecoder.decode(input, charset)`.
     * - [primary] calls `DownloadUtils.guessFileName(...)` which honors
     *   RFC 5987 extended filenames in `Content-Disposition`.
     * - [fallback] calls `URLUtil.guessFileName(...)` which is the AOSP
     *   `DownloadManager` default.
     */
    @JvmStatic
    internal fun deriveDownloadFileName(
      url: String,
      contentDisposition: String?,
      mimetype: String?,
      decoder: (String, String) -> String = { input, charset ->
        URLDecoder.decode(input, charset)
      },
      primary: (String?, String?, String, String?) -> String = { cd, _, u, mt ->
        DownloadUtils.guessFileName(
          contentDisposition = cd,
          destinationDirectory = null,
          url = u,
          mimeType = mt,
        )
      },
      fallback: (String, String?, String?) -> String = { u, cd, mt ->
        URLUtil.guessFileName(u, cd, mt)
      },
    ): String {
      return try {
        val decoded = if (contentDisposition != null) {
          decoder(contentDisposition, "utf-8")
        } else {
          null
        }
        primary(decoded, null, url, mimetype)
      } catch (e: Exception) {
        fallback(url, contentDisposition, mimetype)
      }
    }

    /**
     * Merge `defaults` and `perRequest` headers with per-request taking
     * precedence on key conflict. Comparison is **exact-match** on Android
     * (the platform's `additionalHttpHeaders` map is forwarded as-is and
     * the runtime never folds casing). Callers should use a single
     * canonical casing per key.
     */
    @JvmStatic
    internal fun mergeHeaders(
      defaults: Map<String, String>?,
      perRequest: Map<String, String>?,
    ): Map<String, String> {
      val d = defaults ?: emptyMap()
      val r = perRequest ?: emptyMap()
      if (r.isEmpty()) return d
      if (d.isEmpty()) return r
      val out = LinkedHashMap<String, String>(d.size + r.size)
      out.putAll(d)
      // per-request entries overwrite the defaults on exact-key conflict.
      out.putAll(r)
      return out
    }

    /**
     * Parse a raw `name=value; name2=value2` cookie header (as returned by
     * `CookieManager.getCookie(url)`) into individual [Cookie] objects.
     * Returns an empty array when [raw] is null/blank.
     */
    @JvmStatic
    internal fun parseCookieHeader(raw: String?): Array<Cookie> {
      if (raw.isNullOrBlank()) return emptyArray()
      val parts = raw.split(';')
      val out = ArrayList<Cookie>(parts.size)
      for (part in parts) {
        val trimmed = part.trim()
        if (trimmed.isEmpty()) continue
        val eq = trimmed.indexOf('=')
        if (eq <= 0) continue
        val name = trimmed.substring(0, eq).trim()
        val value = trimmed.substring(eq + 1).trim()
        if (name.isEmpty()) continue
        out.add(
          Cookie(
            name = name,
            value = value,
            domain = null,
            path = null,
            expires = null,
            secure = null,
            httpOnly = null,
          )
        )
      }
      return out.toTypedArray()
    }

    /**
     * Pipeline that mirrors the per-instance [setCookie] body 1:1 but
     * uses an injectable [writer] so unit tests can verify both the
     * assembled Set-Cookie string and the underlying invocation without
     * a real `CookieManager`. The flow is:
     *
     *   1. Serialize the [Cookie] into a `Set-Cookie`-style string via
     *      [serializeCookie] (`name=value; Domain=...; Path=...; Max-Age=...;
     *      Secure; HttpOnly`).
     *   2. Call `writer.setCookie(url, value, callback)` exactly once. The
     *      callback bridges back to `CookieManager.setCookie`'s
     *      `ValueCallback<Boolean>` argument.
     *   3. When the callback fires (any outcome), call `writer.flush()`
     *      so subsequent `getCookies` reads observe the write.
     *   4. Invoke [onComplete] so the caller can resolve its promise.
     */
    @JvmStatic
    internal fun assembleAndWriteCookie(
      url: String,
      cookie: Cookie,
      writer: CookieWriter,
      onComplete: () -> Unit,
    ) {
      val serialized = serializeCookie(cookie)
      writer.setCookie(url, serialized) {
        writer.flush()
        onComplete()
      }
    }

    /**
     * Pipeline that mirrors the per-instance [clearCookies] body 1:1 but
     * uses an injectable [writer] so unit tests can verify that
     * `removeAllCookies` is invoked AND its callback drives both `flush()`
     * and the [onComplete] callback — all without a real `CookieManager`.
     * The flow is:
     *
     *   1. Call `writer.removeAllCookies(callback)` exactly once. The
     *      callback bridges back to `CookieManager.removeAllCookies`'s
     *      `ValueCallback<Boolean>` argument.
     *   2. When the callback fires (any outcome), call `writer.flush()`
     *      so subsequent `getCookies` reads observe the empty store
     *      before the caller's promise resolves.
     *   3. Invoke [onComplete] so the caller can resolve its promise.
     *
     * The contract matches `assembleAndWriteCookie`: `flush()` and
     * [onComplete] both run inside the writer's callback, never before,
     * so callers that observe the side effect can rely on post-resolve
     * reads being empty.
     */
    @JvmStatic
    internal fun clearAllCookies(
      writer: CookieWriter,
      onComplete: () -> Unit,
    ) {
      writer.removeAllCookies {
        writer.flush()
        onComplete()
      }
    }

    /**
     * Serialize a [Cookie] into a Set-Cookie–style string suitable for
     * `CookieManager.setCookie(url, value)`. Only the fields the platform
     * accepts in that single-string form are emitted.
     */
    @JvmStatic
    internal fun serializeCookie(cookie: Cookie): String {
      val sb = StringBuilder()
      sb.append(cookie.name).append('=').append(cookie.value)
      cookie.domain?.takeIf { it.isNotEmpty() }?.let { sb.append("; Domain=").append(it) }
      cookie.path?.takeIf { it.isNotEmpty() }?.let { sb.append("; Path=").append(it) }
      cookie.expires?.let {
        // CookieManager understands the `Max-Age` form regardless of locale.
        val now = System.currentTimeMillis()
        val maxAgeSeconds = ((it.toLong() - now) / 1000L).coerceAtLeast(0L)
        sb.append("; Max-Age=").append(maxAgeSeconds)
      }
      if (cookie.secure == true) sb.append("; Secure")
      if (cookie.httpOnly == true) sb.append("; HttpOnly")
      return sb.toString()
    }
  }
}
