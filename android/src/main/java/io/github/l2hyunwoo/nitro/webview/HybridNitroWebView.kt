package io.github.l2hyunwoo.nitro.webview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.URLUtil
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.RequiresApi
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.core.Promise
import com.margelo.nitro.nitrowebview.Cookie
import com.margelo.nitro.nitrowebview.FileDownload
import com.margelo.nitro.nitrowebview.FileDownloadEvent
import com.margelo.nitro.nitrowebview.HybridNitroWebViewSpec
import com.margelo.nitro.nitrowebview.NitroWebViewErrorEvent
import com.margelo.nitro.nitrowebview.NitroWebViewErrorNativeEvent
import com.margelo.nitro.nitrowebview.NitroWebViewHttpErrorEvent
import com.margelo.nitro.nitrowebview.NitroWebViewHttpErrorNativeEvent
import com.margelo.nitro.nitrowebview.NitroWebViewRenderProcessGoneEvent
import com.margelo.nitro.nitrowebview.NitroWebViewRenderProcessGoneNativeEvent
import com.margelo.nitro.nitrowebview.NitroWebViewScrollEvent
import com.margelo.nitro.nitrowebview.NitroWebViewScrollNativeEvent
import com.margelo.nitro.nitrowebview.ShouldStartLoadRequest
import com.margelo.nitro.nitrowebview.WebViewPoint
import com.margelo.nitro.nitrowebview.UriSource
import com.margelo.nitro.nitrowebview.WebViewLoadEvent
import com.margelo.nitro.nitrowebview.WebViewMessageEvent
import com.margelo.nitro.nitrowebview.WebViewMessageNativeEvent
import com.margelo.nitro.nitrowebview.WebViewNavigationState
import com.margelo.nitro.nitrowebview.WebViewNavigationType
import com.margelo.nitro.nitrowebview.WebViewSource
import mozilla.components.support.utils.DownloadUtils
import org.json.JSONObject
import java.net.URLDecoder

@SuppressLint("SetJavaScriptEnabled")
class HybridNitroWebView(context: ThemedReactContext) : HybridNitroWebViewSpec() {

