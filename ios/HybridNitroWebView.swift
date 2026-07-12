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
  private let uiDelegate: UIDelegate
  private var currentInjectedUserScript: WKUserScript?

  var onLoadStart: ((WebViewLoadEvent) -> Void)?
  var onLoadEnd: ((WebViewLoadEvent) -> Void)?
  var onNavigationStateChange: ((WebViewNavigationState) -> Void)?
  var onMessage: ((WebViewMessageEvent) -> Void)?
  var onError: ((NitroWebViewErrorEvent) -> Void)?
  var onFileDownload: ((FileDownloadEvent) -> Void)?
  /// JS-side navigation-interception hook. When non-nil, every main-frame
  /// navigation surfaces a `ShouldStartLoadRequest` payload to JS via
  /// `dispatchShouldStart`; the Promise's boolean result decides whether
  /// the platform commits to the navigation (`true` → `.allow`, `false` →
  /// `.cancel`). No timeout is applied — the stashed `decisionHandler`
  /// stays parked in `pendingDecisions` until the Promise resolves
  /// (mirroring react-native-webview's iOS behavior).
  var onShouldStartLoadWithRequest: ((ShouldStartLoadRequest) -> Promise<Bool>)?

  override init() {
    let configuration = WKWebViewConfiguration()
    self.view = WKWebView(frame: .zero, configuration: configuration)
    self.navigationDelegate = NavigationDelegate()
    self.uiDelegate = UIDelegate()
    super.init()

    navigationDelegate.owner = self
    view.navigationDelegate = navigationDelegate
    // Binding any `WKUIDelegate` is what enables WebKit's built-in
    // `<input type="file">` chooser (camera / photo library / document
    // picker). The delegate itself does not need to implement any picker
    // APIs — setting any delegate flips WebKit's internal
    // `_uiDelegate != nil` gate that gates the picker presentation. The
    // HTML `accept`, `multiple`, and `capture` attributes are honored by
    // WebKit directly. No public TS API is exposed — behavior is fully
    // driven by the HTML input attributes (react-native-webview parity).
    view.uiDelegate = uiDelegate
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
    view.uiDelegate = nil
    navigationDelegate.owner = nil
    messageHandler.dispatcher = nil
  }

  var source: WebViewSource = .first(UriSource(uri: "about:blank", headers: nil)) {
    didSet { applySource(source) }
  }

  /// Default HTTP headers applied to every main-frame navigation initiated
  /// by a `source` change. Per-request `source.headers` win on key conflict
  /// (case-insensitive comparison — see `Self.mergeHeaders`). Mutating
  /// `defaultHeaders` alone does not trigger a navigation; the next
  /// `source` update is when the merged headers are applied.
  var defaultHeaders: [String: String]?

  /// Forwards to `WKWebView.customUserAgent`. Setting it to `nil` or the
  /// empty string restores the platform default WebKit UA.
  var userAgent: String? {
    didSet {
      let value = userAgent
      view.customUserAgent = (value?.isEmpty ?? true) ? nil : value
    }
  }

  // MARK: - Settings props

  // Applied live in didSet; nil restores the documented default.
  var scrollEnabled: Bool? {
    didSet { view.scrollView.isScrollEnabled = scrollEnabled ?? true }
  }
  var bounces: Bool? {
    didSet { view.scrollView.bounces = bounces ?? true }
  }
  var allowsBackForwardNavigationGestures: Bool? {
    didSet {
      view.allowsBackForwardNavigationGestures =
        allowsBackForwardNavigationGestures ?? false
    }
  }

  /// Consumed in `applySource` when building the next `URLRequest`
  /// (WKWebView has no global cache switch). Stored here; see
  /// `Self.cachePolicy(forCacheEnabled:)`.
  var cacheEnabled: Bool?

  // No-op on iOS / no iOS knob: stored but never applied, on any render. See
  // each prop's JSDoc in `NitroWebView.nitro.ts` for why - Nitro delivers
  // props strictly after `init()` runs, so the WKWebView-configuration-only
  // ones (incognito, javaScriptEnabled, mediaPlaybackRequiresUserAction,
  // allowsInlineMediaPlayback, sharedCookiesEnabled) never have a window in
  // which their value is known before the view is built.
  var incognito: Bool?
  var mediaPlaybackRequiresUserAction: Bool?
  var allowsInlineMediaPlayback: Bool?
  var sharedCookiesEnabled: Bool?
  var domStorageEnabled: Bool?
  var scalesPageToFit: Bool?
  var thirdPartyCookiesEnabled: Bool?
  var javaScriptEnabled: Bool?

  var injectedJavaScript: String? {
    didSet { reinstallUserScripts() }
  }

  /// JS injected at `.atDocumentStart` (main frame only), before any page
  /// script runs. Distinct from `injectedJavaScript`, which runs at
  /// `.atDocumentEnd`. Re-registers all user scripts in order on change.
  var injectedJavaScriptBeforeContentLoaded: String? {
    didSet { reinstallUserScripts() }
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

  /// Fire-and-forget JS execution — no result, no completion. Mirrors
  /// react-native-webview's `injectJavaScript` (`nil` completion handler).
  func injectJavaScript(code: String) throws {
    view.evaluateJavaScript(code, completionHandler: nil)
  }

  /// Deliver a native→web message. iOS dispatches a DOM `message` event on
  /// `window` (RNCWebViewImpl.m:1113). The statement is built + escaped by
  /// the shared `NitroWebViewPostMessage` builder, then evaluated
  /// fire-and-forget.
  func postMessage(data: String) throws {
    view.evaluateJavaScript(Self.postMessageScript(data), completionHandler: nil)
  }

  /// Swift-side re-export of the shared `buildPostMessageScript('ios', _)`
  /// builder. Kept as a static (delegating to the standalone
  /// `NitroWebViewPostMessage`) so `swift test` can assert the emitted
  /// statement without a `WKWebView`.
  static func postMessageScript(_ message: String) -> String {
    NitroWebViewPostMessage.buildStatement(message)
  }

  // MARK: - Cookie API

  /// Fetch cookies from
  /// `view.configuration.websiteDataStore.httpCookieStore.getAllCookies`
  /// and filter the results by:
  ///   1. URL host match  (RFC 6265 §5.1.3 — exact, leading-dot suffix, or
  ///                       unprefixed parent suffix; case-insensitive)
  ///   2. Path prefix     (RFC 6265 §5.1.4 — `/`-aware prefix so `/foo`
  ///                       cookies never leak to `/foobar` requests)
  ///   3. Secure flag     (secure cookies are excluded for non-HTTPS URLs)
  /// All three rules are encoded in `NitroWebViewCookieFilter`, which lives
  /// in a separate file so the rules can be exercised by `swift test` on
  /// the macOS host against real `HTTPCookie` instances.
  func getCookies(url: String) throws -> Promise<[Cookie]> {
    let promise = Promise<[Cookie]>()
    let scope = NitroWebViewCookieFilter.urlScope(forUrl: url)
    let store = view.configuration.websiteDataStore.httpCookieStore
    store.getAllCookies { cookies in
      let filtered: [Cookie] = cookies.compactMap { httpCookie in
        guard NitroWebViewCookieFilter.cookieMatches(httpCookie, scope: scope)
        else { return nil }
        return Self.toCookie(httpCookie)
      }
      promise.resolve(withResult: filtered)
    }
    return promise
  }

  func setCookie(url: String, cookie: Cookie) throws -> Promise<Void> {
    let promise = Promise<Void>()
    guard let httpCookie = Self.toHTTPCookie(cookie, fallbackUrl: url) else {
      promise.reject(withError: NSError(
        domain: "NitroWebView",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey:
          "Could not construct HTTPCookie from supplied fields"]
      ))
      return promise
    }
    let store = WKWebsiteDataStore.default().httpCookieStore
    store.setCookie(httpCookie) {
      promise.resolve(withResult: ())
    }
    return promise
  }

  /// Drop every cookie stored in the default data store via the
  /// `WKWebsiteDataStore` bulk-removal API.
  ///
  /// `modifiedSince: .distantPast` is the canonical "everything ever" lower
  /// bound — every cookie has a `modifiedSince` strictly after the distant
  /// past, so the call clears the store wholesale rather than touching only
  /// recently-modified entries. The completion handler resolves the promise
  /// once WebKit reports the removal is complete (which is the moment the
  /// next call to `httpCookieStore.getAllCookies` is guaranteed to see an
  /// empty jar).
  func clearCookies() throws -> Promise<Void> {
    let promise = Promise<Void>()
    WKWebsiteDataStore.default().removeData(
      ofTypes: [WKWebsiteDataTypeCookies],
      modifiedSince: .distantPast
    ) {
      promise.resolve(withResult: ())
    }
    return promise
  }

  private func applySource(_ source: WebViewSource) {
    switch source {
    case .first(let uri):
      guard let url = URL(string: uri.uri) else { return }
      var request = URLRequest(url: url)
      request.cachePolicy = Self.cachePolicy(forCacheEnabled: cacheEnabled)
      let merged = Self.mergeHeaders(
        defaults: defaultHeaders,
        perRequest: uri.headers
      )
      for (k, v) in merged {
        request.setValue(v, forHTTPHeaderField: k)
      }
      view.load(request)
    case .second(let html):
      let payload = NitroLoadHtmlPayload(
        html: html.html,
        baseUrlString: html.baseUrl
      )
      sourceHandler.applyHtmlPayload(payload, to: view)
    }
  }

  /// Merge `defaults` and `perRequest` headers with per-request taking
  /// precedence on key conflict. Comparison is **case-insensitive**: when
  /// both maps carry the same logical header with different casing, only
  /// the per-request entry survives (preserving its casing). This is the
  /// contract documented on `NitroWebViewProps.defaultHeaders`.
  ///
  /// Implementation note: the final union step uses Swift's
  /// `Dictionary(_:uniquingKeysWith:)` initializer with a "last-wins"
  /// (`{ _, new in new }`) policy so that for any key collision the
  /// per-request value replaces the default value. This is the canonical
  /// Swift idiom for a right-biased dictionary merge. The preceding
  /// filter strips defaults whose key matches a per-request key under a
  /// case-insensitive comparison so that, e.g., `Authorization` in
  /// `defaults` does not survive when `authorization` is in `perRequest`.
  static func mergeHeaders(
    defaults: [String: String]?,
    perRequest: [String: String]?
  ) -> [String: String] {
    let d = defaults ?? [:]
    let r = perRequest ?? [:]
    if r.isEmpty { return d }
    if d.isEmpty { return r }

    var conflictingLower: Set<String> = []
    for k in r.keys { conflictingLower.insert(k.lowercased()) }

    // Drop defaults whose key collides (case-insensitive) with a
    // per-request key — those will be supplied by `r` below.
    let filteredDefaults = d.filter { !conflictingLower.contains($0.key.lowercased()) }

    // Right-biased union: concatenate the filtered defaults with the
    // per-request pairs and feed them to `Dictionary(_:uniquingKeysWith:)`
    // with a last-wins resolver. The resolver is the explicit
    // "source.headers wins" point. After the case-insensitive filter
    // above, the only collisions reaching the resolver are exact-key
    // duplicates between `r` and itself, which is a no-op — but the
    // resolver guarantees the contract regardless.
    let pairs = filteredDefaults.map { ($0.key, $0.value) }
      + r.map { ($0.key, $0.value) }
    return Dictionary(pairs, uniquingKeysWith: { _, new in new })
  }

  /// Rebuild the `WKUserContentController`'s user-script list in a fixed
  /// order whenever `injectedJavaScript` or
  /// `injectedJavaScriptBeforeContentLoaded` changes.
  ///
  /// `WKUserScript`s run in registration order within the same injection
  /// time, so the ordering here is the contract:
  ///   1. bridge bootstrap  — `.atDocumentStart`, all frames.
  ///   2. before-content    — `.atDocumentStart`, main frame only. Runs
  ///      after the bridge (so pages can still call `postMessage`) but
  ///      before any page script.
  ///   3. injected (after)  — `.atDocumentEnd`, main frame only.
  ///
  /// `removeAllUserScripts()` + re-add on every change keeps the list
  /// idempotent regardless of the order the two props are set at mount.
  private func reinstallUserScripts() {
    let controller = view.configuration.userContentController
    controller.removeAllUserScripts()

    // 1. bridge bootstrap — always present.
    controller.addUserScript(WKUserScript(
      source: Self.bridgeBootstrapScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))

    // 2. before-content — atDocumentStart, main frame only.
    if let before = injectedJavaScriptBeforeContentLoaded, !before.isEmpty {
      controller.addUserScript(WKUserScript(
        source: before,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
      ))
    }

    // 3. after-load — atDocumentEnd, main frame only.
    currentInjectedUserScript = nil
    if let after = injectedJavaScript, !after.isEmpty {
      let userScript = WKUserScript(
        source: after,
        injectionTime: .atDocumentEnd,
        forMainFrameOnly: true
      )
      controller.addUserScript(userScript)
      currentInjectedUserScript = userScript
    }
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

    /// In-memory map of WKNavigationAction → its WebKit-supplied
    /// `decisionHandler` closure, parked while the JS-side Promise from
    /// `onShouldStartLoadWithRequest` resolves. There is NO timeout — the
    /// closure stays here indefinitely until JS calls back, mirroring
    /// react-native-webview's iOS lockIdentifier round-trip semantics.
    private var pendingDecisions: [ObjectIdentifier: (WKNavigationActionPolicy) -> Void] = [:]

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
      owner?.emitLoadStart()
      owner?.emitNavigationState()
    }

    /// Navigation-interception entry point. When the host has no
    /// `onShouldStartLoadWithRequest` callback installed, every navigation
    /// is allowed without JS round-trip. When the callback is installed:
    ///   1. Park `decisionHandler` keyed by the navigation action's
    ///      identity so it survives across the async hop.
    ///   2. Build the cross-platform `ShouldStartLoadRequest` payload
    ///      (URL, navigation-type mapping, iOS-only fields).
    ///   3. Hand the payload to the host's `dispatchShouldStart` helper
    ///      which resolves the Promise and dequeues the handler.
    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let owner = owner, owner.onShouldStartLoadWithRequest != nil else {
        decisionHandler(.allow)
        return
      }
      let key = ObjectIdentifier(navigationAction)
      pendingDecisions[key] = decisionHandler
      let payload = HybridNitroWebView.shouldStartPayload(for: navigationAction)
      owner.dispatchShouldStart(payload) { [weak self] allow in
        guard let self = self else { return }
        let handler = self.pendingDecisions.removeValue(forKey: key)
        handler?(allow ? .allow : .cancel)
      }
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

    /// File-download detection: when the response should be treated as a
    /// download (per `HybridNitroWebView.shouldTreatAsDownload`), cancel
    /// the navigation and emit `onFileDownload` with metadata distilled
    /// from the HTTP response. The WebView remains on the previous page —
    /// JS decides what to do with the URL.
    ///
    /// The "treat as download" predicate is centralized in
    /// `HybridNitroWebView.shouldTreatAsDownload(response:canShowMIMEType:)`
    /// so it can be exercised by `swift test` on the macOS host without
    /// instantiating a real `WKWebView`. The two inputs (the
    /// `HTTPURLResponse` and the `canShowMIMEType` flag) are the same ones
    /// the production delegate observes.
    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationResponse: WKNavigationResponse,
      decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
      let httpResponse = navigationResponse.response as? HTTPURLResponse
      let isDownload = HybridNitroWebView.shouldTreatAsDownload(
        response: httpResponse,
        canShowMIMEType: navigationResponse.canShowMIMEType
      )
      if !isDownload {
        decisionHandler(.allow)
        return
      }
      owner?.emitFileDownload(for: navigationResponse.response)
      decisionHandler(.cancel)
    }
  }

  /// Decide whether a navigation response should be treated as a file
  /// download.
  ///
  /// Inputs:
  ///   * `response`         — the `HTTPURLResponse` for the navigation
  ///                          (may be `nil` when the response is not HTTP;
  ///                          in that case only `canShowMIMEType` decides).
  ///   * `canShowMIMEType`  — the WKWebView's own assessment of whether it
  ///                          can render the response's MIME type inline
  ///                          (mirrors `WKNavigationResponse.canShowMIMEType`).
  ///
  /// Contract (`true` ⇔ "treat as download"):
  ///   1. The response carries `Content-Disposition` whose value begins
  ///      with `"attachment"` (case-insensitive, leading whitespace
  ///      tolerated) — RFC 6266 §4.2 says `attachment` is the explicit
  ///      server signal to download rather than render. This rule wins
  ///      even when `canShowMIMEType` is true (e.g. a server forces a
  ///      `.pdf` to download instead of rendering).
  ///   2. OR `canShowMIMEType` is `false` — WebKit cannot render the
  ///      response, so the only reasonable UX is to treat it as a
  ///      download.
  ///   3. Otherwise (`Content-Disposition` absent or starts with `"inline"`
  ///      AND `canShowMIMEType == true`) — let the WebView render the
  ///      response inline.
  ///
  /// Why a standalone static helper:
  ///   * Same reason `parseContentDispositionFilename` is standalone —
  ///     the predicate can then be exercised by host-side XCTest without
  ///     dragging in Nitro/WKWebView bridge symbols (see the
  ///     `AttachmentDetectionProbe` in
  ///     `iosTests/Tests/HybridNitroWebViewAttachmentDetectionTests/`).
  ///   * Keeps the decision out of the `WKNavigationDelegate` callback
  ///     so future contributors can extend it (e.g. honor a future
  ///     `download` attribute hint) in one place.
  static func shouldTreatAsDownload(
    response: HTTPURLResponse?,
    canShowMIMEType: Bool
  ) -> Bool {
    // Rule 1: explicit `Content-Disposition: attachment` always wins.
    if let disposition = response?
      .value(forHTTPHeaderField: "Content-Disposition") {
      let trimmed = disposition
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
      if trimmed.hasPrefix("attachment") { return true }
    }
    // Rule 2: WebKit can't render the response inline.
    if !canShowMIMEType { return true }
    // Rule 3: render inline.
    return false
  }

  /// Map the `cacheEnabled` prop to the `URLRequest.cachePolicy` used for
  /// the next `source`-triggered navigation. `false` bypasses the local
  /// cache (`.reloadIgnoringLocalCacheData`); `true` or `nil` (unset) uses
  /// the protocol default (`.useProtocolCachePolicy`). Standalone static so
  /// it can be exercised by `swift test` on the macOS host without a real
  /// `WKWebView`.
  static func cachePolicy(forCacheEnabled cacheEnabled: Bool?)
    -> URLRequest.CachePolicy {
    return cacheEnabled == false
      ? .reloadIgnoringLocalCacheData
      : .useProtocolCachePolicy
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

  fileprivate func emitFileDownload(for response: URLResponse) {
    let download = Self.fileDownload(from: response)
    onFileDownload?(FileDownloadEvent(nativeEvent: download))
  }

  /// Invoke the JS-side `onShouldStartLoadWithRequest` hook (if installed),
  /// then forward the resolved boolean back to the WebKit decision handler
  /// via the supplied `complete` closure. When the hook is not installed
  /// this short-circuits to `complete(true)` so the navigation proceeds —
  /// matching the "allow-all" default documented on the prop.
  fileprivate func dispatchShouldStart(
    _ payload: ShouldStartLoadRequest,
    complete: @escaping (Bool) -> Void
  ) {
    guard let hook = onShouldStartLoadWithRequest else {
      complete(true)
      return
    }
    let promise = hook(payload)
    promise
      .then { allow in complete(allow) }
      .catch { _ in complete(true) }
  }

  /// Build the cross-platform navigation payload from a WKNavigationAction.
  ///
  ///   * `url` — `navigationAction.request.url?.absoluteString` (empty when
  ///     the request has no URL, defensive — WebKit always sets one in
  ///     practice).
  ///   * `navigationType` — mapped from `WKNavigationType` via
  ///     `Self.navigationType(from:)`.
  ///   * `mainDocumentURL` — `request.mainDocumentURL?.absoluteString`.
  ///   * `isTopFrame` — `targetFrame?.isMainFrame` (the navigation targets
  ///     the WebView's main frame).
  ///   * `hasTargetFrame` — `targetFrame != nil` (false for `target=_blank`
  ///     and other new-window navigations).
  static func shouldStartPayload(
    for navigationAction: WKNavigationAction
  ) -> ShouldStartLoadRequest {
    let request = navigationAction.request
    let url = request.url?.absoluteString ?? ""
    let mainDoc = request.mainDocumentURL?.absoluteString
    let target = navigationAction.targetFrame
    return ShouldStartLoadRequest(
      url: url,
      navigationType: navigationType(from: navigationAction.navigationType),
      mainDocumentURL: mainDoc,
      isTopFrame: target?.isMainFrame,
      hasTargetFrame: target != nil
    )
  }

  /// Map a `WKNavigationType` value to the cross-platform
  /// `WebViewNavigationType` string. Mirrors react-native-webview so RNW
  /// call-sites continue to compile unchanged. Unknown / future cases
  /// fall through to `.other` — RNW does the same.
  static func navigationType(
    from raw: WKNavigationType
  ) -> WebViewNavigationType {
    switch raw {
    case .linkActivated: return .click
    case .formSubmitted: return .formsubmit
    case .backForward: return .backforward
    case .reload: return .reload
    case .formResubmitted: return .formresubmit
    case .other: return .other
    @unknown default: return .other
    }
  }

  /// Translate a URLResponse into the cross-platform `FileDownload`
  /// payload. When the response is an `HTTPURLResponse` carrying a
  /// `Content-Disposition` header, the parsed filename is preferred over
  /// `URLResponse.suggestedFilename` because iOS' built-in derivation is
  /// known to drop RFC 5987 `filename*` segments on some OS versions —
  /// see `parseContentDispositionFilename(_:)`. `userAgent` is left nil
  /// because WKWebView does not expose the request UA in the response
  /// delegate.
  static func fileDownload(from response: URLResponse) -> FileDownload {
    let urlString = response.url?.absoluteString ?? ""
    let mime = response.mimeType
    let length = response.expectedContentLength
    let contentLength: Double? = length == NSURLSessionTransferSizeUnknown
      ? nil
      : Double(length)

    let contentDisposition = (response as? HTTPURLResponse)?
      .value(forHTTPHeaderField: "Content-Disposition")
    let parsed = parseContentDispositionFilename(contentDisposition)
    let fileName = parsed ?? response.suggestedFilename

    return FileDownload(
      url: urlString,
      mimeType: mime,
      fileName: fileName,
      contentLength: contentLength,
      userAgent: nil
    )
  }

  /// Parse the decoded filename from a raw `Content-Disposition` header
  /// value. Prefers the RFC 5987 `filename*=UTF-8'…` encoded form
  /// (percent-decoded) and falls back to the plain `filename=` value
  /// (with URL-decoding for unquoted percent-encoded values and
  /// backslash-escape resolution for quoted values). Returns `nil` when
  /// no filename is present.
  ///
  /// The actual grammar is implemented in
  /// `NitroWebViewContentDispositionParser` so it can be exercised from
  /// `swift test` on the macOS host without dragging the Nitro/WKWebView
  /// dependency in. This entry point is the one the production hybrid
  /// instance and its callers use.
  static func parseContentDispositionFilename(_ header: String?) -> String? {
    return NitroWebViewContentDispositionParser.parseFilename(from: header)
  }

  // MARK: - Cookie helpers

  static func host(forUrl raw: String) -> String? {
    guard let url = URL(string: raw), let host = url.host else { return nil }
    return host.lowercased()
  }

  /// Match the cookie's domain against the URL's host the same way browsers
  /// scope cookies: exact host match, or domain suffix match when the
  /// cookie domain is a parent (with or without a leading dot).
  static func cookieMatchesHost(_ cookie: HTTPCookie, host: String?) -> Bool {
    guard let host = host else { return true }
    let domain = cookie.domain.lowercased()
    if domain == host { return true }
    if domain.hasPrefix(".") {
      let bare = String(domain.dropFirst())
      return host == bare || host.hasSuffix(domain)
    }
    return host.hasSuffix("." + domain)
  }

  static func toCookie(_ httpCookie: HTTPCookie) -> Cookie {
    let expires: Double? = httpCookie.expiresDate.map {
      $0.timeIntervalSince1970 * 1000
    }
    return Cookie(
      name: httpCookie.name,
      value: httpCookie.value,
      domain: httpCookie.domain,
      path: httpCookie.path,
      expires: expires,
      secure: httpCookie.isSecure,
      httpOnly: httpCookie.isHTTPOnly
    )
  }

  static func toHTTPCookie(_ cookie: Cookie, fallbackUrl: String) -> HTTPCookie? {
    let urlObj = URL(string: fallbackUrl)
    let domain = cookie.domain ?? urlObj?.host ?? ""
    let path = cookie.path ?? "/"
    var props: [HTTPCookiePropertyKey: Any] = [
      .name: cookie.name,
      .value: cookie.value,
      .domain: domain,
      .path: path,
    ]
    if let exp = cookie.expires {
      props[.expires] = Date(timeIntervalSince1970: exp / 1000.0)
    }
    if cookie.secure == true {
      props[.secure] = "TRUE"
    }
    return HTTPCookie(properties: props)
  }
}

