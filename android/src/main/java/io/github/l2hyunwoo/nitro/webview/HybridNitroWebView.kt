package io.github.l2hyunwoo.nitro.webview

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.ViewGroup
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
import com.margelo.nitro.nitrowebview.OpenWindowEvent
import com.margelo.nitro.nitrowebview.OpenWindowNativeEvent
import com.margelo.nitro.nitrowebview.ShouldStartLoadRequest
import com.margelo.nitro.nitrowebview.UriSource
import com.margelo.nitro.nitrowebview.WebViewLoadEvent
import com.margelo.nitro.nitrowebview.WebViewLoadProgressEvent
import com.margelo.nitro.nitrowebview.WebViewLoadProgressNativeEvent
import com.margelo.nitro.nitrowebview.WebViewMessageEvent
import com.margelo.nitro.nitrowebview.WebViewMessageNativeEvent
import com.margelo.nitro.nitrowebview.WebViewNavigationState
import com.margelo.nitro.nitrowebview.WebViewNavigationType
import com.margelo.nitro.nitrowebview.WebViewPoint
import com.margelo.nitro.nitrowebview.WebViewSource
import mozilla.components.support.utils.DownloadUtils
import org.json.JSONObject
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

@SuppressLint("SetJavaScriptEnabled")
class HybridNitroWebView(
  context: ThemedReactContext,
) : HybridNitroWebViewSpec() {
  override val view: WebView =
    WebView(context).also { wv ->
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

  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var destroyed = false

  private fun destroyedViewException() =
    IllegalStateException(
      "NitroWebViewState: This WebView is destroyed. Remount it with a new React key.",
    )

  private fun warnDestroyed() {
    if (BuildConfig.DEBUG) Log.w("NitroWebView", destroyedViewException().message!!)
  }

  private fun postIfAvailable(action: () -> Unit) {
    if (destroyed) {
      warnDestroyed()
      return
    }
    mainHandler.post { if (!destroyed) action() }
  }

  private inline fun <T> withView(crossinline action: (Promise<T>) -> Unit): Promise<T> {
    val promise = Promise<T>()
    if (destroyed) {
      warnDestroyed()
      promise.reject(destroyedViewException())
      return promise
    }
    mainHandler.post {
      if (destroyed) {
        promise.reject(destroyedViewException())
      } else {
        action(promise)
      }
    }
    return promise
  }

  private val sourceHandler = NitroWebViewSourceHandler()
  private val evaluator = NitroWebViewEvaluateJavaScriptHandler()
  private val htmlLoaderAdapter = AndroidWebViewHtmlLoader(view)
  private val jsEvaluatorAdapter = AndroidWebViewJavaScriptEvaluator(view)

  // Thin adapter that forwards UrlLoader calls to the underlying WebView.
  // Extracted so applyUriSource (companion) can be exercised in unit tests
  // via a fake UrlLoader without a real android.webkit.WebView.
  private val viewLoader: UrlLoader =
    object : UrlLoader {
      override fun loadUrl(
        url: String,
        additionalHttpHeaders: Map<String, String>,
      ) {
        view.loadUrl(url, additionalHttpHeaders)
      }

      override fun postUrl(
        url: String,
        body: ByteArray,
      ) {
        view.postUrl(url, body)
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
      webViewProvider = { view },
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

  private var sourceNeedsLoading = false
  private var configurationErrorReported = false

  override var source: WebViewSource = WebViewSource.create(UriSource("about:blank", null, null, null))
    set(value) {
      field = value
      sourceNeedsLoading = true
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
      postIfAvailable {
        view.settings.userAgentString = value ?: ""
      }
    }

  // region: Settings props
  //
  // Every Android WebSettings / CookieManager setter is mutable at any time,
  // but WebSettings is not thread-safe, so each mutation hops to the UI
  // thread via `postIfAvailable { }` (same convention as `userAgent`). Props are
  // nullable: `null` (prop unset) leaves the platform default untouched.

  override var mediaCapturePermissionOrigins: Array<String>? = null
    set(value) {
      field = value
      webChromeClient.permissions.mediaOrigins = value
    }

  override var geolocationPermissionOrigins: Array<String>? = null
    set(value) {
      field = value
      webChromeClient.permissions.locationOrigins = value
    }

  override var javaScriptEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) postIfAvailable { view.settings.javaScriptEnabled = value }
    }

  override var domStorageEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) postIfAvailable { view.settings.domStorageEnabled = value }
    }

  override var cacheEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) postIfAvailable { view.settings.cacheMode = cacheModeFor(value) }
    }

  // CookieManager is process-global; refusing this setting avoids false isolation.
  override var incognito: Boolean? = null

  override fun afterUpdate() {
    super.afterUpdate()
    postIfAvailable {
      if (incognito == true) {
        sourceNeedsLoading = false
        if (!configurationErrorReported) {
          configurationErrorReported = true
          onError?.invoke(
            NitroWebViewErrorEvent(
              NitroWebViewErrorNativeEvent(
                code = -1.0,
                description = "incognito is not supported on Android.",
                url = source.match(first = { it.uri }, second = { it.baseUrl ?: "about:blank" }),
                domain = "NitroWebViewConfiguration",
              ),
            ),
          )
        }
        return@postIfAvailable
      }
      configurationErrorReported = false
      if (sourceNeedsLoading) {
        sourceNeedsLoading = false
        applySource(source)
      }
    }
  }

  override var mediaPlaybackRequiresUserAction: Boolean? = null
    set(value) {
      field = value
      if (value != null) {
        postIfAvailable { view.settings.mediaPlaybackRequiresUserGesture = value }
      }
    }

  override var scalesPageToFit: Boolean? = null
    set(value) {
      field = value
      if (value != null) {
        postIfAvailable {
          view.settings.loadWithOverviewMode = value
          view.settings.useWideViewPort = value
        }
      }
    }

  override var thirdPartyCookiesEnabled: Boolean? = null
    set(value) {
      field = value
      if (value != null) {
        postIfAvailable {
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
      postIfAvailable { applyDocumentStartScript() }
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
  private var loadActive = false
  private var loadFailed = false
  private var pendingHttpErrorUrl: String? = null
  private var loadUrl: String? = null
  override var onLoad: ((event: WebViewLoadEvent) -> Unit)? = null
  override var onLoadProgress: ((event: WebViewLoadProgressEvent) -> Unit)? = null
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
   * implementation uses a nominal [SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS]
   * millisecond budget, starting before the callback and subscription.
   * Callback execution and OS scheduling cannot be preempted by this budget.
   * When the timeout elapses with no resolution
   * the navigation is allowed (mirrors react-native-webview's
   * `RNCWebViewClient.SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS`).
   */
  override var onShouldStartLoadWithRequest: (
    (event: ShouldStartLoadRequest) -> Promise<Boolean>
  )? = null

  /**
   * Opt-in: intercept sub-frame (iframe) navigations through
   * [onShouldStartLoadWithRequest] too. Default `false`.
   *
   * When `false`/`null`, sub-frame navigations are allowed without a JS
   * round-trip so waits in [dispatchShouldStart] never stack per iframe
   * (jank / ANR risk on iframe-heavy pages). Main-frame requests delivered
   * by the platform hook are intercepted regardless of this flag.
   */
  override var interceptSubframeNavigation: Boolean? = null

  /**
   * Fired when the page requests a new window (`window.open` /
   * `target=_blank`), surfaced via [NitroWebChromeClient.onCreateWindow].
   * When set, the destination URL is delivered to JS and the WebView does
   * NOT load it. When unset, [NitroWebChromeClient] loads the URL in-place
   * in this WebView (react-native-webview default).
   */
  override var onOpenWindow: ((event: OpenWindowEvent) -> Unit)? = null

  init {
    installWebViewClients()
    installJavaScriptInterfaces()
    bindOpenWindowEvents()
    view.setDownloadListener(DownloadListenerImpl())
    reactContext.addActivityEventListener(activityEventListener)
    bindScrollEvents()
  }

  private fun installWebViewClients() {
    // WebView only reports window.open when multiple-window support is enabled.
    view.settings.setSupportMultipleWindows(true)
    view.webViewClient = ClientImpl()
    bindLoadProgressEvents()
    view.webChromeClient = webChromeClient
  }

  private fun bindLoadProgressEvents() {
    webChromeClient.onLoadProgress = { progress ->
      if (loadActive) {
        val state = snapshotNavigationState()
        onLoadProgress?.invoke(
          WebViewLoadProgressEvent(
            WebViewLoadProgressNativeEvent(
              url = state.url,
              title = state.title,
              loading = state.loading,
              canGoBack = state.canGoBack,
              canGoForward = state.canGoForward,
              progress = progress.coerceIn(0, 100) / 100.0,
            ),
          ),
        )
      }
    }
  }

  private fun installJavaScriptInterfaces() {
    view.addJavascriptInterface(BridgeInterface(), BRIDGE_NAME)
    // History changes use a separate interface so they cannot become onMessage events.
    view.addJavascriptInterface(HistoryShimInterface(), HISTORY_SHIM_NAME)
  }

  private fun bindOpenWindowEvents() {
    webChromeClient.onOpenWindow = { url ->
      postIfAvailable {
        onOpenWindow?.invoke(OpenWindowEvent(OpenWindowNativeEvent(url)))
      }
    }
  }

  private fun bindScrollEvents() {
    // WebView's protected content-range APIs are unavailable without subclassing it.
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
    postIfAvailable { view.goBack() }
  }

  override fun goForward() {
    postIfAvailable { view.goForward() }
  }

  override fun reload() {
    postIfAvailable { view.reload() }
  }

  override fun stopLoading() {
    postIfAvailable { view.stopLoading() }
  }

  override fun clearCache(): Promise<Unit> =
    withView { promise ->
      view.clearCache(true) // true = also delete on-disk cache files
      promise.resolve(Unit)
    }

  override fun clearHistory(): Promise<Unit> =
    withView { promise ->
      view.clearHistory()
      promise.resolve(Unit)
    }

  override fun requestFocus(): Promise<Unit> =
    withView { promise ->
      view.requestFocus()
      promise.resolve(Unit)
    }

  override fun evaluateJavaScript(code: String): Promise<String> =
    withView { promise ->
      evaluator.evaluate(
        code = code,
        evaluator = jsEvaluatorAdapter,
        resolve = { promise.resolve(it) },
        reject = { promise.reject(it) },
      )
    }

  /**
   * Fire-and-forget JS execution — no result surfaced to JS. Hops to the UI
   * thread like every other WebView-touching method (`evaluateJavascript`
   * is main-thread-only and the Nitro call can land off-thread).
   */
  override fun injectJavaScript(code: String) {
    postIfAvailable { view.evaluateJavascript(code, null) }
  }

  /**
   * Deliver a native→web message. Android dispatches a DOM `message` event
   * on `document` (react-native-webview parity —
   * `RNCWebViewManagerImpl.kt:335`). The statement is built + escaped by the
   * companion [postMessageScript] helper, then evaluated fire-and-forget.
   */
  override fun postMessage(data: String) {
    postIfAvailable { view.evaluateJavascript(postMessageScript(data), null) }
  }

  /**
   * Register (or re-register) the before-content script via
   * `WebViewCompat.addDocumentStartJavaScript` when the feature is
   * supported. Removes any previous registration first so prop changes
   * don't stack scripts. No-op when the feature is unsupported — those
   * WebViews fall back to injecting in [ClientImpl.onPageStarted].
   *
   * Must run on the UI thread (callers use `postIfAvailable`).
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
    documentStartScriptHandler =
      WebViewCompat.addDocumentStartJavaScript(
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
  override fun getCookies(url: String): Promise<Array<Cookie>> =
    withView { promise ->
      if (!validCookieUrl(url)) {
        promise.reject(IllegalArgumentException("Cookie URL must be an absolute HTTP(S) URL."))
        return@withView
      }
      val raw = CookieManager.getInstance().getCookie(url)
      val cookies = parseCookieHeader(raw)
      promise.resolve(cookies)
    }

  /**
   * Persist a single [cookie] into the shared `CookieManager`. The `url`
   * scopes the cookie and is also used to derive default `domain`/`path`
   * when those fields are omitted from [cookie]. The result is `flush()`-ed
   * before the promise resolves so callers see the cookie immediately on
   * subsequent [getCookies] reads.
   */
  override fun setCookie(
    url: String,
    cookie: Cookie,
  ): Promise<Unit> =
    withView { promise ->
      // Delegated through the companion helper so unit tests can pin both
      // the assembled Set-Cookie string AND the underlying `CookieManager`
      // invocation without needing Robolectric. Production code paths use
      // the default writer which delegates 1:1 to
      // `CookieManager.getInstance().setCookie(url, value, callback)` and
      // `flush()`. See [HybridNitroWebView.Companion.assembleAndWriteCookie].
      if (!validCookieUrl(url)) {
        promise.reject(IllegalArgumentException("Cookie URL must be an absolute HTTP(S) URL."))
        return@withView
      }
      assembleAndWriteCookie(url, cookie, cookieWriter) { promise.resolve(Unit) }
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
  override fun clearCookies(): Promise<Unit> =
    withView { promise ->
      clearAllCookies(cookieWriter) { promise.resolve(Unit) }
    }

  override fun onDropView() = destroyView()

  private fun destroyView() {
    if (destroyed) return
    destroyed = true
    loadActive = false
    clearEventCallbacks()
    disposePendingWork()
    detachNativeListeners()
    detachAndDestroyWebView()
  }

  private fun clearEventCallbacks() {
    onLoadStart = null
    onLoad = null
    onLoadEnd = null
    onLoadProgress = null
    onNavigationStateChange = null
    onMessage = null
    onError = null
    onFileDownload = null
    onHttpError = null
    onRenderProcessGone = null
    onScroll = null
    onOpenWindow = null
    onShouldStartLoadWithRequest = null
  }

  private fun disposePendingWork() {
    evaluator.dispose(destroyedViewException())
    webChromeClient.dispose()
    documentStartScriptHandler?.remove()
    documentStartScriptHandler = null
  }

  private fun detachNativeListeners() {
    reactContext.removeActivityEventListener(activityEventListener)
    view.webViewClient = WebViewClient()
    view.webChromeClient = null
    view.setDownloadListener(null)
    view.removeJavascriptInterface(BRIDGE_NAME)
    view.removeJavascriptInterface(HISTORY_SHIM_NAME)
    view.setOnScrollChangeListener(null)
  }

  private fun detachAndDestroyWebView() {
    (view.parent as? ViewGroup)?.removeView(view)
    view.destroy()
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
    if (!destroyed) webChromeClient.hostActivity = activity
  }

  private fun applySource(source: WebViewSource) {
    postIfAvailable {
      source.match(
        first = { uriSource ->
          // Delegate to the companion helper so the header-merge + loadUrl
          // call can be verified in unit tests via the UrlLoader seam.
          try {
            applyUriSource(uriSource, defaultHeaders, viewLoader)
          } catch (error: IllegalArgumentException) {
            onError?.invoke(
              NitroWebViewErrorEvent(
                NitroWebViewErrorNativeEvent(
                  code = -1.0,
                  description = error.message ?: "Invalid source",
                  url = uriSource.uri,
                  domain = "NitroWebViewSource",
                ),
              ),
            )
          }
        },
        second = { html ->
          val payload =
            NitroLoadHtmlPayload(
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
    if (!loadActive) return
    loadActive = false
    val event = WebViewLoadEvent(snapshotNavigationState().copy(loading = false))
    if (!loadFailed) onLoad?.invoke(event)
    onLoadEnd?.invoke(event)
  }

  private fun emitNavigationState() {
    if (destroyed) return
    onNavigationStateChange?.invoke(snapshotNavigationState())
  }

  private fun emitError(
    error: WebResourceErrorSource,
    request: WebResourceRequestSource?,
    fallbackUrl: String?,
  ) {
    val mapped =
      NitroWebViewErrorMapper.event(
        error = error,
        request = request,
        fallbackUrl = fallbackUrl,
      )
    val payload =
      NitroWebViewErrorEvent(
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
    val mapped =
      NitroWebViewHttpErrorMapper.event(
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
    override fun onPageStarted(
      view: WebView,
      url: String?,
      favicon: Bitmap?,
    ) {
      if (destroyed) return
      loadUrl = url
      loadActive = true
      // Chromium can report the response error before onPageStarted.
      loadFailed = pendingHttpErrorUrl == url
      pendingHttpErrorUrl = null
      // Inject the SPA history shim FIRST so history.pushState is wrapped
      // before the page's own scripts (including injectedJavaScriptBeforeContentLoaded
      // below) run. Idempotent via `window.__nitroHistoryShimInstalled`, so
      // re-running it on every onPageStarted (including iframe loads) never
      // double-wraps.
      view.evaluateJavascript(HISTORY_SHIM_SCRIPT, null)
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

    override fun onPageFinished(
      view: WebView,
      url: String?,
    ) {
      if (destroyed || !loadActive || url != loadUrl) return
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
     *   2. Starts a nominal [SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS]
     *      millisecond budget, calls the JS hook and waits only for the
     *      remaining time. Callback execution and scheduling can exceed it.
     *   3. Returns the boolean the Promise resolved with — or the
     *      default-allow value when the wait window elapses.
     */
    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest,
    ): Boolean {
      if (destroyed) return true
      val hook = onShouldStartLoadWithRequest ?: return false
      val url = request.url?.toString() ?: return false
      // Sub-frame (iframe) navigations only reach the JS hook when the caller
      // opts in via interceptSubframeNavigation. Otherwise allow them without
      // repeated UI-thread waits (which would stack per iframe → jank/ANR).
      if (!request.isForMainFrame && interceptSubframeNavigation != true) {
        return false // allow
      }
      val payload =
        ShouldStartLoadRequest(
          url = url,
          navigationType = WebViewNavigationType.OTHER,
          mainDocumentURL = null,
          isTopFrame = request.isForMainFrame, // was null; now meaningful
          hasTargetFrame = null, // Android has no target-frame concept here
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
      if (destroyed) return
      // Only main-frame errors should surface to JS, matching iOS semantics.
      if (request.isForMainFrame && loadActive && request.url.toString() == loadUrl) {
        loadFailed = true
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
      if (destroyed || !request.isForMainFrame) return
      if (loadActive && request.url.toString() == loadUrl) {
        loadFailed = true
      } else {
        pendingHttpErrorUrl = request.url.toString()
      }
      emitHttpError(
        response = AndroidWebResourceResponse(errorResponse),
        request = AndroidWebResourceRequest(request),
        fallbackUrl = view.url,
      )
    }

    /**
     * Renderer-process-gone recovery hook (API 26+; guarded because minSdk
     * is lower). MUST return `true` unconditionally: returning `false` lets
     * Android kill the entire host app. JS is notified after cleanup so it
     * can remount with a new React key. `didCrash()` distinguishes a real crash (`true`)
     * from an OS memory reclaim (`false`).
     */
    @RequiresApi(Build.VERSION_CODES.O)
    override fun onRenderProcessGone(
      view: WebView,
      detail: RenderProcessGoneDetail,
    ): Boolean {
      if (destroyed) return true
      val callback = onRenderProcessGone
      val event =
        NitroWebViewRenderProcessGoneEvent(
          NitroWebViewRenderProcessGoneNativeEvent(detail.didCrash()),
        )
      destroyView()
      try {
        callback?.invoke(event)
      } catch (error: RuntimeException) {
        Log.e("NitroWebView", "Renderer exit callback failed", error)
      }
      return true
    }
  }

  /**
   * Bridge between [ClientImpl.shouldOverrideUrlLoading] and the JS hook.
   *
   * Implementation contract:
   *   1. Start the monotonic budget before invoking `hook(payload)`.
   *   2. Wait only for the remaining budget while the Promise's
   *      `then`/`catch` callbacks notify the lock. Callback execution and
   *      OS scheduling can exceed the nominal budget.
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
  ): Boolean = Companion.awaitShouldStart(hook, payload, timeoutMs)

  private inner class BridgeInterface {
    @JavascriptInterface
    fun postMessage(data: String) {
      // @JavascriptInterface runs on a dedicated `JavaBridge` thread.
      // WebView.url / onMessage delivery must hop back to the UI thread.
      // Peek for a reserved blob-download envelope BEFORE treating the
      // payload as a normal onMessage string — a real download is routed to
      // onFileDownload, everything else falls through unchanged.
      val blob = parseBlobEnvelope(data)
      if (blob != null) {
        postIfAvailable {
          // The data URL is the ONE place a data: URL is a legitimate
          // FileDownload.url (blob bytes bridged in-band as base64).
          emitFileDownload(
            FileDownload(
              url = blob.dataUrl,
              mimeType = blob.mimeType.takeIf { it.isNotEmpty() },
              fileName = blob.fileName.takeIf { it.isNotEmpty() },
              contentLength = blob.size.takeIf { it > 0 },
              userAgent = null,
            ),
          )
        }
        return
      }
      postIfAvailable {
        val payload =
          WebViewMessageEvent(
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
   * Second `@JavascriptInterface`, registered under a DISTINCT name
   * ([HISTORY_SHIM_NAME]) from [BridgeInterface]. The SPA history shim posts
   * the nav-type here on pushState/replaceState/popstate. We route to
   * `onNavigationStateChange` (never `onMessage`, never
   * `onShouldStartLoadWithRequest` — a pushState already happened and cannot
   * be vetoed). The nav-type is advisory; the fresh URL is read live from
   * `view.url` in [snapshotNavigationState].
   */
  private inner class HistoryShimInterface {
    @JavascriptInterface
    fun postMessage(navType: String) {
      // Runs on the JavaBridge thread; hop to the UI thread to read
      // view.url and deliver the callback.
      postIfAvailable { emitNavigationState() }
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
   * `blob:` URLs cannot be fetched natively and take a JS-inject path; see
   * the inline note below and [buildBlobReaderScript] / [parseBlobEnvelope].
   */
  private inner class DownloadListenerImpl : DownloadListener {
    override fun onDownloadStart(
      url: String?,
      userAgent: String?,
      contentDisposition: String?,
      mimetype: String?,
      contentLength: Long,
    ) {
      if (destroyed || url == null) return
      // blob: bytes live only in the web context — inject a reader that
      // resolves the blob to a data URL and posts it back through the bridge
      // (demuxed in BridgeInterface.postMessage). The real onFileDownload is
      // emitted from there, not here.
      if (url.startsWith("blob:")) {
        val guessed = deriveDownloadFileName(url, contentDisposition, mimetype)
        val js = buildBlobReaderScript(url, guessed)
        postIfAvailable { view.evaluateJavascript(js, null) }
        return
      }
      val fileName = deriveDownloadFileName(url, contentDisposition, mimetype)
      val event =
        FileDownload(
          url = url,
          mimeType = mimetype?.takeIf { it.isNotEmpty() },
          fileName = fileName,
          contentLength = if (contentLength <= 0L) null else contentLength.toDouble(),
          userAgent = userAgent?.takeIf { it.isNotEmpty() },
        )
      // Surface to JS. The native side performs NO automatic
      // DownloadManager.enqueue and NO file save — JS decides what to do.
      postIfAvailable { emitFileDownload(event) }
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
    fun loadUrl(
      url: String,
      additionalHttpHeaders: Map<String, String>,
    )

    fun postUrl(
      url: String,
      body: ByteArray,
    )
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
    fun setCookie(
      url: String,
      value: String,
      callback: (Boolean) -> Unit,
    )

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
    override fun setCookie(
      url: String,
      value: String,
      callback: (Boolean) -> Unit,
    ) {
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
    internal fun validCookieUrl(raw: String): Boolean =
      try {
        val uri = java.net.URI(raw)
        (uri.scheme.equals("http", true) || uri.scheme.equals("https", true)) && !uri.host.isNullOrEmpty()
      } catch (_: java.net.URISyntaxException) {
        false
      }

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
    internal fun encodeJsStringLiteral(message: String): String =
      JSONObject
        .quote(message)
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")

    /**
     * @JavascriptInterface name for the SPA history sink. Must match
     * `ANDROID_HISTORY_SHIM_NAME` in `bridgeScript.ts` and the sink the
     * injected [HISTORY_SHIM_SCRIPT] posts to.
     */
    private const val HISTORY_SHIM_NAME = "ReactNativeHistoryShimNative"

    /**
     * SPA history-API shim. Ships the same body
     * `buildHistoryShimScript('android')` produces in `bridgeScript.ts`
     * (the source of truth exercised by the node:test suite). Hooks
     * pushState/replaceState/popstate and posts the nav-type to the
     * dedicated [HISTORY_SHIM_NAME] interface. Idempotent via
     * `window.__nitroHistoryShimInstalled` so re-injection on every
     * onPageStarted never double-wraps.
     */
    private val HISTORY_SHIM_SCRIPT: String =
      """
      ;(function (history) {
        if (window.__nitroHistoryShimInstalled) { return; }
        window.__nitroHistoryShimInstalled = true;
        function notify(__type) {
          window.setTimeout(function () {
            var __n = window.ReactNativeHistoryShimNative;
            if (__n && typeof __n.postMessage === 'function') {
              __n.postMessage(__type);
            }
          }, 0);
        }
        function shim(f) {
          return function () {
            notify('other');
            return f.apply(history, arguments);
          };
        }
        history.pushState = shim(history.pushState);
        history.replaceState = shim(history.replaceState);
        window.addEventListener('popstate', function () { notify('backforward'); });
      })(window.history);
      """.trimIndent()

    /**
     * Nominal callback/subscription/wait budget before defaulting to allow.
     * Matches react-native-webview's Android policy; it cannot preempt the
     * callback or OS scheduling.
     */
    internal const val SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS: Long = 250L

    /**
     * Start the wait budget before invoking [hook]. Promise closures retain
     * only this call's decision state, not the view or callback.
     */
    @JvmStatic
    internal fun awaitShouldStart(
      hook: (event: ShouldStartLoadRequest) -> Promise<Boolean>,
      payload: ShouldStartLoadRequest,
      timeoutMs: Long = SHOULD_OVERRIDE_URL_LOADING_TIMEOUT_MS,
    ): Boolean =
      awaitBooleanWithTimeout(
        timeoutMs = timeoutMs,
        subscribe = { onResolve, onReject ->
          val promise = hook(payload)
          promise.then { value -> onResolve(value) }
          promise.catch { error -> onReject(error) }
        },
      )

    /**
     * Pure-Kotlin decision wait, shared with JVM tests. The clock and wait
     * seams allow deterministic deadline and spurious-wakeup checks without
     * JNI or real sleeps. Timeout, rejection, recoverable callback/subscription
     * failure and interruption fail open; fatal native errors propagate.
     */
    @JvmStatic
    internal fun awaitBooleanWithTimeout(
      timeoutMs: Long,
      nanoTime: () -> Long = System::nanoTime,
      waitFor: (Object, Long) -> Unit = { lock, remainingNanos ->
        lock.wait(remainingNanos / 1_000_000L, (remainingNanos % 1_000_000L).toInt())
      },
      subscribe: (
        onResolve: (Boolean) -> Unit,
        onReject: (Throwable) -> Unit,
      ) -> Unit,
    ): Boolean {
      val startedAt = nanoTime()
      val timeoutNanos = TimeUnit.MILLISECONDS.toNanos(timeoutMs)
      val lock = Object()
      var completed = false
      var result = true

      fun complete(value: Boolean) {
        synchronized(lock) {
          if (!completed) {
            result = if (nanoTime() - startedAt < timeoutNanos) value else true
            completed = true
            lock.notifyAll()
          }
        }
      }
      try {
        subscribe({ value -> complete(value) }, { _ -> complete(true) })
      } catch (e: InterruptedException) {
        Thread.currentThread().interrupt()
        synchronized(lock) {
          completed = true
          return true
        }
      } catch (e: Exception) {
        synchronized(lock) {
          completed = true
          return true
        }
      }
      synchronized(lock) {
        while (!completed) {
          val remaining = timeoutNanos - (nanoTime() - startedAt)
          if (remaining <= 0L) break
          try {
            waitFor(lock, remaining)
          } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            result = true
            break
          }
        }
        completed = true
        return result
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
      val merged =
        HashMap<String, String>().apply {
          putAll(defaultHeaders ?: emptyMap())
          putAll(uriSource.headers ?: emptyMap())
        }
      val body =
        NitroWebViewSourceHandler.postBody(
          uriSource.uri,
          uriSource.method?.name,
          uriSource.body,
          merged,
        )
      if (body == null) {
        loader.loadUrl(uriSource.uri, merged)
      } else {
        loader.postUrl(uriSource.uri, body)
      }
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
    ): String =
      try {
        val decoded =
          if (contentDisposition != null) {
            decoder(contentDisposition, "utf-8")
          } else {
            null
          }
        primary(decoded, null, url, mimetype)
      } catch (e: Exception) {
        fallback(url, contentDisposition, mimetype)
      }

    /**
     * Map the `cacheEnabled` prop to a `WebSettings.cacheMode` constant:
     * `true` -> `LOAD_DEFAULT` (use the HTTP cache normally); `false` ->
     * `LOAD_NO_CACHE` (always hit the network). Extracted so the boolean ->
     * constant mapping can be unit-tested without a real `WebView`.
     */
    @JvmStatic
    internal fun cacheModeFor(enabled: Boolean): Int = if (enabled) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_NO_CACHE

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
          ),
        )
      }
      return out.toTypedArray()
    }

    /**
     * Reserved discriminator key for blob-download payloads. Kept in sync
     * with `BLOB_ENVELOPE_KEY` in `src/bridgeScript.ts` (the canonical TS
     * source). A payload literally starting with `{"__nitro_blob__"` is
     * demuxed to `onFileDownload`; everything else is a normal `onMessage`.
     */
    internal const val BLOB_ENVELOPE_KEY = "__nitro_blob__"

    /**
     * Parsed blob-download payload. Mirrors `BlobDownloadPayload` in
     * `src/bridgeScript.ts`.
     */
    internal data class BlobEnvelope(
      val url: String,
      val dataUrl: String,
      val mimeType: String,
      val fileName: String,
      val size: Double,
    )

    /**
     * Injects the in-page reader that resolves a `blob:` URL to a data URL and
     * posts a reserved envelope back through the message bridge; the envelope
     * must match `parseBlobEnvelope`'s contract in `src/bridgeScript.ts`.
     * `suggestedName` is native-derived (usually junk off the blob URL).
     */
    @JvmStatic
    internal fun buildBlobReaderScript(
      blobUrl: String,
      suggestedName: String,
    ): String {
      val urlLit = jsonQuote(blobUrl)
      val nameLit = jsonQuote(suggestedName)
      val keyLit = jsonQuote(BLOB_ENVELOPE_KEY)
      return """;(function () {
  try {
    fetch($urlLit).then(function (r) { return r.blob(); }).then(function (b) {
      var reader = new FileReader();
      reader.onloadend = function () {
        var dataUrl = String(reader.result || '');
        var envelope = {};
        envelope[$keyLit] = {
          url: $urlLit,
          dataUrl: dataUrl,
          mimeType: b.type || '',
          fileName: $nameLit,
          size: b.size || 0
        };
        var br = window.$BRIDGE_NAME;
        if (br && typeof br.postMessage === 'function') {
          br.postMessage(JSON.stringify(envelope));
        }
      };
      reader.readAsDataURL(b);
    })["catch"](function () { /* blob gone / cross-origin: swallow */ });
  } catch (e) { /* no fetch/FileReader: swallow, no page throw */ }
})();"""
    }

    /**
     * Parse a raw `postMessage` string; return the blob payload or `null`
     * when it is a normal `onMessage` payload. Kotlin port of
     * `parseBlobEnvelope` in `src/bridgeScript.ts`. A cheap prefix peek runs
     * before the JSON parse so ordinary payloads are forwarded untouched.
     *
     * ponytail: the whole blob rides the bridge base64'd (data URL) —
     * O(fileSize) memory, ~1.33x inflation, held twice (JS string + native
     * String). Fine for the common blob (generated CSV/PDF/image, a few MB);
     * a very large blob will strain the bridge. Upgrade path: temp-file
     * streaming (slice the blob and post chunks, or a native download to
     * disk) surfacing a `file://` URL instead of a data: URL.
     */
    @JvmStatic
    internal fun parseBlobEnvelope(raw: String?): BlobEnvelope? {
      if (raw == null) return null
      if (!raw.startsWith("{\"$BLOB_ENVELOPE_KEY\"")) return null
      return try {
        val root = org.json.JSONObject(raw)
        val b = root.optJSONObject(BLOB_ENVELOPE_KEY) ?: return null
        val url = b.optString("url", "")
        val dataUrl = b.optString("dataUrl", "")
        if (url.isEmpty() || dataUrl.isEmpty()) return null
        BlobEnvelope(
          url = url,
          dataUrl = dataUrl,
          mimeType = b.optString("mimeType", ""),
          fileName = b.optString("fileName", ""),
          size = b.optDouble("size", 0.0),
        )
      } catch (e: org.json.JSONException) {
        null
      }
    }

    /**
     * Minimal JSON string-literal encoder for the values embedded in the
     * blob reader script. `org.json.JSONObject.quote` handles the escaping
     * (quotes, backslashes, control chars) the same way `JSON.stringify`
     * does for a bare string in the TS source.
     */
    @JvmStatic
    internal fun jsonQuote(s: String): String = org.json.JSONObject.quote(s)

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
