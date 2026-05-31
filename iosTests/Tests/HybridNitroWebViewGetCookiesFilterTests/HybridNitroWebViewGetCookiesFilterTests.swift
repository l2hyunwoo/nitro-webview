import XCTest

@testable import NitroWebViewSource

/// Verify that the cookie filter extracted from
/// `HybridNitroWebView.getCookies(url:)` excludes cookies whose host, path,
/// or secure flag is incompatible with the requested URL.
///
/// On the real device `HybridNitroWebView.getCookies(url:)` calls
/// `webView.configuration.websiteDataStore.httpCookieStore.getAllCookies`
/// and then runs the resulting `[HTTPCookie]` through
/// `NitroWebViewCookieFilter`. The production class itself cannot link into
/// this SwiftPM harness (Nitro/WKWebView dependencies), so these tests feed
/// the filter directly with the same `HTTPCookie` instances WebKit would
/// produce, then assert the returned set matches the filtering contract.
final class HybridNitroWebViewGetCookiesFilterTests: XCTestCase {

  // MARK: - Test fixtures

  /// Build an `HTTPCookie` with the exact fields needed for the filter
  /// rules. Using `HTTPCookie(properties:)` matches the type WebKit
  /// surfaces through `WKHTTPCookieStore.getAllCookies`.
  private func makeCookie(
    name: String,
    value: String = "v",
    domain: String,
    path: String = "/",
    secure: Bool = false
  ) -> HTTPCookie {
    var props: [HTTPCookiePropertyKey: Any] = [
      .name: name,
      .value: value,
      .domain: domain,
      .path: path,
    ]
    if secure { props[.secure] = "TRUE" }
    let cookie = HTTPCookie(properties: props)
    XCTAssertNotNil(
      cookie,
      "HTTPCookie(properties:) returned nil for name=\(name) domain=\(domain) path=\(path) — fixture is malformed."
    )
    return cookie!
  }

  /// Run the filter the same way `HybridNitroWebView.getCookies(url:)`
  /// would: scope the URL, then keep cookies for which
  /// `cookieMatches(_:scope:)` is true. Returns just the names so
  /// assertions are easy to read.
  private func filteredNames(
    cookies: [HTTPCookie],
    forUrl url: String
  ) -> [String] {
    let scope = NitroWebViewCookieFilter.urlScope(forUrl: url)
    return cookies
      .filter { NitroWebViewCookieFilter.cookieMatches($0, scope: scope) }
      .map { $0.name }
  }

  // MARK: - Combined exclusion

  /// Given a mixed cookie jar, cookies that fail any of host / path /
  /// secure must NOT appear in the result for the requested URL. Ties
  /// all three constraints together in one assertion block.
  func test_filter_excludesCookiesFailingAnyOfHostPathOrSecure() {
    let url = "http://example.com/account/settings"
    let cookies: [HTTPCookie] = [
      // Should KEEP: exact host, root path, not secure.
      makeCookie(name: "match_root", domain: "example.com", path: "/"),
      // Should KEEP: exact host, exact path.
      makeCookie(name: "match_exact_path", domain: "example.com",
                 path: "/account/settings"),
      // Should KEEP: exact host, path prefix `/account/` with trailing slash.
      makeCookie(name: "match_path_prefix", domain: "example.com",
                 path: "/account/"),
      // Should KEEP: parent-domain suffix (leading-dot).
      makeCookie(name: "match_parent_dot", domain: ".example.com", path: "/"),

      // Exclusions
      // FAILS host: wrong host entirely.
      makeCookie(name: "wrong_host", domain: "other.test", path: "/"),
      // FAILS host: a sibling subdomain (cookie scoped to a child the URL
      // does not live under).
      makeCookie(name: "sibling_subdomain", domain: "evil.example.com",
                 path: "/"),
      // FAILS path: cookie scoped to `/billing` is not in the request path.
      makeCookie(name: "wrong_path", domain: "example.com", path: "/billing"),
      // FAILS path boundary: cookie path `/acc` is a string prefix but not
      // a `/`-delimited prefix of `/account/settings`. Must be excluded.
      makeCookie(name: "boundary_path", domain: "example.com", path: "/acc"),
      // FAILS secure: cookie is secure-only, URL is plain HTTP.
      makeCookie(name: "secure_on_http", domain: "example.com", path: "/",
                 secure: true),
    ]

    let kept = filteredNames(cookies: cookies, forUrl: url)
    let dropped = cookies.map { $0.name }.filter { !kept.contains($0) }

    // The four match_* cookies survive; nothing else does.
    XCTAssertEqual(
      Set(kept),
      Set(["match_root", "match_exact_path",
           "match_path_prefix", "match_parent_dot"]),
      "Filter kept the wrong cookies for \(url). kept=\(kept) dropped=\(dropped)"
    )

    // And every excluded cookie is gone — assert each by name so a
    // regression naming the culprit appears in the failure log.
    for name in [
      "wrong_host", "sibling_subdomain",
      "wrong_path", "boundary_path",
      "secure_on_http",
    ] {
      XCTAssertFalse(
        kept.contains(name),
        "Cookie \(name) should have been excluded for URL \(url)."
      )
    }
  }

