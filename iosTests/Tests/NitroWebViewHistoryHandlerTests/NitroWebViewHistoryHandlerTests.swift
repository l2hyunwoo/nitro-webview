import Foundation
import XCTest

@testable import NitroWebViewSource

private final class SpyNavStateDispatcher: NitroWebViewNavStateDispatcher {
  private(set) var navTypes: [String] = []

  func dispatchHistoryNav(navType: String) {
    navTypes.append(navType)
  }
}

/// Unit tests for `NitroWebViewHistoryHandler` — the SECOND
/// WKScriptMessageHandler that owns the SPA history sink, separate from the
/// `onMessage` handler. Verifies the dispatcher seam and the body-stringify
/// coercion, mirroring `NitroWebViewMessageHandlerTests`.
final class NitroWebViewHistoryHandlerTests: XCTestCase {

  func test_handle_forwardsNavTypeToDispatcher() {
    let spy = SpyNavStateDispatcher()
    let handler = NitroWebViewHistoryHandler(dispatcher: spy)

    handler.handle(navType: "other")
    handler.handle(navType: "backforward")

    XCTAssertEqual(spy.navTypes, ["other", "backforward"])
  }

  func test_handle_withoutDispatcher_isNoOp() {
    let handler = NitroWebViewHistoryHandler()
    // Must not crash when no dispatcher is wired (benign pre/post-wire race).
    handler.handle(navType: "other")
  }

  func test_stringifyNavType_passesThroughString() {
    XCTAssertEqual(
      NitroWebViewHistoryHandler.stringifyNavType("backforward"),
      "backforward"
    )
  }

  func test_stringifyNavType_coercesNSString() {
    let body: Any = NSString(string: "other")
    XCTAssertEqual(NitroWebViewHistoryHandler.stringifyNavType(body), "other")
  }

  func test_handlerName_matchesShimSink() {
    // Must match `HISTORY_SHIM_NAME` in bridgeScript.ts and the sink the
    // injected iOS shim posts to.
    XCTAssertEqual(
      NitroWebViewHistoryHandler.scriptMessageHandlerName,
      "ReactNativeHistoryShim"
    )
  }
}
