import XCTest

@testable import NitroWebViewSource

final class NitroWebViewErrorMapperTests: XCTestCase {

  func test_event_fromNsUrlErrorDomain_mapsAllFieldsFaithfully() {
    let mockError = NSError(
      domain: NSURLErrorDomain,
      code: -1003,  // NSURLErrorCannotFindHost
      userInfo: [
        NSLocalizedDescriptionKey:
          "A server with the specified hostname could not be found.",
        NSURLErrorFailingURLStringErrorKey: "https://nonexistent.example/",
      ]
    )

    let event = NitroWebViewErrorMapper.event(from: mockError)

    XCTAssertEqual(
      event,
      MappedNitroWebViewError(
        code: -1003,
        description: "A server with the specified hostname could not be found.",
        url: "https://nonexistent.example/",
        domain: NSURLErrorDomain
      )
    )
  }

  /// `code` round-trips from `NSError.code`, including negatives (CFNetwork).
  func test_event_code_isPropagatedVerbatim_includingNegatives() {
    let cases: [Int] = [-1009, -1001, -1003, 0, 42, 999]
    for raw in cases {
      let error = NSError(domain: NSURLErrorDomain, code: raw, userInfo: nil)
      let event = NitroWebViewErrorMapper.event(from: error)
      XCTAssertEqual(event.code, raw)
    }
  }

  /// `description` prefers `userInfo[NSLocalizedDescriptionKey]` over the
  /// synthesised `localizedDescription`, matching react-native-webview.
  func test_event_description_prefersUserInfoLocalizedDescriptionKey() {
    let error = NSError(
      domain: "WebKitErrorDomain",
      code: 101,
      userInfo: [
        NSLocalizedDescriptionKey: "Frame load interrupted",
      ]
    )
    let event = NitroWebViewErrorMapper.event(from: error)
    XCTAssertEqual(event.description, "Frame load interrupted")
  }

  /// Fallback to `NSError.localizedDescription` when userInfo is bare.
  /// Asserts non-empty rather than pinning a locale-specific string.
  func test_event_description_fallsBackToLocalizedDescription_whenUserInfoMissing() {
    let error = NSError(domain: NSURLErrorDomain, code: -1009, userInfo: nil)
    let event = NitroWebViewErrorMapper.event(from: error)
    XCTAssertFalse(event.description.isEmpty)
  }

  func test_event_domain_isPropagatedVerbatim_acrossKnownDomains() {
    let domains = [
      NSURLErrorDomain,
      "WebKitErrorDomain",
      NSPOSIXErrorDomain,
      "NSCocoaErrorDomain",
    ]
    for domain in domains {
      let error = NSError(domain: domain, code: 0, userInfo: nil)
      let event = NitroWebViewErrorMapper.event(from: error)
      XCTAssertEqual(event.domain, domain)
    }
  }

  /// 1st-priority: `userInfo[NSURLErrorFailingURLStringErrorKey]` wins
  /// even when a `fallbackUrl` is also supplied.
  func test_event_url_prefersFailingURLStringKey_overFallback() {
    let error = NSError(
      domain: NSURLErrorDomain,
      code: -1003,
      userInfo: [
        NSURLErrorFailingURLStringErrorKey: "https://from-userinfo.test/",
      ]
    )
    let event = NitroWebViewErrorMapper.event(
      from: error,
      fallbackUrl: "https://from-fallback.test/"
    )
    XCTAssertEqual(event.url, "https://from-userinfo.test/")
  }

  /// 2nd-priority: `userInfo[NSURLErrorFailingURLErrorKey]` (a `URL`).
  func test_event_url_fallsBackToFailingURLKey_whenStringKeyMissing() {
    let url = URL(string: "https://from-url-key.test/page")!
    let error = NSError(
      domain: NSURLErrorDomain,
      code: -1009,
      userInfo: [
        NSURLErrorFailingURLErrorKey: url,
      ]
    )
    let event = NitroWebViewErrorMapper.event(from: error)
    XCTAssertEqual(event.url, "https://from-url-key.test/page")
  }

