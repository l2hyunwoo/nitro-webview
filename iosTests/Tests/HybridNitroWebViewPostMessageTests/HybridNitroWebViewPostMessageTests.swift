import Foundation
import XCTest

@testable import NitroWebViewSource

/// Swift mirror of the TS escaping oracle
/// (`src/__tests__/post-message-escaping.test.ts`). Exercises the
/// `NitroWebViewPostMessage` builder that backs
/// `HybridNitroWebView.postMessageScript(_:)`.
///
/// For each hostile payload the emitted statement must:
///   1. contain no RAW U+2028 / U+2029 (illegal unescaped in a pre-ES2019
///      JS source string),
///   2. wrap the payload as a `window.dispatchEvent(new MessageEvent(...))`
///      call, and
///   3. round-trip the payload verbatim — decoding the emitted JS string
///      literal back through `JSONSerialization` yields the original bytes
///      (the same guarantee the TS `vm` sandbox asserts via `event.data`).
final class HybridNitroWebViewPostMessageTests: XCTestCase {

  private let ls = "\u{2028}"
  private let ps = "\u{2029}"

  private lazy var hostile: [String] = [
    "",
    "plain",
    "has \"double\" and 'single' quotes",
    "line1\nline2\ttab\r",
    "</script><script>alert(1)</script>",
    "漢字 🎉 unicode",
    "sep\(ls)here\(ps)too",
    "{\"nested\":\"json\",\"n\":42}",
    "back\\slash",
  ]

  func test_emittedStatement_hasNoRawLineOrParagraphSeparators() {
    for payload in hostile {
      let stmt = NitroWebViewPostMessage.buildStatement(payload)
      XCTAssertFalse(
        stmt.contains(ls) || stmt.contains(ps),
        "raw U+2028/U+2029 must not survive into the statement: \(payload.debugDescription)"
      )
    }
  }

  func test_emittedStatement_dispatchesMessageEventOnWindow() {
    for payload in hostile {
      let stmt = NitroWebViewPostMessage.buildStatement(payload)
      XCTAssertTrue(
        stmt.hasPrefix(
          "window.dispatchEvent(new MessageEvent('message',{data:"
        ),
        "statement must dispatch a `message` event on window: \(stmt)"
      )
      XCTAssertTrue(stmt.hasSuffix("}));"), "statement must be closed: \(stmt)")
    }
  }

  func test_emittedLiteral_roundTripsPayloadVerbatim() throws {
    for payload in hostile {
      let literal = NitroWebViewPostMessage.encodeJsStringLiteral(payload)
      // Decode the JS string literal back through JSON. The post-escape of
      // U+2028/U+2029 produces the JSON-legal ` `/` ` escapes, so
      // the literal is valid JSON and must decode to the original payload.
      let data = Data("[\(literal)]".utf8)
      let decoded = try JSONSerialization.jsonObject(with: data) as? [String]
      XCTAssertEqual(
        decoded?.first,
        payload,
        "emitted literal must decode back to the payload verbatim: \(payload.debugDescription)"
      )
    }
  }

  func test_encodeJsStringLiteral_isQuotedAndEscapesSeparators() {
    let enc = NitroWebViewPostMessage.encodeJsStringLiteral("a\(ls)b\(ps)c")
    XCTAssertTrue(
      enc.hasPrefix("\"") && enc.hasSuffix("\""),
      "must be a quoted JS literal: \(enc)"
    )
    XCTAssertTrue(
      enc.contains("\\u2028") && enc.contains("\\u2029"),
      "LS/PS must be escaped: \(enc)"
    )
    XCTAssertFalse(enc.contains(ls) || enc.contains(ps), "no raw LS/PS: \(enc)")
  }
}