  override val view: WebView = WebView(context).also { wv ->
    // Baseline defaults. Android WebView ships JavaScript and DOM storage
    // OFF; without JS the `<input type="file">` chooser never reaches the
    // WebChromeClient (Chromium routes the picker through its renderer,
    // dormant when JS is off) and the injected message bridge is dead. These
    // stay ON by default; the prop setters below override them on demand.
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

  // region: Settings props
  //
  // Every Android WebSettings / CookieManager setter is mutable at any time,
  // but WebSettings is not thread-safe, so each mutation hops to the UI
  // thread via `view.post { }` (same convention as `userAgent`). Props are
  // nullable: `null` (prop unset) leaves the platform default untouched.

  override var javaScriptEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) view.post { view.settings.javaScriptEnabled = value }
    }

  override var domStorageEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) view.post { view.settings.domStorageEnabled = value }
    }

  override var cacheEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) view.post { view.settings.cacheMode = cacheModeFor(value) }
    }

  /**
   * There is no first-class incognito mode on Android. Approximate it by
   * disabling DOM storage and the disk cache for this WebView. Cookies
   * written through the cookie API stay process-global (a single
   * `CookieManager` per process), so full data isolation is NOT guaranteed
   * (documented on the prop's JSDoc).
   *
   * Turning `incognito` back off restores whatever `domStorageEnabled` /
   * `cacheEnabled` the consumer explicitly set (or Android's own defaults -
   * DOM storage on, `LOAD_DEFAULT` - if those props were never set), instead
   * of leaving the WebView stuck on the incognito values.
   */
  override var incognito: Boolean? = null
    set(value) {
      field = value
      view.post {
        if (value == true) {
          view.settings.domStorageEnabled = false
          view.settings.cacheMode = WebSettings.LOAD_NO_CACHE
        } else {
          view.settings.domStorageEnabled = domStorageEnabled ?: true
          view.settings.cacheMode = cacheEnabled?.let { cacheModeFor(it) } ?: WebSettings.LOAD_DEFAULT
        }
      }
    }

  override var mediaPlaybackRequiresUserAction: Boolean? = null
    set(value) {
      field = value
      if (value != null) {
        view.post { view.settings.mediaPlaybackRequiresUserGesture = value }
      }
    }

  override var scalesPageToFit: Boolean? = null
    set(value) {
      field = value
      if (value != null) {
        view.post {
          view.settings.loadWithOverviewMode = value
          view.settings.useWideViewPort = value
        }
      }
    }

  override var thirdPartyCookiesEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) {
        view.post {
          CookieManager.getInstance().setAcceptThirdPartyCookies(view, value)
        }
      }
    }

  // iOS-only props (react-native-webview parity): no Android equivalent, so
  // these store the value and apply nothing. `scrollEnabled` is included
  // here because react-native-webview does not implement scroll disabling on
  // Android (an OnTouchListener eating ACTION_MOVE would regress link taps /
  // the file chooser / shouldOverrideUrlLoading).
  override var scrollEnabled: Boolean? = null
  override var bounces: Boolean? = null
  override var allowsInlineMediaPlayback: Boolean? = null
  override var allowsBackForwardNavigationGestures: Boolean? = null
  override var sharedCookiesEnabled: Boolean? = null

  // endregion

  override var injectedJavaScript: String? = null
    set(value) {
      field = value
      // Re-injects on every page load via onPageFinished hook below.
    }

  /**
   * JS injected before the page's own scripts run, on every main-frame
   * load. When the device's WebView supports the `DOCUMENT_START_SCRIPT`
   * feature we register it via `WebViewCompat.addDocumentStartJavaScript`
   * (the same before-any-page-script guarantee as iOS `.atDocumentStart`);
   * otherwise it is injected in [ClientImpl.onPageStarted], which is early
   * enough for shim installation but does not strictly beat a page's first
   * synchronous inline `<script>`.
   */
  override var injectedJavaScriptBeforeContentLoaded: String? = null
    set(value) {
      field = value
      view.post { applyDocumentStartScript() }
    }

  /**
   * Handle returned by `WebViewCompat.addDocumentStartJavaScript` for the
   * currently-registered before-content script. Held so a prop change can
   * remove the previous registration before adding the new one (otherwise
   * the scripts would stack across updates). Null on WebViews that lack the
   * `DOCUMENT_START_SCRIPT` feature — those use the `onPageStarted`
   * fallback instead.
   */
  private var documentStartScriptHandler: androidx.webkit.ScriptHandler? = null

  override var onLoadStart: ((event: WebViewLoadEvent) -> Unit)? = null
  override var onLoadEnd: ((event: WebViewLoadEvent) -> Unit)? = null
  override var onNavigationStateChange: ((state: WebViewNavigationState) -> Unit)? = null
  override var onMessage: ((event: WebViewMessageEvent) -> Unit)? = null
  override var onError: ((event: NitroWebViewErrorEvent) -> Unit)? = null
  override var onFileDownload: ((event: FileDownloadEvent) -> Unit)? = null
  override var onHttpError: ((event: NitroWebViewHttpErrorEvent) -> Unit)? = null
  override var onRenderProcessGone: ((event: NitroWebViewRenderProcessGoneEvent) -> Unit)? = null
  override var onScroll: ((event: NitroWebViewScrollEvent) -> Unit)? = null

  /**
   * JS-side navigation-interception hook. When non-null, every
   * `WebViewClient.shouldOverrideUrlLoading` invocation hands the URL to
   * JS through this callback. The Promise's boolean result decides
   * whether the platform blocks the navigation
   * (`true` → allow / `false` → block).
   *
   * Because Android's `shouldOverrideUrlLoading` is a synchronous WebView
   * callback (return `true` to block / `false` to allow), the
   * implementation blocks the WebView thread on a lock for at most
   * [SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS] milliseconds waiting for the
   * JS Promise to resolve. When the timeout elapses with no resolution
   * the navigation is allowed (mirrors react-native-webview's
   * `RNCWebViewClient.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS`).
   */
  override var onShouldStartLoadWithRequest: (
    (event: ShouldStartLoadRequest) -> Promise<Boolean>
  )? = null

  init {
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
    // Scroll stream. `View.setOnScrollChangeListener` (API 23+) delivers the
    // scroll offset directly; `contentSize` stays a zero point because
    // `computeVerticalScrollRange()` / `computeHorizontalScrollRange()` are
    // protected on View and only reachable by subclassing WebView, which this
    // library avoids everywhere. NOT throttled and NOT deduped (RNW parity).
    view.setOnScrollChangeListener { _, scrollX, scrollY, _, _ ->
      onScroll?.invoke(
        NitroWebViewScrollEvent(
          NitroWebViewScrollNativeEvent(
            contentOffset = WebViewPoint(scrollX.toDouble(), scrollY.toDouble()),
            contentSize = WebViewPoint(0.0, 0.0),
            contentInset = null,
            layoutMeasurement = null,
            zoomScale = null,
          ),
        ),
      )
    }
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

  /**
   * Fire-and-forget JS execution — no result surfaced to JS. Hops to the UI
   * thread like every other WebView-touching method (`evaluateJavascript`
   * is main-thread-only and the Nitro call can land off-thread).
   */
  override fun injectJavaScript(code: String) {
    view.post { view.evaluateJavascript(code, null) }
  }

  /**
   * Deliver a native→web message. Android dispatches a DOM `message` event
   * on `document` (react-native-webview parity —
   * `RNCWebViewManagerImpl.kt:335`). The statement is built + escaped by the
   * companion [postMessageScript] helper, then evaluated fire-and-forget.
   */
  override fun postMessage(data: String) {
    view.post { view.evaluateJavascript(postMessageScript(data), null) }
  }

  /**
   * Register (or re-register) the before-content script via
   * `WebViewCompat.addDocumentStartJavaScript` when the feature is
   * supported. Removes any previous registration first so prop changes
   * don't stack scripts. No-op when the feature is unsupported — those
   * WebViews fall back to injecting in [ClientImpl.onPageStarted].
   *
   * Must run on the UI thread (callers hop via `view.post`).
   */
  private fun applyDocumentStartScript() {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      return
    }
    documentStartScriptHandler?.remove()
    documentStartScriptHandler = null
    val script = injectedJavaScriptBeforeContentLoaded
    if (script.isNullOrEmpty()) return
    // Wrap in an IIFE for scope isolation, matching react-native-webview.
    documentStartScriptHandler = WebViewCompat.addDocumentStartJavaScript(
      view,
      "(function(){\n$script\n})();",
      setOf("*"),
    )
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
    view.setOnScrollChangeListener(null)
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

  private fun emitHttpError(
    response: WebResourceResponseSource,
    request: WebResourceRequestSource?,
    fallbackUrl: String?,
  ) {
    val mapped = NitroWebViewHttpErrorMapper.event(
      response = response,
      request = request,
      fallbackUrl = fallbackUrl,
    )
    onHttpError?.invoke(
      NitroWebViewHttpErrorEvent(
        NitroWebViewHttpErrorNativeEvent(
          statusCode = mapped.statusCode.toDouble(),
          url = mapped.url,
          description = mapped.description,
        ),
      ),
    )
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
      // Fallback path for WebViews without the DOCUMENT_START_SCRIPT
      // feature: inject the before-content script here. Supported WebViews
      // register it via addDocumentStartJavaScript (see
      // applyDocumentStartScript) and skip this to avoid a double-inject.
      val before = injectedJavaScriptBeforeContentLoaded
      if (
        !before.isNullOrEmpty() &&
        !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
      ) {
        view.evaluateJavascript("(function(){\n$before\n})();", null)
      }
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

    /**
     * Navigation-interception entry point. Returning `true` tells the
     * platform to BLOCK the navigation; returning `false` lets the
     * WebView proceed.
     *
     * When no JS-side `onShouldStartLoadWithRequest` callback is wired we
     * short-circuit to `false` (allow-all default). Otherwise the URL is
     * dispatched to JS via [dispatchShouldStart] which:
     *   1. Wraps the navigation in a [ShouldStartLoadRequest] payload —
     *      `navigationType` is always `'other'` on Android because
     *      `WebViewClient.shouldOverrideUrlLoading` does not expose a
     *      navigation-type discriminator, and the iOS-only optional
     *      fields stay null.
     *   2. Calls the JS hook, then blocks the current (WebView) thread on
     *      a `synchronized.wait` for at most
     *      [SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS] milliseconds, mirroring
     *      `RNCWebViewClient.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS` in
     *      react-native-webview.
     *   3. Returns the boolean the Promise resolved with — or the
     *      default-allow value when the wait window elapses.
     */
    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest,
    ): Boolean {
      val hook = onShouldStartLoadWithRequest ?: return false
      val url = request.url?.toString() ?: return false
      val payload = ShouldStartLoadRequest(
        url = url,
        navigationType = WebViewNavigationType.OTHER,
        mainDocumentURL = null,
        isTopFrame = null,
        hasTargetFrame = null,
      )
      val allow = dispatchShouldStart(hook, payload)
      // Convention: shouldOverrideUrlLoading returns `true` to BLOCK.
      return !allow
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

    /**
     * HTTP-error entry point (4xx/5xx). Disjoint from [onReceivedError]
     * (transport-level failures). The main-frame filter is the FIRST line
     * because Android fires this once per failing sub-resource — without the
     * filter a page with a single broken image would flood JS. Does NOT
     * abort the load: [onPageFinished] still fires independently, so we emit
     * NO `onLoadEnd` here. May fire more than once per navigation (redirect
     * hops) — that is an independent, non-deduped signal by design.
     */
    override fun onReceivedHttpError(
      view: WebView,
      request: WebResourceRequest,
      errorResponse: WebResourceResponse,
    ) {
      if (!request.isForMainFrame) return
      emitHttpError(
        response = AndroidWebResourceResponse(errorResponse),
        request = AndroidWebResourceRequest(request),
        fallbackUrl = view.url,
      )
    }

    /**
     * Renderer-process-gone recovery hook (API 26+; guarded because minSdk
     * is lower). MUST return `true` unconditionally: returning `false` lets
     * Android kill the entire host app. JS is notified so it can
     * [reload]/remount. `didCrash()` distinguishes a real crash (`true`)
     * from an OS memory reclaim (`false`).
     */
    @RequiresApi(Build.VERSION_CODES.O)
    override fun onRenderProcessGone(
      view: WebView,
      detail: RenderProcessGoneDetail,
    ): Boolean {
      onRenderProcessGone?.invoke(
        NitroWebViewRenderProcessGoneEvent(
          NitroWebViewRenderProcessGoneNativeEvent(detail.didCrash()),
        ),
      )
      return true
    }
  }

  /**
   * Bridge between [ClientImpl.shouldOverrideUrlLoading] and the JS hook.
   *
   * Implementation contract:
   *   1. Invoke `hook(payload)` to obtain the JS-side Promise.
   *   2. Block the current (WebView) thread for at most
   *      [SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS] milliseconds via a
   *      `synchronized(lock).wait(timeoutMs)` loop while the Promise's
   *      `then`/`catch` callbacks notify the lock.
   *   3. When the Promise resolves inside the window the resolved boolean
   *      decides. When it rejects, default to allow. When the window
   *      elapses without notification, default to allow (mirrors
   *      `RNCWebViewClient.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS`).
   *
   * The block-then-wait pattern is the same one react-native-webview uses
   * on Android — Promise.await() is unavailable here because the
   * shouldOverrideUrlLoading callback is synchronous and must return a
   * Boolean before the WebView can decide whether to commit.
   */
  internal fun dispatchShouldStart(
    hook: (event: ShouldStartLoadRequest) -> Promise<Boolean>,
    payload: ShouldStartLoadRequest,
    timeoutMs: Long = SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS,
  ): Boolean {
    return Companion.awaitShouldStart(hook, payload, timeoutMs)
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
     * Build the native→web `postMessage` delivery statement. Android
     * dispatches a DOM `message` event on `document`
     * (`RNCWebViewManagerImpl.kt:335`).
     */
    @JvmStatic
    internal fun postMessageScript(message: String): String {
      val data = encodeJsStringLiteral(message)
      return "document.dispatchEvent(new MessageEvent('message',{data:$data}));"
    }

    /**
     * Escape a string into a JS *source* string literal (double-quoted,
     * quotes included). `JSONObject.quote` (bundled in android.jar) handles
     * quotes, backslashes, newlines, and control chars exactly like
     * `JSON.stringify` — and, like it, leaves U+2028/U+2029 RAW, which are
     * illegal *unescaped* inside a JS string literal on pre-ES2019 engines.
     * Post-escape those two so the emitted statement always parses.
     */
    @JvmStatic
    internal fun encodeJsStringLiteral(message: String): String {
      return JSONObject.quote(message)
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    }

    /**
     * Maximum number of milliseconds [ClientImpl.shouldOverrideUrlLoading]
     * blocks on the JS-side Promise before defaulting to allow. Mirrors
     * react-native-webview's `RNCWebViewClient.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS`
     * value verbatim so existing RNW guidance about the cap continues to
     * apply.
     */
    internal const val SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS: Long = 250L

    /**
     * Block the current thread for at most [timeoutMs] ms while [hook] is
     * resolving, and return the resolved boolean. Defaults to allow when
     * the Promise rejects or the wait window elapses.
     *
     * Extracted into the companion (no `WebView` dependency) so JVM unit
     * tests can drive the helper with a real `Promise<Boolean>` instance
     * without spinning up a `WebView`. The contract is verified by
     * `HybridNitroWebViewShouldStartLoadTest` (allow path, block path,
     * timeout default, rejection default).
     */
    @JvmStatic
    internal fun awaitShouldStart(
      hook: (event: ShouldStartLoadRequest) -> Promise<Boolean>,
      payload: ShouldStartLoadRequest,
      timeoutMs: Long = SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS,
    ): Boolean {
      val promise = hook(payload)
      return awaitBooleanWithTimeout(
        timeoutMs = timeoutMs,
        subscribe = { onResolve, onReject ->
          promise.then { value -> onResolve(value) }
          promise.catch { error -> onReject(error) }
        },
      )
    }

    /**
     * Pure-Kotlin wait-loop driver extracted from [awaitShouldStart]. The
     * Nitro `Promise<T>` cannot be instantiated in plain JVM unit tests
     * (its `then` / `catch` paths cross a JNI boundary), so the loop is
     * exposed against a generic [subscribe] lambda that publishes
     * `onResolve(boolean)` / `onReject(throwable)` callbacks. Production
     * code wires `subscribe` to `Promise.then` / `Promise.catch`; tests
     * wire it to a synchronous spy.
     *
     * Contract:
     *   1. The current thread waits up to [timeoutMs] ms on a private
     *      lock for `onResolve` or `onReject` to fire.
     *   2. `onResolve(true)` returns `true` (allow).
     *   3. `onResolve(false)` returns `false` (block).
     *   4. `onReject(_)` returns `true` (allow — RNW parity: rejection
     *      treats the navigation as allowed so a buggy JS handler can't
     *      strand the WebView).
     *   5. Elapsed-window without notification returns `true` (allow —
     *      mirrors `RNCWebViewClient.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS`).
     */
    @JvmStatic
    internal fun awaitBooleanWithTimeout(
      timeoutMs: Long,
      subscribe: (
        onResolve: (Boolean) -> Unit,
        onReject: (Throwable) -> Unit,
      ) -> Unit,
    ): Boolean {
      val lock = Object()
      // Single-element array doubles as a mutable holder so the resolve /
      // reject callbacks (captured by reference) can publish a result back
      // to the waiter without resorting to atomics.
      val result = arrayOfNulls<Boolean>(1)
      subscribe(
        { value ->
          synchronized(lock) {
            result[0] = value
            @Suppress("PlatformExtensionReceiverOfInline")
            (lock as Object).notifyAll()
          }
        },
        { _ ->
          synchronized(lock) {
            // Mirror RNW: rejected Promises default to allow.
            result[0] = true
            @Suppress("PlatformExtensionReceiverOfInline")
            (lock as Object).notifyAll()
          }
        },
      )
      synchronized(lock) {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (result[0] == null) {
          val remaining = deadline - System.currentTimeMillis()
          if (remaining <= 0L) break
          try {
            @Suppress("PlatformExtensionReceiverOfInline")
            (lock as Object).wait(remaining)
          } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            break
          }
        }
        // Default to allow when the wait window elapsed without resolution.
        return result[0] ?: true
      }
    }

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
     * Map the `cacheEnabled` prop to a `WebSettings.cacheMode` constant:
     * `true` -> `LOAD_DEFAULT` (use the HTTP cache normally); `false` ->
     * `LOAD_NO_CACHE` (always hit the network). Extracted so the boolean ->
     * constant mapping can be unit-tested without a real `WebView`.
     */
    @JvmStatic
    internal fun cacheModeFor(enabled: Boolean): Int =
      if (enabled) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_NO_CACHE

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
