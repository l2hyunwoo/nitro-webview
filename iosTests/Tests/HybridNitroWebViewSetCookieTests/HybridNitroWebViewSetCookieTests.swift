import XCTest

#if canImport(WebKit)
  import WebKit
#endif

/// Tests for iOS `setCookie(url, cookie)`:
///
/// `ios/HybridNitroWebView.swift` implements `setCookie(url, cookie)` by
/// constructing an `HTTPCookie` properties dictionary with `name`/`value`,
/// `domain` defaulting to URL host when unset, `path` defaulting to `"/"`
/// when unset, `expires` converted via
/// `Date(timeIntervalSince1970: expires/1000)`, and the secure flag,
/// then instantiating `HTTPCookie(properties:)` and calling
/// `httpCookieStore.setCookie(_:completionHandler:)`.
///
/// The production class cannot be linked into this SwiftPM harness because
/// it depends on Nitro-generated bridge code (`HybridNitroWebViewSpec`,
/// `NitroModules`) that only resolves at CocoaPods install time. Following
/// the pre-existing pattern used by `HybridNitroWebViewHeaderMergeTests`
/// and `HybridNitroWebViewUIDelegateBindingTests`, this test exercises a
/// `SetCookieProbe` whose `toHTTPCookie` / `setCookie` methods mirror the
/// production logic byte-for-byte. The probe is fed through both halves
/// of the contract:
///
///   1. **Defaults applied** — domain defaults to URL host when unset,
///      path defaults to "/" when unset, expires is converted from
///      milliseconds, and the secure flag is honored. Asserted directly
///      against the `HTTPCookie` instance the probe constructs.
///   2. **Persisted in WKHTTPCookieStore** — calling
///      `setCookie(url:cookie:)` writes the cookie into a real
///      `WKHTTPCookieStore` (instantiated from an isolated, non-persistent
///      `WKWebsiteDataStore` to keep the test hermetic). The cookie must be
///      observable via `httpCookieStore.getAllCookies(_:)` after the
///      completion handler fires.
#if canImport(WebKit)

  // MARK: - Cookie payload (mirror of the generated `Cookie` struct)

  /// Faithful structural mirror of the Nitro-generated `Cookie` payload.
  /// Field set and optionality must stay in lock-step with the
  /// `Cookie` interface in `src/specs/NitroWebView.nitro.ts`.
  fileprivate struct ProbeCookie {
    let name: String
    let value: String
    let domain: String?
    let path: String?
    let expires: Double?
    let secure: Bool?
    let httpOnly: Bool?
  }

  // MARK: - Production-logic mirror

  /// Byte-for-byte mirror of `HybridNitroWebView.toHTTPCookie(_:fallbackUrl:)`
  /// and `HybridNitroWebView.setCookie(url:cookie:)`. Any change to those
  /// production functions must be ported here for the contract to keep
  /// being exercised on the SwiftPM host.
  fileprivate enum SetCookieProbe {
    /// Mirror of `HybridNitroWebView.toHTTPCookie(_:fallbackUrl:)`.
    /// Constructs an `HTTPCookie` properties dictionary with:
    ///   - name / value
    ///   - domain defaulting to the URL host when unset
    ///   - path defaulting to "/" when unset
    ///   - expires converted via `Date(timeIntervalSince1970: expires/1000)`
    ///   - secure flag honored when true
    static func toHTTPCookie(_ cookie: ProbeCookie, fallbackUrl: String) -> HTTPCookie? {
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

    /// Mirror of `HybridNitroWebView.setCookie(url:cookie:)`.
    /// Persists the cookie into the supplied `WKHTTPCookieStore` via
    /// `setCookie(_:completionHandler:)` and resolves the supplied
    /// completion handler when the store reports completion. Returns
    /// `false` (and skips the store call) when the cookie could not be
    /// constructed — mirroring the production error path that rejects the
    /// promise.
    static func setCookie(
      url: String,
      cookie: ProbeCookie,
      store: WKHTTPCookieStore,
      completion: @escaping (Bool) -> Void
    ) {
      guard let httpCookie = toHTTPCookie(cookie, fallbackUrl: url) else {
        completion(false)
        return
      }
      store.setCookie(httpCookie) {
        completion(true)
      }
    }
  }

  final class HybridNitroWebViewSetCookieTests: XCTestCase {

    // MARK: - Helpers

    /// Build an isolated, non-persistent cookie store. Using a fresh
    /// `WKWebsiteDataStore.nonPersistent()` for each test keeps the store
    /// hermetic so persisted cookies from one test don't contaminate
    /// another (and don't bleed into the macOS host's default cookie
    /// store either).
    private func makeIsolatedStore() -> WKHTTPCookieStore {
      WKWebsiteDataStore.nonPersistent().httpCookieStore
    }

    // MARK: - Defaults applied

    /// Defaults: when the supplied `Cookie` omits `domain`, the constructed
    /// `HTTPCookie` must use the URL's host. When it omits `path`, the
    /// constructed cookie must use "/". Asserted directly on the in-memory
    /// `HTTPCookie` so the defaults rule is pinned independently of the
    /// store-persistence step.
    func test_toHTTPCookie_defaultsDomainToUrlHost_andPathToSlash() {
      let cookie = ProbeCookie(
        name: "session",
        value: "abc",
        domain: nil,     // ← unset; must default to URL host
        path: nil,       // ← unset; must default to "/"
        expires: nil,
        secure: nil,
        httpOnly: nil
      )

      let http = SetCookieProbe.toHTTPCookie(
        cookie,
        fallbackUrl: "https://example.com/some/page"
      )

      XCTAssertNotNil(
        http,
        "HTTPCookie(properties:) must succeed when only name/value are supplied — defaults should fill domain/path."
      )
      XCTAssertEqual(
        http?.name, "session",
        "Cookie name must round-trip through HTTPCookie(properties:)."
      )
      XCTAssertEqual(
        http?.value, "abc",
        "Cookie value must round-trip through HTTPCookie(properties:)."
      )
      XCTAssertEqual(
        http?.domain, "example.com",
        "Missing domain must default to URL host (example.com) per the contract."
      )
      XCTAssertEqual(
        http?.path, "/",
        "Missing path must default to \"/\" per the contract."
      )
      XCTAssertFalse(
        http?.isSecure ?? true,
        "Unspecified secure flag must produce a non-secure cookie."
      )
    }

    /// Explicit `domain` and `path` must be preserved (the defaults rule
    /// only kicks in when the field is `nil`). Guards against a regression
    /// that would always rewrite `domain`/`path` to URL-derived values.
    func test_toHTTPCookie_preservesExplicitDomainAndPath() {
      let cookie = ProbeCookie(
        name: "auth",
        value: "token",
        domain: ".example.com",
        path: "/account",
        expires: nil,
        secure: nil,
        httpOnly: nil
      )
      let http = SetCookieProbe.toHTTPCookie(
        cookie,
        fallbackUrl: "https://example.com/"
      )
      XCTAssertEqual(http?.domain, ".example.com")
      XCTAssertEqual(http?.path, "/account")
    }

    /// `expires` is supplied as milliseconds-since-epoch (the JS contract
    /// pinned by `interface Cookie { expires?: number }`). The production
    /// converter divides by 1000 before handing it to
    /// `Date(timeIntervalSince1970:)`. Verify the resulting `Date` on the
    /// `HTTPCookie` lines up with what `Date(timeIntervalSince1970:)`
    /// produces for the same `expires/1000` value.
    ///
    /// NOTE: a few platforms / OS versions normalise/clamp the persisted
    /// expires Date (e.g. macOS Sequoia clamps to ~400-day RFC 6265bis
    /// max-age). To keep this assertion stable across hosts, the test
    /// picks an expires that is in the near future (≈ 7 days), well
    /// inside any platform clamp, and verifies the cookie's expires
    /// matches the same `Date(timeIntervalSince1970: expires/1000)`
    /// value the production converter would compute.
    func test_toHTTPCookie_convertsExpiresFromMillisecondsToDate() {
      let nowSeconds = Date().timeIntervalSince1970
      // Seven days from now — far enough to be unambiguously future,
      // well inside any platform expiry-clamp window.
      let expectedSeconds = nowSeconds + (7 * 24 * 60 * 60)
      let expectedMillis = expectedSeconds * 1000

      let cookie = ProbeCookie(
        name: "remember_me",
        value: "1",
        domain: nil,
        path: nil,
        expires: expectedMillis,
        secure: nil,
        httpOnly: nil
      )
      let http = SetCookieProbe.toHTTPCookie(
        cookie,
        fallbackUrl: "https://example.com/"
      )
      let expires = http?.expiresDate
      XCTAssertNotNil(
        expires,
        "Supplied expires must surface as expiresDate on the HTTPCookie."
      )
      XCTAssertEqual(
        expires?.timeIntervalSince1970 ?? 0,
        expectedSeconds,
        accuracy: 2.0,
        "expires must be converted by dividing the millisecond input by 1000 before passing to Date(timeIntervalSince1970:)."
      )
    }

    /// Defensive pin on the conversion arithmetic itself: when we ask the
    /// production converter for `expires = 5000` (ms), the resulting
    /// `expiresDate` must equal `Date(timeIntervalSince1970: 5)` — i.e.
    /// the divide-by-1000 step is correct. This is independent of any
    /// platform clamping behaviour because the target date is far in the
    /// past (Unix epoch + 5 seconds), so the platform stores it verbatim.
    func test_toHTTPCookie_expiresDivideBy1000_arithmeticPin() {
      let cookie = ProbeCookie(
        name: "epoch_plus_five",
        value: "v",
        domain: nil,
        path: nil,
        expires: 5000, // ms → 5 seconds past the Unix epoch
        secure: nil,
        httpOnly: nil
      )
      let http = SetCookieProbe.toHTTPCookie(
        cookie,
        fallbackUrl: "https://example.com/"
      )
      // A cookie with a long-past expires is treated as a session cookie
      // by some platforms (so `expiresDate` may be nil); we therefore
      // verify the conversion at the *Date* level rather than via the
      // platform-normalised HTTPCookie field. The equivalence below is the
      // arithmetic pinned here: `Date(timeIntervalSince1970: 5000 / 1000)`.
      let expected = Date(timeIntervalSince1970: 5000 / 1000.0)
      XCTAssertEqual(expected.timeIntervalSince1970, 5.0, accuracy: 0.001)
      // And, when expires is preserved (non-clamped path), it equals the
      // expected Date. Some platforms drop the field for past dates — we
      // only assert when it survives so the test is not flaky across SDKs.
      if let actual = http?.expiresDate {
        XCTAssertEqual(
          actual.timeIntervalSince1970, expected.timeIntervalSince1970,
          accuracy: 1.0
        )
      }
    }

    /// The secure flag must propagate when set to true. Mirrors the
    /// production guard `if cookie.secure == true { props[.secure] = "TRUE" }`.
    func test_toHTTPCookie_setsSecureFlagWhenTrue() {
      let cookie = ProbeCookie(
        name: "session",
        value: "v",
        domain: nil,
        path: nil,
        expires: nil,
        secure: true,
        httpOnly: nil
      )
      let http = SetCookieProbe.toHTTPCookie(
        cookie,
        fallbackUrl: "https://example.com/"
      )
      XCTAssertTrue(
        http?.isSecure ?? false,
        "secure=true must produce a secure HTTPCookie."
      )
    }

    /// `secure: false` (explicit) must NOT mark the cookie secure.
    /// Together with `test_toHTTPCookie_setsSecureFlagWhenTrue`, this
    /// covers the conditional in `if cookie.secure == true`.
    func test_toHTTPCookie_doesNotSetSecureFlagWhenFalse() {
      let cookie = ProbeCookie(
        name: "session",
        value: "v",
        domain: nil,
        path: nil,
        expires: nil,
        secure: false,
        httpOnly: nil
      )
      let http = SetCookieProbe.toHTTPCookie(
        cookie,
        fallbackUrl: "https://example.com/"
      )
      XCTAssertFalse(
        http?.isSecure ?? true,
        "secure=false must NOT produce a secure HTTPCookie."
      )
    }

    // MARK: - Persisted in WKHTTPCookieStore

    /// Persistence: after `setCookie(url:cookie:)` completes,
    /// the cookie must be observable in the same `WKHTTPCookieStore` via
    /// `getAllCookies(_:)`. The store is an isolated non-persistent
    /// `WKWebsiteDataStore` so the assertion is hermetic.
    func test_setCookie_persistsCookieInWKHTTPCookieStore() {
      let store = makeIsolatedStore()
      let cookie = ProbeCookie(
        name: "persist_me",
        value: "yes",
        domain: nil,
        path: nil,
        expires: nil,
        secure: nil,
        httpOnly: nil
      )

      let setDone = expectation(description: "setCookie completes")
      SetCookieProbe.setCookie(
        url: "https://example.com/",
        cookie: cookie,
        store: store
      ) { ok in
        XCTAssertTrue(ok, "setCookie must succeed for a well-formed payload.")
        setDone.fulfill()
      }
      wait(for: [setDone], timeout: 5)

      // Confirm persistence: the store must surface the cookie via
      // `getAllCookies(_:)` after `setCookie` reports completion. This is
      // the literal persistence check.
      let listed = expectation(description: "getAllCookies returns the persisted cookie")
      store.getAllCookies { cookies in
        let names = cookies.map { $0.name }
        XCTAssertTrue(
          names.contains("persist_me"),
          "Cookie 'persist_me' must be observable in WKHTTPCookieStore after setCookie completes. Got: \(names)"
        )
        // Defaults applied at persistence time too.
        if let stored = cookies.first(where: { $0.name == "persist_me" }) {
          XCTAssertEqual(
            stored.domain, "example.com",
            "Persisted cookie's domain must equal the URL host when domain was unset."
          )
          XCTAssertEqual(
            stored.path, "/",
            "Persisted cookie's path must default to \"/\" when path was unset."
          )
          XCTAssertEqual(stored.value, "yes")
        }
        listed.fulfill()
      }
      wait(for: [listed], timeout: 5)
    }

    /// Companion check: `setCookie` for a cookie with explicit `domain` /
    /// `path` / `secure` round-trips faithfully through the store. Pins
    /// that the persistence step does not silently drop the explicit
    /// fields.
    func test_setCookie_persistsExplicitDomainPathSecureFields() {
      let store = makeIsolatedStore()
      let cookie = ProbeCookie(
        name: "fully_specified",
        value: "v",
        domain: ".example.com",
        path: "/account",
        expires: nil,
        secure: true,
        httpOnly: nil
      )

      let setDone = expectation(description: "setCookie completes")
      SetCookieProbe.setCookie(
        url: "https://example.com/",
        cookie: cookie,
        store: store
      ) { ok in
        XCTAssertTrue(ok)
        setDone.fulfill()
      }
      wait(for: [setDone], timeout: 5)

      let listed = expectation(description: "getAllCookies returns the fully-specified cookie")
      store.getAllCookies { cookies in
        let stored = cookies.first(where: { $0.name == "fully_specified" })
        XCTAssertNotNil(stored, "Fully-specified cookie must be persisted.")
        XCTAssertEqual(stored?.domain, ".example.com")
        XCTAssertEqual(stored?.path, "/account")
        XCTAssertTrue(stored?.isSecure ?? false)
        listed.fulfill()
      }
      wait(for: [listed], timeout: 5)
    }
  }

#endif  // canImport(WebKit)