// MARK: - WKUIDelegate (file-upload binding)

/// Empty `WKUIDelegate` whose sole purpose is to be installed on the
/// `WKWebView` so WebKit's internal `_uiDelegate != nil` gate flips and
/// the built-in `<input type="file">` chooser (camera / photo library /
/// document picker) becomes available. No optional `WKUIDelegate` method
/// is implemented — the HTML `accept`, `multiple`, and `capture`
/// attributes are honored by WebKit directly. No public TS API is
/// exposed for this feature (react-native-webview parity).
///
/// Lives as a separate `NSObject` subclass (instead of letting
/// `HybridNitroWebView` adopt `WKUIDelegate` itself) because
/// `WKUIDelegate` refines `NSObjectProtocol`, and Swift does not allow
/// adding `NSObjectProtocol` conformance to a class that does not already
/// inherit from `NSObject`. `HybridNitroWebView` inherits from
/// `HybridNitroWebViewSpec`, which is a plain Swift base class.
///
/// IMPORTANT — DO NOT IMPLEMENT
/// `webView(_:runOpenPanelWith:initiatedByFrame:completionHandler:)`:
/// that selector is a **macOS-only** `WKUIDelegate` method. It does not
/// exist on iOS WKWebView and adding it would either fail to compile
/// under the iOS slice or, if force-shimmed via `@objc`, would be
/// silently ignored by iOS WebKit while masking the system file picker.
/// The matching runtime introspection in
/// `HybridNitroWebViewFileUploadIntrospectionTests` enforces this: the
/// selector `runOpenPanelWith:initiatedByFrame:completionHandler:` must
/// NOT be implemented on this class.
fileprivate final class UIDelegate: NSObject, WKUIDelegate {}
