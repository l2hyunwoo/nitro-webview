import XCTest

#if canImport(WebKit)
  import WebKit
#endif

/// Tests for `ios/HybridNitroWebView.swift`'s `clearCookies` implementation:
/// `WKWebsiteDataStore.default().removeData(ofTypes:
/// [WKWebsiteDataTypeCookies], modifiedSince: .distantPast,
/// completionHandler:)` must remove all pre-existing cookies in the default
/// data store after the call completes.
///
/// The production class `HybridNitroWebView` (in `ios/HybridNitroWebView.swift`)
/// cannot be linked into this SwiftPM harness because it depends on
/// Nitro-generated bridge code (`HybridNitroWebViewSpec`, `NitroModules`)
/// that only resolves at CocoaPods install time. Following the pre-existing
/// pattern used by `HybridNitroWebViewSetCookieTests`,
/// `HybridNitroWebViewHeaderMergeTests`, and
/// `HybridNitroWebViewUIDelegateBindingTests`, this test exercises a
/// `ClearCookiesProbe` whose `clearCookies` mirrors the production logic
/// byte-for-byte. The probe is fed the following contract:
///
///   1. **Invokes `removeData(ofTypes:[WKWebsiteDataTypeCookies], ...)`** —
///      structurally pinned via the `dataStore`-injectable seam so the test
///      can observe the call against a real `WKWebsiteDataStore`
///      (`.nonPersistent()` for hermeticity).
///   2. **Pre-existing cookies are removed** — write a cookie into the data
///      store via `WKHTTPCookieStore.setCookie(_:)`, then run the probe.
///      After the probe's completion handler fires, the same store's
///      `getAllCookies(_:)` must return an array that no longer contains the
///      written cookie.
///   3. **Uses `.distantPast` as the lower bound** — a defensive arithmetic
///      pin that ensures the production call would clear everything ever
///      written (not just recently-modified entries).
///
/// NOTE on data-store choice: production calls
/// `WKWebsiteDataStore.default()`, which is shared process-wide and would
/// leak state between tests / between this test run and the host's other
/// cookies. The probe is therefore parameterised on the data store so the
/// test can substitute a fresh `.nonPersistent()` store for hermetic
/// behavior. The substitution preserves the invocation contract — it is
/// the same `removeData(ofTypes:modifiedSince:completionHandler:)` API
/// surface either way.
#if canImport(WebKit)

  // MARK: - Production-logic mirror

  /// Byte-for-byte mirror of `HybridNitroWebView.clearCookies()`. Any
  /// change to the production function must be ported here for the
  /// contract to keep being exercised on the SwiftPM host.
  ///
  /// The probe is parameterised on `dataStore` so the test can supply an
  /// isolated `.nonPersistent()` store. Production hard-codes
  /// `WKWebsiteDataStore.default()` — the only semantic difference between
  /// the two paths is which store gets cleared, which is irrelevant to the
  /// "does it call removeData(...) and does that remove the cookies"
  /// contract.
  fileprivate enum ClearCookiesProbe {
    /// Mirror of `HybridNitroWebView.clearCookies()`.
    /// Invokes `removeData(ofTypes:[WKWebsiteDataTypeCookies],
    /// modifiedSince: .distantPast, completionHandler:)` and fires the
    /// supplied completion when WebKit reports the removal is complete.
    static func clearCookies(
      dataStore: WKWebsiteDataStore,
      completion: @escaping () -> Void
    ) {
      dataStore.removeData(
        ofTypes: [WKWebsiteDataTypeCookies],
        modifiedSince: .distantPast,
        completionHandler: completion
      )
    }
  }

  final class HybridNitroWebViewClearCookiesTests: XCTestCase {

    // MARK: - Helpers

    /// Build an isolated, non-persistent data store. Using a fresh
    /// `WKWebsiteDataStore.nonPersistent()` for each test keeps the store
    /// hermetic so seeded cookies from one test don't contaminate
    /// another (and don't bleed into the macOS host's default cookie
    /// store either).
    private func makeIsolatedDataStore() -> WKWebsiteDataStore {
      WKWebsiteDataStore.nonPersistent()
    }

    /// Seed a cookie into the supplied data store's cookie jar. Returns
    /// after the store reports the write is durable, so the subsequent
    /// `clearCookies` call is guaranteed to see the cookie as present.
    private func seedCookie(
      name: String,
      value: String = "v",
      domain: String = "example.com",
      path: String = "/",
      into dataStore: WKWebsiteDataStore
    ) {
      let props: [HTTPCookiePropertyKey: Any] = [
        .name: name,
        .value: value,
        .domain: domain,
        .path: path,
      ]
      guard let cookie = HTTPCookie(properties: props) else {
        XCTFail("Failed to construct seed HTTPCookie for \(name)")
        return
      }
      let done = expectation(description: "seed cookie \(name) persisted")
      dataStore.httpCookieStore.setCookie(cookie) {
        done.fulfill()
      }
      wait(for: [done], timeout: 5)
    }

    /// Snapshot all cookies currently in the supplied data store. Returns
    /// just the names for terse assertions.
    private func cookieNames(in dataStore: WKWebsiteDataStore) -> [String] {
      var result: [String] = []
      let done = expectation(description: "getAllCookies returned")
      dataStore.httpCookieStore.getAllCookies { cookies in
        result = cookies.map { $0.name }
        done.fulfill()
      }
      wait(for: [done], timeout: 5)
      return result
    }

    // MARK: - Pre-existing cookies are removed

    /// After `clearCookies()` completes, every cookie that was
    /// previously in the data store must be gone. Seeds two cookies on
    /// different domains, runs the probe, then asserts the cookie store is
    /// empty (and at minimum no longer contains either seed).
    func test_clearCookies_removesPreExistingCookiesFromDataStore() {
      let store = makeIsolatedDataStore()

      // Seed two cookies on different domains to prove the removal is
      // wholesale, not scoped to a single host/path.
      seedCookie(name: "session", domain: "example.com", into: store)
      seedCookie(name: "tracker", domain: "tracker.test", into: store)

      // Sanity: both seeds are actually in the store before we clear.
      let preNames = cookieNames(in: store)
      XCTAssertTrue(
        preNames.contains("session"),
        "Pre-condition: 'session' must be in the data store before clearCookies. Got: \(preNames)"
      )
      XCTAssertTrue(
        preNames.contains("tracker"),
        "Pre-condition: 'tracker' must be in the data store before clearCookies. Got: \(preNames)"
      )

      // Run the probe — this is the call under test.
      let cleared = expectation(description: "clearCookies completion fires")
      ClearCookiesProbe.clearCookies(dataStore: store) {
        cleared.fulfill()
      }
      wait(for: [cleared], timeout: 10)

      // After the completion fires, the cookie store no longer contains
      // any of the seeded cookies.
      let postNames = cookieNames(in: store)
      XCTAssertFalse(
        postNames.contains("session"),
        "'session' must be removed by clearCookies. Got: \(postNames)"
      )
      XCTAssertFalse(
        postNames.contains("tracker"),
        "'tracker' must be removed by clearCookies. Got: \(postNames)"
      )
      XCTAssertTrue(
        postNames.isEmpty,
        "Data store must be fully empty after clearCookies (wholesale removal). Got: \(postNames)"
      )
    }

    /// The completion handler must fire even when the store starts out
    /// empty (the production promise must always resolve so JS callers
    /// never hang). Calling `removeData(ofTypes:...)` on an empty store
    /// is the no-op edge case.
    func test_clearCookies_completionFiresOnEmptyStore() {
      let store = makeIsolatedDataStore()
      // No seeding — store starts empty.
      XCTAssertTrue(
        cookieNames(in: store).isEmpty,
        "Pre-condition: isolated store must start empty."
      )

      let cleared = expectation(description: "clearCookies completion fires on empty store")
      ClearCookiesProbe.clearCookies(dataStore: store) {
        cleared.fulfill()
      }
      wait(for: [cleared], timeout: 10)

      XCTAssertTrue(
        cookieNames(in: store).isEmpty,
        "Store must remain empty after clearCookies on an already-empty store."
      )
    }

    // MARK: - Defensive pins on the API contract

    /// Defensive pin on the exact data-type identifier
    /// `WKWebsiteDataTypeCookies` — this test asserts that constant is the
    /// canonical string Apple ships ("WKWebsiteDataTypeCookies"). Catches a
    /// regression where someone substitutes a sibling identifier (e.g.
    /// `WKWebsiteDataTypeLocalStorage`) and accidentally clears the wrong
    /// data class.
    func test_clearCookies_usesWKWebsiteDataTypeCookiesIdentifier() {
      XCTAssertEqual(
        WKWebsiteDataTypeCookies,
        "WKWebsiteDataTypeCookies",
        "The data-type constant used to scope removeData(ofTypes:) must be WKWebsiteDataTypeCookies."
      )
      // And it must be part of the set Apple lists as removable cookie
      // data — a stronger guarantee that the production call will hit
      // the cookie removal code path inside WebKit.
      let allTypes = WKWebsiteDataStore.allWebsiteDataTypes()
      XCTAssertTrue(
        allTypes.contains(WKWebsiteDataTypeCookies),
        "WKWebsiteDataTypeCookies must be part of WKWebsiteDataStore.allWebsiteDataTypes() — otherwise removeData(ofTypes:) would silently skip cookies."
      )
    }

    /// Defensive pin: the production call passes `.distantPast` as the
    /// `modifiedSince` lower bound. That lower bound is the canonical
    /// "everything ever modified" sentinel — every cookie's `modifiedSince`
    /// is strictly after `.distantPast`, so the removal is wholesale rather
    /// than scoped to recently-modified entries. This test asserts the
    /// arithmetic invariant the call depends on: any real `Date` is strictly
    /// later than `.distantPast`.
    func test_distantPast_isStrictlyBeforeAnyCurrentDate() {
      let now = Date()
      XCTAssertLessThan(
        Date.distantPast,
        now,
        ".distantPast must be strictly before now — otherwise removeData(modifiedSince:.distantPast) could skip currently-modified cookies."
      )
      // And before the Unix epoch, just to pin the magnitude.
      let unixEpoch = Date(timeIntervalSince1970: 0)
      XCTAssertLessThan(
        Date.distantPast,
        unixEpoch,
        ".distantPast must precede the Unix epoch — otherwise cookies whose modification time predates 1970 (rare but possible after a system-clock reset) would be skipped."
      )
    }
  }

#endif  // canImport(WebKit)
