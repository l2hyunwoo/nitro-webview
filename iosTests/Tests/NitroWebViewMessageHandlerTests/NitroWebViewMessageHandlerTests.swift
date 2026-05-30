import Foundation
import XCTest

@testable import NitroWebViewSource

private final class SpyMessageDispatcher: NitroWebViewMessageDispatcher {
  private(set) var events: [NitroWebViewMessageEvent] = []

  func dispatchMessage(_ event: NitroWebViewMessageEvent) {
    events.append(event)
  }
}

private final class StubWebView: PostMessageWebView {
  var currentURL: URL?
  init(currentURL: URL?) { self.currentURL = currentURL }
}

private struct StubScriptMessage: PostMessageScriptMessage {
  let body: Any
  let postMessageWebView: PostMessageWebView?
}

final class NitroWebViewMessageHandlerTests: XCTestCase {

  func test_handle_dispatchesEventWithDataAndUrl() {
    let spy = SpyMessageDispatcher()
    let handler = NitroWebViewMessageHandler(dispatcher: spy)
    let webView = StubWebView(currentURL: URL(string: "https://example.com/page")!)
    let message = StubScriptMessage(body: "hello", postMessageWebView: webView)

    handler.handle(message: message)

    XCTAssertEqual(spy.events.count, 1)
    XCTAssertEqual(spy.events.first?.data, "hello")
    XCTAssertEqual(spy.events.first?.url, "https://example.com/page")
  }

  func test_handle_stringifiesBody_String() {
    XCTAssertEqual(
      NitroWebViewMessageHandler.stringifyBody("plain string"),
      "plain string"
    )
  }

  func test_handle_stringifiesBody_NSString() {
    let body: Any = NSString(string: "ns string")
    XCTAssertEqual(NitroWebViewMessageHandler.stringifyBody(body), "ns string")
  }

  func test_handle_stringifiesBody_NSNull_becomesEmptyString() {
    XCTAssertEqual(
      NitroWebViewMessageHandler.stringifyBody(NSNull()),
      ""
    )
  }

  func test_handle_stringifiesBody_NSNumber() {
    XCTAssertEqual(
      NitroWebViewMessageHandler.stringifyBody(NSNumber(value: 42)),
      "42"
    )
    XCTAssertEqual(
      NitroWebViewMessageHandler.stringifyBody(NSNumber(value: 3.14)),
      "3.14"
    )
  }

  /// nil URL must dispatch as `""` so the JS-side `nativeEvent.url: string`
  /// type invariant holds.
  func test_handle_nilURL_dispatchesEmptyStringURL() {
    let spy = SpyMessageDispatcher()
    let handler = NitroWebViewMessageHandler(dispatcher: spy)
    let webView = StubWebView(currentURL: nil)
    let message = StubScriptMessage(body: "x", postMessageWebView: webView)

    handler.handle(message: message)

    XCTAssertEqual(spy.events.first?.url, "")
  }

  func test_handle_nilWebView_dispatchesEmptyStringURL() {
    let spy = SpyMessageDispatcher()
    let handler = NitroWebViewMessageHandler(dispatcher: spy)
    let message = StubScriptMessage(body: "x", postMessageWebView: nil)

    handler.handle(message: message)

    XCTAssertEqual(spy.events.first?.url, "")
  }

  func test_handle_dispatchesAbsoluteUrlIncludingQuery() {
    let spy = SpyMessageDispatcher()
    let handler = NitroWebViewMessageHandler(dispatcher: spy)
    let raw = "https://example.com/path?q=1&r=2"
    let webView = StubWebView(currentURL: URL(string: raw)!)
    let message = StubScriptMessage(body: "ping", postMessageWebView: webView)

    handler.handle(message: message)

    XCTAssertEqual(spy.events.first?.url, raw)
  }

  /// Calls that arrive before the dispatcher is wired (or after it has been
  /// deallocated) must not crash.
  func test_handle_noDispatcher_isNoOp() {
    let handler = NitroWebViewMessageHandler(dispatcher: nil)
    let webView = StubWebView(currentURL: URL(string: "https://x.test")!)
    let message = StubScriptMessage(body: "y", postMessageWebView: webView)

    handler.handle(message: message)
  }

  func test_handle_multipleMessages_dispatchesEachOnce() {
    let spy = SpyMessageDispatcher()
    let handler = NitroWebViewMessageHandler(dispatcher: spy)

    let webViewA = StubWebView(currentURL: URL(string: "https://a.test/")!)
    handler.handle(
      message: StubScriptMessage(body: "first", postMessageWebView: webViewA)
    )

    webViewA.currentURL = URL(string: "https://b.test/?x=1")
    handler.handle(
      message: StubScriptMessage(body: "second", postMessageWebView: webViewA)
    )

    XCTAssertEqual(spy.events.count, 2)
    XCTAssertEqual(spy.events[0], NitroWebViewMessageEvent(
      data: "first", url: "https://a.test/"
    ))
    XCTAssertEqual(spy.events[1], NitroWebViewMessageEvent(
      data: "second", url: "https://b.test/?x=1"
    ))
  }

  /// The handler's registration name must match the property the injected
  /// `window.ReactNativeWebView` bridge targets, or messages never arrive.
  func test_scriptMessageHandlerName_matchesInjectedBridge() {
    XCTAssertEqual(
      NitroWebViewMessageHandler.scriptMessageHandlerName,
      "ReactNativeWebView"
    )
  }
}
