import Foundation
import NitroModules
import WebKit
import UIKit

final class HybridNitroWebView:
  HybridNitroWebViewSpec,
  NitroWebViewMessageDispatcher,
  NitroWebViewNavStateDispatcher
{
  let view = UIView()
  private var webView: WKWebView?
  private var isDropped = false
  private var mountedSettings: NitroWebViewSessionSettings?
  private var lastConfigurationError: String?
  private var pendingEvaluations: [UUID: Promise<String>] = [:]

  private var sessionSettings: NitroWebViewSessionSettings {
    NitroWebViewSessionSettings(incognito: incognito ?? false,
      sharedCookies: sharedCookiesEnabled ?? false, javaScript: javaScriptEnabled ?? true)
  }

  private static func stateError(_ message: String = "WebView is not mounted. Remount with a new key.") -> NSError {
    NSError(domain: "NitroWebViewState", code: -1,
      userInfo: [NSLocalizedDescriptionKey: message])
  }

  private let sourceHandler = NitroWebViewSourceHandler()
  private let evaluator = NitroWebViewEvaluateJavaScriptHandler()
  private let messageHandler = NitroWebViewMessageHandler()
  private let historyHandler = NitroWebViewHistoryHandler()
  private let navigationDelegate: NavigationDelegate
  private let uiDelegate: UIDelegate
  private let scrollDelegate: ScrollDelegate
  private var currentInjectedUserScript: WKUserScript?

  var onLoadStart: ((WebViewLoadEvent) -> Void)?
  private var progressObservation: NSKeyValueObservation?
  var onLoad: ((WebViewLoadEvent) -> Void)?
  var onLoadProgress: ((WebViewLoadProgressEvent) -> Void)?
  var onLoadEnd: ((WebViewLoadEvent) -> Void)?
  var onNavigationStateChange: ((WebViewNavigationState) -> Void)?
  var onMessage: ((WebViewMessageEvent) -> Void)?
  var onError: ((NitroWebViewErrorEvent) -> Void)?
  var onFileDownload: ((FileDownloadEvent) -> Void)?
  var onHttpError: ((NitroWebViewHttpErrorEvent) -> Void)?
  var onRenderProcessGone: ((NitroWebViewRenderProcessGoneEvent) -> Void)?
  var onScroll: ((NitroWebViewScrollEvent) -> Void)?
  /// JS-side navigation-interception hook. When non-nil, every main-frame
  /// navigation surfaces a `ShouldStartLoadRequest` payload to JS via
  /// `dispatchShouldStart`; the resolver's boolean result decides whether
  /// the platform commits to the navigation (`true` → `.allow`, `false` →
  /// `.cancel`). No timeout is applied — the stashed `decisionHandler`
  /// stays parked until the resolver runs, loading stops, the view is
  /// dropped or its content process terminates.
  var onShouldStartLoadWithRequest: ((ShouldStartLoadRequest, ShouldStartLoadDecision) -> Void)?

  /// Opt-in flag for sub-frame navigation interception. On iOS this has no
  /// effect: `decidePolicyFor` already parks its decision handler
  /// asynchronously per navigation action, so sub-frame navigations already
  /// reach `onShouldStartLoadWithRequest` regardless. The property is stored
  /// only to satisfy the shared spec (Android reads it).
  var interceptSubframeNavigation: Bool?

  /// Fired when the page requests a new window (`window.open` /
  /// `target=_blank`). The WebView never creates a second `WKWebView`; JS
  /// decides what to do with the URL. See `emitOpenWindow`.
  var onOpenWindow: ((OpenWindowEvent) -> Void)?

  override init() {
    self.navigationDelegate = NavigationDelegate()
    self.uiDelegate = UIDelegate()
    self.scrollDelegate = ScrollDelegate()
    super.init()
  }

  // Nitro keeps `view` for the lifetime of the component. Build its child
  // only after the first complete prop batch, before loading any source.
  func afterUpdate() {
    guard !isDropped else { return }
    if let message = sessionSettings.error(comparedTo: mountedSettings) {
      sourceHandler.cancelPendingLoad()
      if lastConfigurationError != message {
        lastConfigurationError = message
        emitError(NSError(domain: "NitroWebViewConfiguration", code: -1,
          userInfo: [NSLocalizedDescriptionKey: message]), fallbackUrl: nil)
      }
      return
    }
    lastConfigurationError = nil
    if webView == nil { createWebView() }
    if sourceHandler.consumePendingLoad() {
      applySource(source)
    }
  }

  private func createWebView() {
    let settings = sessionSettings
    mountedSettings = settings
    let configuration = makeWebViewConfiguration(settings: settings)
    let webView = mountWebView(configuration: configuration)
    applyLiveViewProperties(to: webView)
    observeLoadProgress(on: webView)
    installWebViewDelegates(on: webView)
    if settings.javaScript {
      installJavaScriptBridge(in: configuration)
    }
    prepareCookies(in: configuration, sharedCookies: settings.sharedCookies)
  }

  private func makeWebViewConfiguration(settings: NitroWebViewSessionSettings) -> WKWebViewConfiguration {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = settings.incognito ? .nonPersistent() : .default()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = settings.javaScript
    configuration.allowsInlineMediaPlayback = allowsInlineMediaPlayback ?? false
    configuration.mediaTypesRequiringUserActionForPlayback =
      (mediaPlaybackRequiresUserAction ?? true) ? .all : []
    return configuration
  }

  private func mountWebView(configuration: WKWebViewConfiguration) -> NitroDialogWebView {
    let webView = NitroDialogWebView(frame: view.bounds, configuration: configuration)
    self.webView = webView
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(webView)
    return webView
  }

  private func applyLiveViewProperties(to webView: WKWebView) {
    webView.customUserAgent = (userAgent?.isEmpty ?? true) ? nil : userAgent
    webView.scrollView.isScrollEnabled = scrollEnabled ?? true
    webView.scrollView.bounces = bounces ?? true
    webView.allowsBackForwardNavigationGestures = allowsBackForwardNavigationGestures ?? false
  }

  private func observeLoadProgress(on webView: WKWebView) {
    progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] observedWebView, _ in
      guard let self = self, self.navigationDelegate.loading else { return }
      let state = self.snapshotNavigationState()
      self.onLoadProgress?(WebViewLoadProgressEvent(nativeEvent: WebViewLoadProgressNativeEvent(
        progress: min(1, max(0, observedWebView.estimatedProgress)),
        url: state.url, title: state.title, loading: state.loading,
        canGoBack: state.canGoBack, canGoForward: state.canGoForward
      )))
    }
  }

  private func installWebViewDelegates(on webView: NitroDialogWebView) {
    navigationDelegate.owner = self
    webView.navigationDelegate = navigationDelegate
    // Claim the scrollView delegate to surface `onScroll`. WKWebView does
    // NOT rely on its scrollView delegate internally — momentum, bounce, and
    // zoom are driven by gesture recognizers, not this delegate — so claiming
    // it is safe (react-native-webview does exactly this in production).
    scrollDelegate.owner = self
    webView.scrollView.delegate = scrollDelegate
    // Binding any `WKUIDelegate` is what enables WebKit's built-in
    // `<input type="file">` chooser (camera / photo library / document
    // picker). The delegate itself does not need to implement any picker
    // APIs — setting any delegate flips WebKit's internal
    // `_uiDelegate != nil` gate that gates the picker presentation. The
    // HTML `accept`, `multiple`, and `capture` attributes are honored by
    // WebKit directly. No public TS API is exposed — behavior is fully
    // driven by the HTML input attributes (react-native-webview parity).
    webView.uiDelegate = uiDelegate
    uiDelegate.owner = self
    webView.onDetach = { [weak uiDelegate] in
      uiDelegate?.dialogs.cancel()
    }
  }

  private func installJavaScriptBridge(in configuration: WKWebViewConfiguration) {
    messageHandler.dispatcher = self
    historyHandler.dispatcher = self
    let controller = configuration.userContentController
    controller.add(messageHandler, name: NitroWebViewMessageHandler.scriptMessageHandlerName)
    controller.add(historyHandler, name: NitroWebViewHistoryHandler.scriptMessageHandlerName)
    reinstallUserScripts()
  }

  private func prepareCookies(in configuration: WKWebViewConfiguration, sharedCookies: Bool) {
    guard sharedCookies else {
      sourceHandler.cookiesReady = true
      return
    }
    let group = DispatchGroup()
    let store = configuration.websiteDataStore.httpCookieStore
    for cookie in HTTPCookieStorage.shared.cookies ?? [] {
      if let expires = cookie.expiresDate, expires <= Date() { continue }
      group.enter()
      store.setCookie(cookie) { group.leave() }
    }
    group.notify(queue: .main) { [weak self] in
      guard let self, !self.isDropped else { return }
      self.sourceHandler.cookiesReady = true
      self.afterUpdate()
    }
  }

  deinit {
    progressObservation?.invalidate()
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

  /// SPA history-API shim. Ships the same body `buildHistoryShimScript('ios')`
  /// produces in `bridgeScript.ts` (which is the source of truth exercised by
  /// the node:test suite). Hooks pushState/replaceState/popstate and posts the
  /// nav-type to the dedicated `ReactNativeHistoryShim` sink. Idempotent via
  /// `window.__nitroHistoryShimInstalled`.
  private static let historyShimScript: String = """
  ;(function (history) {
    if (window.__nitroHistoryShimInstalled) { return; }
    window.__nitroHistoryShimInstalled = true;
    function notify(__type) {
      window.setTimeout(function () {
        var __wk = window.webkit;
        if (__wk && __wk.messageHandlers && __wk.messageHandlers.ReactNativeHistoryShim) {
          __wk.messageHandlers.ReactNativeHistoryShim.postMessage(__type);
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
  """

  func onDropView() {
    guard !isDropped else { return }
    isDropped = true
    clearEventCallbacks()
    navigationDelegate.cancelDownloads()
    cancelPendingCallbacks()
    rejectPendingEvaluations()
    if let webView { detachWebView(webView) }
    clearDelegateOwnersAndDispatchers()
  }

  private func clearEventCallbacks() {
    onLoadStart = nil
    onLoad = nil
    onLoadEnd = nil
    onLoadProgress = nil
    onNavigationStateChange = nil
    onMessage = nil
    onError = nil
    onFileDownload = nil
    onHttpError = nil
    onRenderProcessGone = nil
    onScroll = nil
    onShouldStartLoadWithRequest = nil
    onOpenWindow = nil
  }

  private func cancelPendingCallbacks() {
    navigationDelegate.cancelPendingDecisions()
    uiDelegate.dialogs.cancel()
    progressObservation?.invalidate()
    progressObservation = nil
  }

  private func rejectPendingEvaluations() {
    let evaluations = Array(pendingEvaluations.values)
    pendingEvaluations.removeAll()
    for promise in evaluations { promise.reject(withError: Self.stateError()) }
  }

  private func detachWebView(_ webView: WKWebView) {
    webView.stopLoading()
    webView.removeFromSuperview()
    self.webView = nil
    let controller = webView.configuration.userContentController
    controller.removeScriptMessageHandler(
      forName: NitroWebViewMessageHandler.scriptMessageHandlerName
    )
    controller.removeScriptMessageHandler(
      forName: NitroWebViewHistoryHandler.scriptMessageHandlerName
    )
    controller.removeAllUserScripts()
    webView.navigationDelegate = nil
    webView.uiDelegate = nil
    webView.scrollView.delegate = nil
  }

  private func clearDelegateOwnersAndDispatchers() {
    navigationDelegate.owner = nil
    scrollDelegate.owner = nil
    uiDelegate.owner = nil
    messageHandler.dispatcher = nil
    historyHandler.dispatcher = nil
  }

  var source: WebViewSource = .first(UriSource(uri: "about:blank", headers: nil, method: nil, body: nil)) {
    didSet { sourceHandler.sourceNeedsLoading = true }
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
      webView?.customUserAgent = (value?.isEmpty ?? true) ? nil : value
    }
  }

  // MARK: - Settings props

  // Applied live in didSet; nil restores the documented default.
  var scrollEnabled: Bool? {
    didSet { webView?.scrollView.isScrollEnabled = scrollEnabled ?? true }
  }
  var bounces: Bool? {
    didSet { webView?.scrollView.bounces = bounces ?? true }
  }
  var allowsBackForwardNavigationGestures: Bool? {
    didSet {
      webView?.allowsBackForwardNavigationGestures =
        allowsBackForwardNavigationGestures ?? false
    }
  }

  /// Consumed in `applySource` when building the next `URLRequest`
  /// (WKWebView has no global cache switch). Stored here; see
  /// `Self.cachePolicy(forCacheEnabled:)`.
  var cacheEnabled: Bool?

  // Media configuration is captured at the first afterUpdate. Remount to
  // change it; recreating a live WKWebView would discard page/history state.
  var mediaPlaybackRequiresUserAction: Bool?
  var allowsInlineMediaPlayback: Bool?
  // Session settings are captured before the first source. Remount to change them.
  var incognito: Bool?
  var sharedCookiesEnabled: Bool?
  var domStorageEnabled: Bool?
  var scalesPageToFit: Bool?
  var thirdPartyCookiesEnabled: Bool?
  // Android origin policy; WKWebView keeps its own per-origin system prompts.
  var mediaCapturePermissionOrigins: [String]?
  var geolocationPermissionOrigins: [String]?
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

  func goBack() throws {
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped else { return }
      self.webView?.goBack()
    }
  }

  func goForward() throws {
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped else { return }
      self.webView?.goForward()
    }
  }

  func reload() throws {
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped else { return }
      self.webView?.reload()
    }
  }

  func stopLoading() throws {
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped else { return }
      self.sourceHandler.cancelPendingLoad()
      self.navigationDelegate.cancelPendingDecisions()
      self.webView?.stopLoading()
    }
  }

  /// Clear the cache-shaped record types (`Self.cacheDataTypes()`) from the
  /// view's data store.
  func clearCache() throws -> Promise<Void> {
    let promise = Promise<Void>()
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, let store = self.webView?.configuration.websiteDataStore else {
      promise.reject(withError: Self.stateError())
        return
    }
    store.removeData(
      ofTypes: Self.cacheDataTypes(),
      modifiedSince: .distantPast
    ) {
      promise.resolve(withResult: ())
    }
    }
    return promise
  }

  /// Documented no-op for mounted views: `WKWebView.backForwardList` has no
  /// public prune/clear API. Unmounted instances reject like other methods.
  func clearHistory() throws -> Promise<Void> {
    let promise = Promise<Void>()
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, self.webView != nil else {
        promise.reject(withError: Self.stateError())
        return
      }
    promise.resolve(withResult: ())
    }
    return promise
  }

  func requestFocus() throws -> Promise<Void> {
    let promise = Promise<Void>()
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, let webView = self.webView else {
        promise.reject(withError: Self.stateError())
        return
      }
      // The responder's Bool does not indicate an evaluation failure.
      _ = webView.becomeFirstResponder()
      promise.resolve(withResult: ())
    }
    return promise
  }

  /// Cache-only website-data record types for `clearCache()`. Standalone
  /// static helper so host-side XCTest can pin the exact `Set<String>`
  /// (`{disk, memory}`) without a live `WKWebView` — same rationale as
  /// `shouldTreatAsDownload`. Deliberately excludes cookies/localStorage.
  static func cacheDataTypes() -> Set<String> {
    [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
  }

  func evaluateJavaScript(code: String) throws -> Promise<String> {
    let promise = Promise<String>()
    DispatchQueue.main.async { [weak self] in
      guard let self, !self.isDropped, let webView = self.webView else {
        promise.reject(withError: Self.stateError())
        return
      }
      guard self.mountedSettings?.javaScript == true else {
        promise.reject(withError: Self.stateError("JavaScript is disabled for this WebView."))
        return
      }
      let id = UUID()
      self.pendingEvaluations[id] = promise
      self.evaluator.evaluate(code: code, in: webView,
        resolve: { [weak self] result in
          self?.pendingEvaluations.removeValue(forKey: id)?.resolve(withResult: result)
        },
        reject: { [weak self] error in
          self?.pendingEvaluations.removeValue(forKey: id)?.reject(withError: error)
        })
    }
    return promise
  }

  func injectJavaScript(code: String) throws {
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, self.mountedSettings?.javaScript == true else { return }
      self.webView?.evaluateJavaScript(code, completionHandler: nil)
    }
  }

  func postMessage(data: String) throws {
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, self.mountedSettings?.javaScript == true else { return }
      self.webView?.evaluateJavaScript(NitroWebViewPostMessage.buildStatement(data), completionHandler: nil)
    }
  }

  // MARK: - Cookie API

  /// Fetch cookies from
  /// `webView?.configuration.websiteDataStore.httpCookieStore.getAllCookies`
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
    guard NitroWebViewCookieFilter.validCookieURL(url) != nil else {
      promise.reject(withError: Self.stateError("Cookie URL must be an absolute HTTP(S) URL."))
      return promise
    }
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, let store = self.webView?.configuration.websiteDataStore.httpCookieStore else {
      promise.reject(withError: Self.stateError())
        return
    }
    let scope = NitroWebViewCookieFilter.urlScope(forUrl: url)
    store.getAllCookies { cookies in
      let filtered: [Cookie] = cookies.compactMap { httpCookie in
        guard NitroWebViewCookieFilter.cookieMatches(httpCookie, scope: scope)
        else { return nil }
        return Self.toCookie(httpCookie)
      }
      promise.resolve(withResult: filtered)
    }
    }
    return promise
  }

  func setCookie(url: String, cookie: Cookie) throws -> Promise<Void> {
    let promise = Promise<Void>()
    guard NitroWebViewCookieFilter.validCookieURL(url) != nil else {
      promise.reject(withError: Self.stateError("Cookie URL must be an absolute HTTP(S) URL."))
      return promise
    }
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, let store = self.webView?.configuration.websiteDataStore.httpCookieStore else {
      promise.reject(withError: Self.stateError())
        return
    }
    guard let httpCookie = Self.toHTTPCookie(cookie, fallbackUrl: url) else {
      promise.reject(withError: NSError(
        domain: "NitroWebView",
        code: -1,
        userInfo: [NSLocalizedDescriptionKey:
          "Could not construct HTTPCookie from supplied fields"]
      ))
        return
    }
    store.setCookie(httpCookie) {
      promise.resolve(withResult: ())
    }
    }
    return promise
  }

  /// Drop every cookie stored in this view's data store via the
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
    NitroWebViewMainThread.run { [weak self] in
      guard let self, !self.isDropped, let store = self.webView?.configuration.websiteDataStore else {
      promise.reject(withError: Self.stateError())
        return
    }
    store.removeData(
      ofTypes: [WKWebsiteDataTypeCookies],
      modifiedSince: .distantPast
    ) {
      promise.resolve(withResult: ())
    }
    }
    return promise
  }

  private func applySource(_ source: WebViewSource) {
    guard let webView else { return }
    switch source {
    case .first(let uri):
      do {
        let request = try NitroWebViewSourceHandler.makeRequest(
          uri: uri.uri, method: uri.method?.stringValue, body: uri.body,
          headers: Self.mergeHeaders(defaults: defaultHeaders, perRequest: uri.headers),
          cachePolicy: Self.cachePolicy(forCacheEnabled: cacheEnabled)
        )
        webView.load(request)
      } catch {
        emitError(error as NSError, fallbackUrl: uri.uri)
      }
    case .second(let html):
      let payload = NitroLoadHtmlPayload(
        html: html.html,
        baseUrlString: html.baseUrl
      )
      sourceHandler.applyHtmlPayload(payload, to: webView)
    }
  }

  static func mergeHeaders(
    defaults: [String: String]?, perRequest: [String: String]?
  ) throws -> [String: String] {
    try NitroWebViewSourceHandler.mergeHeaders(defaults: defaults, perRequest: perRequest)
  }

  /// Rebuild the `WKUserContentController`'s user-script list in a fixed
  /// order whenever `injectedJavaScript` or
  /// `injectedJavaScriptBeforeContentLoaded` changes.
  ///
  /// `WKUserScript`s run in registration order within the same injection
  /// time, so the ordering here is the contract:
  ///   1. bridge bootstrap  — `.atDocumentStart`, all frames.
  ///   2. history shim      — `.atDocumentStart`, main frame only. Wraps
  ///      `history.pushState`/`replaceState` before any consumer script
  ///      (including `injectedJavaScriptBeforeContentLoaded`) can observe
  ///      or interfere with the History API.
  ///   3. before-content    — `.atDocumentStart`, main frame only. Runs
  ///      after the bridge and history shim (so pages can still call
  ///      `postMessage`) but before any page script.
  ///   4. injected (after)  — `.atDocumentEnd`, main frame only.
  ///
  /// `removeAllUserScripts()` + re-add on every change keeps the list
  /// idempotent regardless of the order the props are set at mount. The
  /// history shim is re-installed unconditionally here — without it, it
  /// would be silently lost whenever `injectedJavaScript` or
  /// `injectedJavaScriptBeforeContentLoaded` changes (both drive this
  /// method via `didSet`).
  private func reinstallUserScripts() {
    guard mountedSettings?.javaScript == true,
      let controller = webView?.configuration.userContentController else { return }
    controller.removeAllUserScripts()

    // 1. bridge bootstrap — always present.
    controller.addUserScript(WKUserScript(
      source: Self.bridgeBootstrapScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: false
    ))

    // 2. history shim — always present, main frame only. Must run before
    // any consumer-provided script gets a chance to touch history.*.
    controller.addUserScript(WKUserScript(
      source: Self.historyShimScript,
      injectionTime: .atDocumentStart,
      forMainFrameOnly: true
    ))

    // 3. before-content — atDocumentStart, main frame only.
    if let before = injectedJavaScriptBeforeContentLoaded, !before.isEmpty {
      controller.addUserScript(WKUserScript(
        source: before,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: true
      ))
    }

    // 4. after-load — atDocumentEnd, main frame only.
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

  /// A SPA route change (pushState/replaceState/popstate) fired. There is no
  /// load lifecycle to report — just emit a fresh nav-state snapshot so JS
  /// sees the new URL via `onNavigationStateChange`. Deliberately routes to
  /// nav-state, NOT `onMessage` (different channel) and NOT
  /// `onShouldStartLoadWithRequest` (a pushState already happened and cannot
  /// be vetoed).
  func dispatchHistoryNav(navType: String) {
    emitNavigationState()
  }

  fileprivate func emitOpenWindow(targetUrl: String) {
    onOpenWindow?(
      OpenWindowEvent(nativeEvent: OpenWindowNativeEvent(url: targetUrl))
    )
  }

  fileprivate final class NavigationDelegate: NSObject, WKNavigationDelegate {
    weak var owner: HybridNitroWebView?
    private var activeNavigation: WKNavigation?
    fileprivate var loading = false
    private var failed = false

    private func finish(_ navigation: WKNavigation?, error: NSError? = nil) {
      guard loading, navigation === activeNavigation else { return }
      loading = false
      if let error = error {
        failed = true
        owner?.emitError(error, fallbackUrl: owner?.webView?.url?.absoluteString)
      }
      owner?.emitLoadEnd(success: !failed)
      owner?.emitNavigationState()
    }

    private let pendingDecisions = NitroWebViewNavigationDecisions()

    func cancelPendingDecisions() {
      pendingDecisions.cancelAll()
    }

    fileprivate struct PendingDownload {
      let download: WKDownload
      var destination: URL?
      var response: URLResponse?
    }

    fileprivate var pendingDownloads: [ObjectIdentifier: PendingDownload] = [:]

    func cancelDownloads() {
      let downloads = Array(pendingDownloads.values)
      pendingDownloads.removeAll()
      for entry in downloads {
        entry.download.delegate = nil
        let destination = entry.destination
        // WebKit can still write until this completion runs.
        entry.download.cancel { _ in
          guard let destination else { return }
          do {
            try NitroWebViewDownloadFiles.discard(destination)
          } catch {
            NSLog("NitroWebViewDownload: cannot remove cancelled download: %@", error.localizedDescription)
          }
        }
      }
    }

    fileprivate func discardDownload(_ destination: URL?) {
      guard let destination else { return }
      do {
        try NitroWebViewDownloadFiles.discard(destination)
      } catch {
        if let owner, !owner.isDropped {
          owner.emitDownloadError(error, url: destination.absoluteString)
        } else {
          NSLog("NitroWebViewDownload: cannot remove partial download: %@", error.localizedDescription)
        }
      }
    }

    private func retainDownload(_ download: WKDownload) {
      guard let owner, !owner.isDropped else {
        download.cancel(nil)
        return
      }
      pendingDownloads[ObjectIdentifier(download)] = PendingDownload(download: download)
      download.delegate = self
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
      activeNavigation = navigation
      loading = true
      failed = false
      owner?.emitLoadStart()
      owner?.emitNavigationState()
    }

    /// Navigation-interception entry point. When the host has no
    /// `onShouldStartLoadWithRequest` callback installed, every navigation
    /// is allowed without JS round-trip. When the callback is installed:
    ///   1. Park `decisionHandler` under a fresh ID across the async hop.
    ///   2. Build the cross-platform `ShouldStartLoadRequest` payload
    ///      (URL, navigation-type mapping, iOS-only fields).
    ///   3. Hand the payload to the host's `dispatchShouldStart` helper
    ///      which passes a resolver that dequeues the handler.
    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      guard let owner = owner, !owner.isDropped else {
        decisionHandler(.cancel)
        return
      }
      // New-window handling must run BEFORE the should-start parking below.
      // A `target=_blank` / `window.open` with no target frame that is
      // cancelled here never reaches `createWebViewWith`, so onOpenWindow has
      // to fire from this spot too (react-native-webview parity). When
      // onOpenWindow is unset, fall through to the normal path so the default
      // in-place load still happens.
      if owner.onOpenWindow != nil,
         navigationAction.targetFrame == nil {
        let url = navigationAction.request.url?.absoluteString ?? ""
        owner.emitOpenWindow(targetUrl: url)
        decisionHandler(.cancel)
        return
      }
      let allowPolicy: WKNavigationActionPolicy =
        navigationAction.request.url?.scheme?.lowercased() == "blob" && navigationAction.shouldPerformDownload
          ? .download : .allow
      guard owner.onShouldStartLoadWithRequest != nil else {
        decisionHandler(allowPolicy)
        return
      }
      let id = pendingDecisions.park { allow in
        decisionHandler(allow ? allowPolicy : .cancel)
      }
      let payload = HybridNitroWebView.shouldStartPayload(for: navigationAction)
      owner.dispatchShouldStart(payload) { [weak pendingDecisions] allow in
        pendingDecisions?.resolve(id, allow: allow)
      }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      finish(navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
      finish(navigation, error: error as NSError)
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      finish(navigation, error: error as NSError)
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
      // Blob downloads take the native `WKDownloadDelegate` path: return
      // `.download` so WebKit streams the bytes to a temp file (no
      // base64-over-bridge), then emit `onFileDownload` with the local
      // `file://` URL from `download(_:didFinishDownloading:)`.
      if HybridNitroWebView.isBlobDownload(
        response: navigationResponse.response,
        canShowMIMEType: navigationResponse.canShowMIMEType
      ) {
        decisionHandler(.download)
        return
      }
      let httpResponse = navigationResponse.response as? HTTPURLResponse
      emitHttpErrorIfNeeded(for: navigationResponse)
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

    private func emitHttpErrorIfNeeded(for response: WKNavigationResponse) {
      // Main-frame HTTP failures must be emitted before the download/allow decision.
      if response.isForMainFrame,
         let http = response.response as? HTTPURLResponse,
         let mapped = HybridNitroWebView.httpError(from: http) {
        failed = true
        owner?.emitHttpError(mapped)
      }
    }

    /// The web content process terminated (crash or OS reclaim) leaving a
    /// blank page. WebKit calls this on the main thread, so we emit directly
    /// with no thread hop. `didCrash` is always `nil` — WebKit exposes no
    /// crash-vs-reclaim discriminator on iOS. JS typically responds by
    /// calling `reload()` (the same WKWebView instance is reusable).
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
      cancelPendingDecisions()
      owner?.onRenderProcessGone?(
        NitroWebViewRenderProcessGoneEvent(
          nativeEvent: NitroWebViewRenderProcessGoneNativeEvent(didCrash: nil)
        )
      )
    }

    /// WebKit hands us the `WKDownload` produced by the `.download` policy
    /// above. We own the download's lifecycle and pick a temp-file
    /// destination in `download(_:decideDestinationUsing:...)`.
    func webView(
      _ webView: WKWebView,
      navigationResponse: WKNavigationResponse,
      didBecome download: WKDownload
    ) {
      retainDownload(download)
    }

    func webView(
      _ webView: WKWebView,
      navigationAction: WKNavigationAction,
      didBecome download: WKDownload
    ) {
      retainDownload(download)
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
  /// Whether a `blob:` navigation response should route through
  /// `WKDownloadDelegate` rather than render inline. Requires
  /// `canShowMIMEType == false`: an inline-renderable blob (e.g. an image the
  /// page navigates to) should still display, not download. Static, host-testable.
  static func isBlobDownload(
    response: URLResponse,
    canShowMIMEType: Bool
  ) -> Bool {
    guard response.url?.scheme?.lowercased() == "blob" else { return false }
    return !canShowMIMEType
  }

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

  fileprivate func emitLoadEnd(success: Bool) {
    let state = snapshotNavigationState()
    let event = WebViewLoadEvent(nativeEvent: WebViewNavigationState(
      url: state.url, title: state.title, loading: false,
      canGoBack: state.canGoBack, canGoForward: state.canGoForward
    ))
    if success { onLoad?(event) }
    onLoadEnd?(event)
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

  /// Map an `HTTPURLResponse` to a [MappedHttpError] when the status is a
  /// 4xx/5xx error, otherwise `nil` (a 2xx/3xx response is not an error).
  /// Standalone + static so it can be exercised by host-side XCTest with a
  /// hand-built `HTTPURLResponse` — no `WKWebView` needed. Deliberately NOT
  /// folded into `NitroWebViewErrorMapper`: an HTTP error carries a
  /// `statusCode` but no `NSError` code/domain (Stamp coupling avoided).
  static func httpError(from response: HTTPURLResponse) -> MappedHttpError? {
    guard (400...599).contains(response.statusCode) else { return nil }
    return MappedHttpError(
      statusCode: response.statusCode,
      url: response.url?.absoluteString ?? "",
      description: HTTPURLResponse.localizedString(forStatusCode: response.statusCode)
    )
  }

  fileprivate func emitHttpError(_ mapped: MappedHttpError) {
    onHttpError?(
      NitroWebViewHttpErrorEvent(
        nativeEvent: NitroWebViewHttpErrorNativeEvent(
          statusCode: Double(mapped.statusCode),
          url: mapped.url,
          description: mapped.description
        )
      )
    )
  }

  /// Build the cross-platform scroll payload from a `UIScrollView`. Takes a
  /// bare `UIScrollView` (not the WebView) so it can be unit-tested on the
  /// host with a plain scroll view. iOS populates every field.
  static func scrollEvent(from sv: UIScrollView) -> NitroWebViewScrollNativeEvent {
    NitroWebViewScrollNativeEvent(
      contentOffset: WebViewPoint(x: Double(sv.contentOffset.x), y: Double(sv.contentOffset.y)),
      contentSize: WebViewPoint(x: Double(sv.contentSize.width), y: Double(sv.contentSize.height)),
      contentInset: WebViewPoint(x: Double(sv.contentInset.left), y: Double(sv.contentInset.top)),
      layoutMeasurement: WebViewPoint(x: Double(sv.bounds.width), y: Double(sv.bounds.height)),
      zoomScale: Double(sv.zoomScale)
    )
  }

  private func snapshotNavigationState() -> WebViewNavigationState {
    WebViewNavigationState(
      url: webView?.url?.absoluteString ?? "",
      title: webView?.title ?? "",
      loading: webView?.isLoading ?? false,
      canGoBack: webView?.canGoBack ?? false,
      canGoForward: webView?.canGoForward ?? false
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
    hook(payload, ShouldStartLoadDecision(resolve: { allow in complete(allow ?? true) }))
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

  fileprivate func emitDownloadError(_ error: Error, url: String?) {
    guard !isDropped else { return }
    emitError(NSError(domain: "NitroWebViewDownload", code: -1,
      userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]), fallbackUrl: url)
  }

  /// Emit `onFileDownload` for a blob written to a local temp file by
  /// `WKDownloadDelegate`. `url` is the local `file://` URL; the rest of the
  /// metadata is distilled from the download's response the same way an HTTP
  /// download is (`fileDownload(from:)`), then the URL is overridden to the
  /// local file so JS reads/saves the on-disk copy.
  fileprivate func emitBlobFileDownload(
    localFileURL: URL,
    response: URLResponse?
  ) {
    let base = response.map(Self.fileDownload(from:))
    let download = FileDownload(
      url: localFileURL.absoluteString,
      mimeType: base?.mimeType ?? response?.mimeType,
      fileName: base?.fileName ?? localFileURL.lastPathComponent,
      contentLength: base?.contentLength,
      userAgent: nil
    )
    onFileDownload?(FileDownloadEvent(nativeEvent: download))
  }
}

// MARK: - WKDownloadDelegate (blob download → temp file)

/// `WKDownloadDelegate` conformance for the navigation delegate. Only blob
/// downloads reach here (routed via `.download` in `decidePolicyFor
/// navigationResponse`). WebKit streams the bytes to the temp file we pick in
/// `decideDestinationUsing`, then `didFinishDownloading` fires and we emit
/// `onFileDownload` with the local `file://` URL — no base64 crosses the
/// bridge (iOS 14.5+).
extension HybridNitroWebView.NavigationDelegate: WKDownloadDelegate {
  func download(
    _ download: WKDownload,
    decideDestinationUsing response: URLResponse,
    suggestedFilename: String,
    completionHandler: @escaping (URL?) -> Void
  ) {
    let id = ObjectIdentifier(download)
    guard var entry = pendingDownloads[id], let owner, !owner.isDropped else {
      completionHandler(nil)
      return
    }
    do {
      let destination = try NitroWebViewDownloadFiles.destination(suggestedFilename: suggestedFilename)
      entry.destination = destination
      entry.response = response
      pendingDownloads[id] = entry
      completionHandler(destination)
    } catch {
      pendingDownloads[id] = nil
      download.delegate = nil
      completionHandler(nil)
      owner.emitDownloadError(error, url: response.url?.absoluteString)
    }
  }

  func downloadDidFinish(_ download: WKDownload) {
    guard let entry = pendingDownloads.removeValue(forKey: ObjectIdentifier(download)),
      let destination = entry.destination else { return }
    download.delegate = nil
    guard let owner, !owner.isDropped, owner.onFileDownload != nil else {
      discardDownload(destination)
      return
    }
    // The consumer owns the completed file and its UUID directory after this callback.
    owner.emitBlobFileDownload(localFileURL: destination, response: entry.response)
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    guard let entry = pendingDownloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
    download.delegate = nil
    discardDownload(entry.destination)
    owner?.emitDownloadError(error, url: entry.response?.url?.absoluteString ?? download.originalRequest?.url?.absoluteString)
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
///
/// `createWebViewWith:for:windowFeatures:` (added below for `onOpenWindow`)
/// is a DIFFERENT, iOS-valid `WKUIDelegate` selector and coexists with the
/// file-upload gate — react-native-webview ships both on one delegate. It is
/// unrelated to the forbidden macOS `runOpenPanelWith` selector.
fileprivate final class UIDelegate: NSObject, WKUIDelegate {
  weak var owner: HybridNitroWebView?
  let dialogs = NitroWebViewDialogPresenter()

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    dialogs.present(in: webView, title: frame.request.url?.host, message: message,
                    kind: .alert) { _ in completionHandler() }
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
               initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    dialogs.present(in: webView, title: frame.request.url?.host, message: message,
                    kind: .confirm) { completionHandler($0 != nil) }
  }

  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
               defaultText: String?, initiatedByFrame frame: WKFrameInfo,
               completionHandler: @escaping (String?) -> Void) {
    dialogs.present(in: webView, title: frame.request.url?.host, message: prompt,
                    kind: .prompt(defaultText), completion: completionHandler)
  }

  /// `window.open` / `target=_blank` surface here (with `targetFrame == nil`).
  /// We NEVER create a second `WKWebView`: when `onOpenWindow` is set we emit
  /// the event and return nil; otherwise we load the request in-place in the
  /// current WebView (react-native-webview default).
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    let url = navigationAction.request.url?.absoluteString ?? ""
    if let owner = owner, owner.onOpenWindow != nil {
      owner.emitOpenWindow(targetUrl: url)
    } else {
      webView.load(navigationAction.request)
    }
    return nil
  }
}

// MARK: - HTTP-error value type

/// Result of mapping an `HTTPURLResponse` 4xx/5xx status into the
/// cross-platform `onHttpError` payload fields. `Equatable` so host-side
/// XCTest can assert per-field equality against a hand-built response.
struct MappedHttpError: Equatable {
  let statusCode: Int
  let url: String
  let description: String
}

// MARK: - UIScrollViewDelegate (scroll stream)

/// Dedicated `UIScrollViewDelegate` claimed on `WKWebView.scrollView` to
/// surface `onScroll`. Kept as a separate `NSObject` subclass (same reason
/// as `UIDelegate`) rather than adopting `UIScrollViewDelegate` on the
/// hybrid class. No scroll-driving delegate method is implemented — only the
/// read-only `scrollViewDidScroll` observation — so claiming the delegate
/// does not interfere with WKWebView's own scroll behavior.
fileprivate final class ScrollDelegate: NSObject, UIScrollViewDelegate {
  weak var owner: HybridNitroWebView?

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    owner?.onScroll?(
      NitroWebViewScrollEvent(
        nativeEvent: HybridNitroWebView.scrollEvent(from: scrollView)
      )
    )
  }
}
