import Foundation
import NitroModules
import WebKit

final class HybridNitroWebView:
  HybridNitroWebViewSpec,
  NitroWebViewMessageDispatcher
{
  let view: WKWebView

  private let sourceHandler = NitroWebViewSourceHandler()
  private let evaluator = NitroWebViewEvaluateJavaScriptHandler()
  private let messageHandler = NitroWebViewMessageHandler()
  private let navigationDelegate: NavigationDelegate
  private var currentInjectedUserScript: WKUserScript?

  var onLoadStart: ((WebViewLoadEvent) -> Void)?
  var onLoadEnd: ((WebViewLoadEvent) -> Void)?
  var onNavigationStateChange: ((WebViewNavigationState) -> Void)?
  var onMessage: ((WebViewMessageEvent) -> Void)?
  var onError: ((NitroWebViewErrorEvent) -> Void)?

  override init() {
    let configuration = WKWebViewConfiguration()
    self.view = WKWebView(frame: .zero, configuration: configuration)
    self.navigationDelegate = NavigationDelegate()
    super.init()

    navigationDelegate.owner = self
    view.navigationDelegate = navigationDelegate
    messageHandler.dispatcher = self
    let controller = configuration.userContentController
    controller.add(
      messageHandler,
      name: NitroWebViewMessageHandler.scriptMessageHandlerName
    )
    // Defines window.ReactNativeWebView.postMessage so web pages can call
    // it without knowing about WKWebView's webkit.messageHandlers bridge.
    controller.addUserScript(WKUserScript(
      source: Self.bridgeBootstrapScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
  }

  private static let bridgeBootstrapScript: String = """
  ;(function () {
    var __bridge = window.ReactNativeWebView;
    if (__bridge && typeof __bridge.postMessage === 'function') {
      return;
    }
    if (!__bridge) {
      __bridge = {};
      window.ReactNativeWebView = __bridge;
    }
    __bridge.postMessage = function (data) {
      var __payload = (typeof data === 'string') ? data : String(data);
      var __wk = window.webkit;
      if (__wk && __wk.messageHandlers && __wk.messageHandlers.ReactNativeWebView) {
        __wk.messageHandlers.ReactNativeWebView.postMessage(__payload);
      }
    };
  })();
  """

  func onDropView() {
    let controller = view.configuration.userContentController
    controller.removeScriptMessageHandler(
      forName: NitroWebViewMessageHandler.scriptMessageHandlerName
    )
    controller.removeAllUserScripts()
    view.navigationDelegate = nil
    navigationDelegate.owner = nil
    messageHandler.dispatcher = nil
  }

  var source: WebViewSource = .first(UriSource(uri: "about:blank")) {
    didSet { applySource(source) }
  }

  var injectedJavaScript: String? {
    didSet { applyInjectedJavaScript(injectedJavaScript) }
  }

  func goBack() throws { view.goBack() }
  func goForward() throws { view.goForward() }
  func reload() throws { view.reload() }
  func stopLoading() throws { view.stopLoading() }

  func evaluateJavaScript(code: String) throws -> Promise<String> {
    let promise = Promise<String>()
    evaluator.evaluate(
      code: code,
      in: view,
      resolve: { result in promise.resolve(withResult: result) },
      reject: { error in promise.reject(withError: error) }
    )
    return promise
  }

  private func applySource(_ source: WebViewSource) {
    switch source {
    case .first(let uri):
      guard let url = URL(string: uri.uri) else { return }
      view.load(URLRequest(url: url))
    case .second(let html):
      let payload = NitroLoadHtmlPayload(
        html: html.html,
        baseUrlString: html.baseUrl
      )
      sourceHandler.applyHtmlPayload(payload, to: view)
    }
  }

  private func applyInjectedJavaScript(_ script: String?) {
    let controller = view.configuration.userContentController
    controller.removeAllUserScripts()
    // Re-install the bridge bootstrap that lives on every page.
    controller.addUserScript(WKUserScript(
      source: Self.bridgeBootstrapScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))
    currentInjectedUserScript = nil
    guard let script, !script.isEmpty else { return }
    let userScript = WKUserScript(
      source: script,
      injectionTime: .atDocumentEnd,
      forMainFrameOnly: true
    )
    controller.addUserScript(userScript)
    currentInjectedUserScript = userScript
  }

  func dispatchMessage(_ event: NitroWebViewMessageEvent) {
    let payload = WebViewMessageEvent(
      nativeEvent: WebViewMessageNativeEvent(
        data: event.data,
        url: event.url
      )
    )
    onMessage?(payload)
  }

  fileprivate final class NavigationDelegate: NSObject, WKNavigationDelegate {
    weak var owner: HybridNitroWebView?

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
      owner?.emitLoadStart()
      owner?.emitNavigationState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      owner?.emitLoadEnd()
      owner?.emitNavigationState()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      owner?.emitError(error as NSError, fallbackUrl: webView.url?.absoluteString)
      owner?.emitLoadEnd()
      owner?.emitNavigationState()
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      owner?.emitError(error as NSError, fallbackUrl: webView.url?.absoluteString)
      owner?.emitLoadEnd()
      owner?.emitNavigationState()
    }
  }

  fileprivate func emitLoadStart() {
    onLoadStart?(WebViewLoadEvent(nativeEvent: snapshotNavigationState()))
  }

  fileprivate func emitLoadEnd() {
    onLoadEnd?(WebViewLoadEvent(nativeEvent: snapshotNavigationState()))
  }

  fileprivate func emitNavigationState() {
    onNavigationStateChange?(snapshotNavigationState())
  }

  fileprivate func emitError(_ error: NSError, fallbackUrl: String?) {
    let mapped = NitroWebViewErrorMapper.event(from: error, fallbackUrl: fallbackUrl)
    let payload = NitroWebViewErrorEvent(
      nativeEvent: NitroWebViewErrorNativeEvent(
        code: Double(mapped.code),
        description: mapped.description,
        url: mapped.url,
        domain: mapped.domain
      )
    )
    onError?(payload)
  }

  private func snapshotNavigationState() -> WebViewNavigationState {
    WebViewNavigationState(
      url: view.url?.absoluteString ?? "",
      title: view.title ?? "",
      loading: view.isLoading,
      canGoBack: view.canGoBack,
      canGoForward: view.canGoForward
    )
  }
}
