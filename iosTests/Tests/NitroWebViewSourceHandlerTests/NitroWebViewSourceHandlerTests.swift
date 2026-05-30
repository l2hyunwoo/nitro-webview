import XCTest

@testable import NitroWebViewSource

/// Records every call to `loadHTMLString(_:baseURL:)` so tests can assert
/// the exact arguments and call count.
private final class SpyHTMLLoader: WebViewHTMLLoader {
  struct Invocation: Equatable {
    let html: String
    // Stored as absoluteString so assertions don't depend on URL's
    // equatability quirks across Foundation builds.
    let baseURLString: String?
  }

  private(set) var invocations: [Invocation] = []

  func loadHTMLStringPayload(_ string: String, baseURL: URL?) {
    invocations.append(
      Invocation(html: string, baseURLString: baseURL?.absoluteString)
    )
  }
}

final class NitroWebViewSourceHandlerTests: XCTestCase {

  func test_applyHtmlPayload_withNoBaseUrl_callsLoadHTMLStringWithNilBaseURL() {
    let handler = NitroWebViewSourceHandler()
    let spy = SpyHTMLLoader()
    let payload = NitroLoadHtmlPayload(html: "<h1>Hello</h1>")

    handler.applyHtmlPayload(payload, to: spy)

    XCTAssertEqual(spy.invocations.count, 1)
    XCTAssertEqual(spy.invocations.first?.html, "<h1>Hello</h1>")
    XCTAssertNil(spy.invocations.first?.baseURLString)
  }

  func test_applyHtmlPayload_withBaseUrl_callsLoadHTMLStringWithParsedURL() {
    let handler = NitroWebViewSourceHandler()
    let spy = SpyHTMLLoader()
    let payload = NitroLoadHtmlPayload(
      html: "<a href=\"/about\">About</a>",
      baseUrlString: "https://example.com"
    )

    handler.applyHtmlPayload(payload, to: spy)

    XCTAssertEqual(spy.invocations.count, 1)
    XCTAssertEqual(spy.invocations.first?.html, "<a href=\"/about\">About</a>")
    XCTAssertEqual(spy.invocations.first?.baseURLString, "https://example.com")
  }

  /// The HTML body must be forwarded byte-for-byte — no sanitisation,
  /// re-encoding, or trimming.
  func test_applyHtmlPayload_preservesHtmlBodyVerbatim() {
    let handler = NitroWebViewSourceHandler()
    let spy = SpyHTMLLoader()
    let body = [
      "<!DOCTYPE html>",
      "<html><head><meta charset=\"utf-8\"><title>π</title></head>",
      "<body>",
      "  <p>Hello, world! 漢字 🎉</p>",
      "  <script>window.x = 1 < 2 && 3 > 0;</script>",
      "</body></html>",
    ].joined(separator: "\n")

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html: body, baseUrlString: nil),
      to: spy
    )

    XCTAssertEqual(spy.invocations.first?.html, body)
  }

  /// Empty baseUrl must collapse to nil baseURL, not an empty URL.
  func test_applyHtmlPayload_emptyBaseUrlString_isTreatedAsNil() {
    let handler = NitroWebViewSourceHandler()
    let spy = SpyHTMLLoader()

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html: "<p>x</p>", baseUrlString: ""),
      to: spy
    )

    XCTAssertNil(spy.invocations.first?.baseURLString)
  }

  func test_applyHtmlPayload_supportsHttpHttpsAndFileSchemes() {
    let handler = NitroWebViewSourceHandler()
    let cases: [String] = [
      "http://example.com",
      "https://example.com",
      "file:///var/mobile/app/",
    ]

    for raw in cases {
      let spy = SpyHTMLLoader()
      handler.applyHtmlPayload(
        NitroLoadHtmlPayload(html: "<p>x</p>", baseUrlString: raw),
        to: spy
      )
      XCTAssertEqual(spy.invocations.first?.baseURLString, raw)
    }
  }

  func test_parseBaseURL_nil_emptyAndValid() {
    XCTAssertNil(NitroWebViewSourceHandler.parseBaseURL(nil))
    XCTAssertNil(NitroWebViewSourceHandler.parseBaseURL(""))

    let parsed = NitroWebViewSourceHandler.parseBaseURL("https://example.com")
    XCTAssertEqual(parsed?.absoluteString, "https://example.com")
  }

  /// Guards against the handler accidentally retrying on its own.
  func test_applyHtmlPayload_invokesLoaderOnceEachCall() {
    let handler = NitroWebViewSourceHandler()
    let spy = SpyHTMLLoader()

    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html: "<p>one</p>"), to: spy
    )
    handler.applyHtmlPayload(
      NitroLoadHtmlPayload(html: "<p>two</p>", baseUrlString: "https://a.test"),
      to: spy
    )

    XCTAssertEqual(spy.invocations.count, 2)
    XCTAssertEqual(spy.invocations[0].html, "<p>one</p>")
    XCTAssertNil(spy.invocations[0].baseURLString)
    XCTAssertEqual(spy.invocations[1].html, "<p>two</p>")
    XCTAssertEqual(spy.invocations[1].baseURLString, "https://a.test")
  }
}
