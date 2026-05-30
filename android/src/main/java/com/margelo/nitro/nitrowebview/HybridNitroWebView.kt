package com.margelo.nitro.nitrowebview

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.uimanager.ThemedReactContext
import com.margelo.nitro.core.Promise

@SuppressLint("SetJavaScriptEnabled")
class HybridNitroWebView(context: ThemedReactContext) : HybridNitroWebViewSpec() {

  override val view: WebView = WebView(context).also { wv ->
    wv.settings.javaScriptEnabled = true
    wv.settings.domStorageEnabled = true
  }

  private val sourceHandler = NitroWebViewSourceHandler()
  private val evaluator = NitroWebViewEvaluateJavaScriptHandler()
  private val htmlLoaderAdapter = AndroidWebViewHtmlLoader(view)
  private val jsEvaluatorAdapter = AndroidWebViewJavaScriptEvaluator(view)

  override var source: WebViewSource = WebViewSource.create(UriSource("about:blank"))
    set(value) {
      field = value
      applySource(value)
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

  init {
    view.webViewClient = ClientImpl()
    view.addJavascriptInterface(BridgeInterface(), BRIDGE_NAME)
  }

  override fun goBack() {
    view.goBack()
  }

  override fun goForward() {
    view.goForward()
  }

  override fun reload() {
    view.reload()
  }

  override fun stopLoading() {
    view.stopLoading()
  }

  override fun evaluateJavaScript(code: String): Promise<String> {
    val promise = Promise<String>()
    evaluator.evaluate(
      code = code,
      evaluator = jsEvaluatorAdapter,
      resolve = { promise.resolve(it) },
      reject = { promise.reject(it) },
    )
    return promise
  }

  override fun onDropView() {
    view.webViewClient = WebViewClient() // detach our client
    view.removeJavascriptInterface(BRIDGE_NAME)
    view.stopLoading()
  }

  private fun applySource(source: WebViewSource) {
    source.match(
      first = { uri -> view.loadUrl(uri.uri) },
      second = { html ->
        val payload = NitroLoadHtmlPayload(
          html = html.html,
          baseUrlString = html.baseUrl,
        )
        sourceHandler.applyHtmlPayload(payload, htmlLoaderAdapter)
      },
    )
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

  companion object {
    private const val BRIDGE_NAME = "ReactNativeWebView"
  }
}
