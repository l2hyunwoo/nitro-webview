import Foundation

#if canImport(WebKit)
  import WebKit
#endif

/// Sink the history handler forwards SPA route-change notifications to.
/// Reference-typed so the handler can hold a weak reference and avoid a
/// retain cycle with the HybridView that owns it.
protocol NitroWebViewNavStateDispatcher: AnyObject {
  /// A SPA `history.pushState` / `replaceState` / `popstate` occurred. The
  /// `navType` string (`"other"` | `"backforward"`) is advisory — the
  /// dispatcher reads the live `webView.url` to build the fresh nav-state
  /// snapshot, so no URL is carried in the message.
  func dispatchHistoryNav(navType: String)
}

/// iOS `WKScriptMessageHandler` module for the SPA history shim. It is a
/// SEPARATE handler from `NitroWebViewMessageHandler`, registered under a
/// distinct name (`ReactNativeHistoryShim`), so a SPA route change can NEVER
/// be mistaken for a page `window.ReactNativeWebView.postMessage(...)`
/// (`onMessage`). The demux is by channel identity, not payload inspection.
final class NitroWebViewHistoryHandler: NSObject {
  /// Identifier used to register this handler with
  /// `WKUserContentController.add(_:name:)`. Must match the sink the injected
  /// history shim targets (`bridgeScript.ts` `HISTORY_SHIM_NAME`).
  static let scriptMessageHandlerName: String = "ReactNativeHistoryShim"

  /// Weak to avoid retain cycles with the HybridView that owns the handler.
  weak var dispatcher: NitroWebViewNavStateDispatcher?

  init(dispatcher: NitroWebViewNavStateDispatcher? = nil) {
    self.dispatcher = dispatcher
    super.init()
  }

  /// Test-friendly entry point. Production code calls this from
  /// `userContentController(_:didReceive:)`. The message body is a bare
  /// nav-type string; a missing dispatcher is a benign no-op.
  func handle(navType: Any) {
    dispatcher?.dispatchHistoryNav(navType: Self.stringifyNavType(navType))
  }

  /// Coerce the shim's message body into the nav-type string. The shim always
  /// posts a `String`, but coerce defensively.
  internal static func stringifyNavType(_ body: Any) -> String {
    if let s = body as? String { return s }
    if let s = body as? NSString { return s as String }
    return String(describing: body)
  }
}

#if canImport(WebKit)
  extension NitroWebViewHistoryHandler: WKScriptMessageHandler {
    func userContentController(
      _ userContentController: WKUserContentController,
      didReceive message: WKScriptMessage
    ) {
      handle(navType: message.body)
    }
  }
#endif