  /// 3rd-priority: the `fallbackUrl` argument when neither failing-URL key
  /// is present (some WebKitErrorDomain errors).
  func test_event_url_fallsBackToDelegateSuppliedUrl_whenUserInfoBare() {
    let error = NSError(
      domain: "WebKitErrorDomain",
      code: 102,
      userInfo: nil
    )
    let event = NitroWebViewErrorMapper.event(
      from: error,
      fallbackUrl: "https://delegate-knew.test/"
    )
    XCTAssertEqual(event.url, "https://delegate-knew.test/")
  }

  /// 4th-priority: empty string preserves the JS contract `url: string`.
  func test_event_url_collapsesToEmptyString_whenNothingAvailable() {
    let error = NSError(
      domain: "WebKitErrorDomain",
      code: 999,
      userInfo: nil
    )
    let event = NitroWebViewErrorMapper.event(from: error, fallbackUrl: nil)
    XCTAssertEqual(event.url, "")
  }

  func test_extractFailingURL_resolutionLadder() {
    // Rung 1: string key
    let withStringKey = NSError(
      domain: NSURLErrorDomain, code: 0,
      userInfo: [NSURLErrorFailingURLStringErrorKey: "https://one.test/"]
    )
    XCTAssertEqual(
      NitroWebViewErrorMapper.extractFailingURL(
        from: withStringKey, fallbackUrl: "https://fb.test/"),
      "https://one.test/"
    )

    // Rung 2: URL key (only)
    let withUrlKey = NSError(
      domain: NSURLErrorDomain, code: 0,
      userInfo: [
        NSURLErrorFailingURLErrorKey: URL(string: "https://two.test/")!
      ]
    )
    XCTAssertEqual(
      NitroWebViewErrorMapper.extractFailingURL(
        from: withUrlKey, fallbackUrl: "https://fb.test/"),
      "https://two.test/"
    )

    // Rung 3: fallbackUrl
    let bare = NSError(domain: "WebKitErrorDomain", code: 0, userInfo: nil)
    XCTAssertEqual(
      NitroWebViewErrorMapper.extractFailingURL(
        from: bare, fallbackUrl: "https://three.test/"),
      "https://three.test/"
    )

    // Rung 4: empty string
    XCTAssertEqual(
      NitroWebViewErrorMapper.extractFailingURL(from: bare, fallbackUrl: nil),
      ""
    )
  }

  /// Both `didFailNavigation` and `didFailProvisionalNavigation` route
  /// through the SAME mapper without special-casing.
  func test_event_isAgnosticToWhichDelegateCallbackTriggeredIt() {
    let provisional = NSError(
      domain: NSURLErrorDomain, code: -1003,
      userInfo: [
        NSLocalizedDescriptionKey: "cannot find host",
        NSURLErrorFailingURLStringErrorKey: "https://no-such.test/",
      ]
    )

    let postCommit = NSError(
      domain: "WebKitErrorDomain", code: 102,
      userInfo: [
        NSLocalizedDescriptionKey: "Frame load interrupted",
      ]
    )

    let e1 = NitroWebViewErrorMapper.event(
      from: provisional, fallbackUrl: "https://no-such.test/")
    let e2 = NitroWebViewErrorMapper.event(
      from: postCommit, fallbackUrl: "https://committed.test/")

    XCTAssertEqual(e1.domain, NSURLErrorDomain)
    XCTAssertEqual(e1.code, -1003)
    XCTAssertEqual(e1.url, "https://no-such.test/")

    XCTAssertEqual(e2.domain, "WebKitErrorDomain")
    XCTAssertEqual(e2.code, 102)
    // WebKitErrorDomain errors typically don't populate the failing-URL key,
    // so this falls back to the delegate-supplied value.
    XCTAssertEqual(e2.url, "https://committed.test/")
  }
}
