import Foundation

#if canImport(WebKit)
  import WebKit
#endif

/// The (data, url) pair forwarded to the native event dispatcher. Mirrors
/// the JS-side `onMessage({ nativeEvent: { data, url } })` payload.
public struct NitroWebViewMessageEvent: Equatable {
  public let data: String
  public let url: String

  public init(data: String, url: String) {
    self.data = data
    self.url = url
  }
}

/// Abstraction over the subset of `WKScriptMessage` this handler reads.
/// `WKScriptMessage` has no public initializer, so the production
/// conformance lives in the extension below.
public protocol PostMessageScriptMessage {
  /// The body the web page passed to
  /// `window.webkit.messageHandlers.ReactNativeWebView.postMessage(body)`.
  /// May be `String`, `NSNumber`, `Bool`, `NSDictionary`, `NSArray`, or `NSNull`.
  var body: Any { get }

  /// The web view that delivered the message. May be `nil` if WebKit has
  /// torn it down.
  var postMessageWebView: PostMessageWebView? { get }
}

/// Abstraction over the subset of `WKWebView` this handler reads.
public protocol PostMessageWebView: AnyObject {
  /// The URL of the currently loaded page. Mirrors `WKWebView.url`.
  /// When `nil`, the handler forwards an empty string `""`.
  var currentURL: URL? { get }
}

#if canImport(WebKit)
  extension WKWebView: PostMessageWebView {
    public var currentURL: URL? { self.url }
  }

  extension WKScriptMessage: PostMessageScriptMessage {
    public var postMessageWebView: PostMessageWebView? { self.webView }
  }
#endif

/// Sink the handler forwards each event to. Reference-typed so the handler
/// can hold a weak reference and avoid retain cycles.
public protocol NitroWebViewMessageDispatcher: AnyObject {
  func dispatchMessage(_ event: NitroWebViewMessageEvent)
}

/// iOS WKScriptMessageHandler module that receives `postMessage` from the
/// injected `window.ReactNativeWebView` bridge and forwards the payload
/// (data string + current URL string) to a native event dispatcher.
public final class NitroWebViewMessageHandler: NSObject {
  /// Identifier used to register this handler with
  /// `WKUserContentController.add(_:name:)`. Must match the property the
  /// injected JS bridge targets on `window.webkit.messageHandlers`.
  public static let scriptMessageHandlerName: String = "ReactNativeWebView"

  /// Weak to avoid retain cycles with the HybridView that owns the handler.
  public weak var dispatcher: NitroWebViewMessageDispatcher?

  public init(dispatcher: NitroWebViewMessageDispatcher? = nil) {
    self.dispatcher = dispatcher
    super.init()
  }

  /// Test-friendly entry point. Production code calls this from
  /// `userContentController(_:didReceive:)`.
  ///
  /// If no dispatcher is wired, the call is a no-op — the JS page can post
  /// messages before/after the dispatcher is wired and we should not crash
  /// the app over a benign race.
  public func handle(message: PostMessageScriptMessage) {
    let data = Self.stringifyBody(message.body)
    let url = message.postMessageWebView?.currentURL?.absoluteString ?? ""
    let event = NitroWebViewMessageEvent(data: data, url: url)
    dispatcher?.dispatchMessage(event)
  }

  /// Stringify a `WKScriptMessage.body` value into the `String` the JS-side
  /// `onMessage` event expects as `nativeEvent.data`.
  ///
  /// Dictionaries are intentionally NOT JSON-encoded here; callers that want
  /// JSON should call `JSON.stringify` on the web side before `postMessage`.
  internal static func stringifyBody(_ body: Any) -> String {
    if let s = body as? String { return s }
    if let s = body as? NSString { return s as String }
    if body is NSNull { return "" }
    if let n = body as? NSNumber { return n.stringValue }
    return String(describing: body)
  }
}

#if canImport(WebKit)
  extension NitroWebViewMessageHandler: WKScriptMessageHandler {
    public func userContentController(
      _ userContentController: WKUserContentController,
      didReceive message: WKScriptMessage
    ) {
      handle(message: message)
    }
  }
#endif