  // MARK: - Host constraint

  /// A cookie scoped to a different registrable host must be excluded even
  /// if its path and secure flag are both compatible with the request.
  func test_filter_excludesCookieWithMismatchedHost() {
    let cookies = [
      makeCookie(name: "foreign", domain: "other.test", path: "/"),
      makeCookie(name: "local", domain: "example.com", path: "/"),
    ]
    let kept = filteredNames(cookies: cookies, forUrl: "http://example.com/")

    XCTAssertEqual(kept, ["local"])
  }

  /// Leading-dot domain cookies should match the bare domain AND any
  /// subdomain — but NOT an unrelated host. Pinning this guarantees the
  /// host check follows RFC 6265 §5.1.3 rather than a naive substring.
  func test_filter_includesParentDotCookieOnSubdomain_butNotForeignHost() {
    let cookies = [
      makeCookie(name: "parent", domain: ".example.com", path: "/"),
    ]
    XCTAssertEqual(filteredNames(cookies: cookies, forUrl: "http://example.com/"), ["parent"])
    XCTAssertEqual(filteredNames(cookies: cookies, forUrl: "http://a.example.com/"), ["parent"])
    XCTAssertEqual(filteredNames(cookies: cookies, forUrl: "http://otherexample.com/"), [])
  }

  // MARK: - Path-prefix constraint

  /// A cookie with `Path=/billing` must NOT show up for `/account/settings`
  /// even though host and secure are fine.
  func test_filter_excludesCookieWhenUrlPathOutsideCookiePath() {
    let cookies = [
      makeCookie(name: "billing_only", domain: "example.com", path: "/billing"),
      makeCookie(name: "root", domain: "example.com", path: "/"),
    ]
    let kept = filteredNames(
      cookies: cookies, forUrl: "http://example.com/account/settings"
    )
    XCTAssertEqual(Set(kept), Set(["root"]))
  }

  /// Path-prefix is `/`-aware: `/foo` cookies must not match `/foobar`.
  /// This is the most common silent-leak bug in naive cookie filters.
  func test_filter_excludesCookieAcrossPathBoundary() {
    let cookies = [
      makeCookie(name: "foo", domain: "example.com", path: "/foo"),
    ]
    XCTAssertEqual(filteredNames(cookies: cookies, forUrl: "http://example.com/foobar"), [])
    XCTAssertEqual(filteredNames(cookies: cookies, forUrl: "http://example.com/foo"), ["foo"])
    XCTAssertEqual(filteredNames(cookies: cookies, forUrl: "http://example.com/foo/baz"), ["foo"])
  }

  // MARK: - Secure constraint

  /// A secure-only cookie must NOT be returned for a plain HTTP URL even
  /// when host and path align perfectly.
  func test_filter_excludesSecureCookieForHttpUrl() {
    let cookies = [
      makeCookie(name: "secure_only", domain: "example.com", path: "/", secure: true),
      makeCookie(name: "plain", domain: "example.com", path: "/", secure: false),
    ]
    let kept = filteredNames(cookies: cookies, forUrl: "http://example.com/")
    XCTAssertEqual(kept, ["plain"])
  }

  /// And, symmetrically, the same secure-only cookie IS returned when the
  /// URL is HTTPS. Pins the secure rule as conditional rather than blanket.
  func test_filter_includesSecureCookieForHttpsUrl() {
    let cookies = [
      makeCookie(name: "secure_only", domain: "example.com", path: "/", secure: true),
    ]
    let kept = filteredNames(cookies: cookies, forUrl: "https://example.com/")
    XCTAssertEqual(kept, ["secure_only"])
  }

  // MARK: - URL parsing edge cases

  /// `urlScope` must correctly classify HTTP vs HTTPS, regardless of case.
  func test_urlScope_isSecure_isCaseInsensitive() {
    XCTAssertTrue(NitroWebViewCookieFilter.urlScope(forUrl: "HTTPS://example.com/").isSecure)
    XCTAssertTrue(NitroWebViewCookieFilter.urlScope(forUrl: "https://example.com/").isSecure)
    XCTAssertFalse(NitroWebViewCookieFilter.urlScope(forUrl: "http://example.com/").isSecure)
    XCTAssertFalse(NitroWebViewCookieFilter.urlScope(forUrl: "HTTP://example.com/").isSecure)
  }

  /// An empty path on the URL normalises to "/" so cookies with `Path=/`
  /// are returned for root-level requests like `http://example.com`.
  func test_urlScope_emptyPathNormalisesToSlash() {
    let scope = NitroWebViewCookieFilter.urlScope(forUrl: "http://example.com")
    XCTAssertEqual(scope.path, "/")
  }
}
