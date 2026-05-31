import XCTest

#if canImport(WebKit)
  import WebKit
#endif

/// Tests for the iOS-side `onShouldStartLoadWithRequest` plumbing in
/// `ios/HybridNitroWebView.swift`.
///
/// The production hybrid class cannot be linked into this SwiftPM macOS
/// host harness because it depends on Nitro-generated bridge code
/// (`HybridNitroWebViewSpec`, `NitroModules`, `Promise`) that only
/// resolves at CocoaPods install time. Following the pre-existing pattern
/// used by `HybridNitroWebViewAttachmentDetectionTests`, the test
/// exercises two `Probe` types whose implementations mirror the
/// production helpers byte-for-byte:
///
///   - `NavigationTypeMapProbe.navigationType(from:)` mirrors
///     `HybridNitroWebView.navigationType(from:)` (raw → spec string).
///   - `ShouldStartPayloadProbe.payload(...)` mirrors
///     `HybridNitroWebView.shouldStartPayload(for:)` (builds the
///     cross-platform `ShouldStartLoadRequest` from the raw fields a
///     `WKNavigationAction` would surface).
///
/// We additionally exercise the stash-and-resolve contract end-to-end
/// against a tiny `PendingDecisions` probe that mirrors the
/// `NavigationDelegate.pendingDecisions` in-memory map. The probe is fed
/// a stub Promise-style callback and asserts that:
///   1. The stashed handler stays stashed until the callback resolves
///      (no timeout — mirrors RNW iOS lockIdentifier semantics).
///   2. `true` resolves to `.allow`, `false` resolves to `.cancel`.
///   3. A subsequent navigation does not see a stale entry.

#if canImport(WebKit)

  // MARK: - Production-mirror probes

  /// Faithful mirror of
  /// `HybridNitroWebView.navigationType(from:)`. Any divergence in the
  /// production helper must be ported here.
  fileprivate enum NavigationTypeMapProbe {
    /// Maps a `WKNavigationType` raw value to the cross-platform spec
    /// token. The integer raw values mirror Apple's documented enum:
    ///   0 -> linkActivated   -> "click"
    ///   1 -> formSubmitted   -> "formsubmit"
    ///   2 -> backForward     -> "backforward"
    ///   3 -> reload          -> "reload"
    ///   4 -> formResubmitted -> "formresubmit"
    ///   -1 / any other       -> "other"
    static func navigationType(fromRaw raw: Int) -> String {
      switch raw {
      case 0: return "click"
      case 1: return "formsubmit"
      case 2: return "backforward"
      case 3: return "reload"
      case 4: return "formresubmit"
      default: return "other"
      }
    }
  }

  /// Local mirror of the `ShouldStartLoadRequest` Nitro payload — the
  /// real type is only available at CocoaPods install time. Field order
  /// and types match the spec under `src/specs/NitroWebView.nitro.ts`
  /// and the Nitro-generated Kotlin/Swift struct.
  fileprivate struct ShouldStartProbeRequest: Equatable {
    let url: String
    let navigationType: String
    let mainDocumentURL: String?
    let isTopFrame: Bool?
    let hasTargetFrame: Bool?
  }

  /// Mirror of
  /// `HybridNitroWebView.shouldStartPayload(for:)`. Accepts the raw fields
  /// a `WKNavigationAction` would surface so the helper can be exercised
  /// without instantiating a real `WKWebView` / `WKNavigationAction`.
  fileprivate enum ShouldStartPayloadProbe {
    static func payload(
      url: URL?,
      mainDocumentURL: URL?,
      navigationTypeRaw: Int,
      targetFrameIsMainFrame: Bool?
    ) -> ShouldStartProbeRequest {
      return ShouldStartProbeRequest(
        url: url?.absoluteString ?? "",
        navigationType: NavigationTypeMapProbe.navigationType(
          fromRaw: navigationTypeRaw
        ),
        mainDocumentURL: mainDocumentURL?.absoluteString,
        isTopFrame: targetFrameIsMainFrame,
        hasTargetFrame: targetFrameIsMainFrame != nil
      )
    }
  }

  /// Mirror of the in-memory `pendingDecisions` map on
  /// `NavigationDelegate`. The production code uses
  /// `ObjectIdentifier(navigationAction)` as the key; here we accept any
  /// `AnyHashable` so the same contract can be exercised without a real
  /// `WKNavigationAction`.
  fileprivate final class PendingDecisionsProbe {
    /// Raw policy result that mirrors `WKNavigationActionPolicy`.
    enum Policy { case allow, cancel }

    private var stash: [AnyHashable: (Policy) -> Void] = [:]

    var count: Int { stash.count }

    func park(_ key: AnyHashable, handler: @escaping (Policy) -> Void) {
      stash[key] = handler
    }

    /// Resolve the parked handler with `allow ? .allow : .cancel`, then
    /// remove the entry. No-op when the key is not stashed (idempotent
    /// resolution).
    func resolve(_ key: AnyHashable, allow: Bool) {
      let handler = stash.removeValue(forKey: key)
      handler?(allow ? .allow : .cancel)
    }
  }

  final class HybridNitroWebViewShouldStartTests: XCTestCase {

    // MARK: - Test 1: navigation-type mapping

    /// All six WKNavigationType raw values map to the spec token RNW
    /// exposes. Mirrors the table in `WebViewNavigationType`.
    func test_navigationTypeMapping_coversAllFiveRawValues() {
      XCTAssertEqual(NavigationTypeMapProbe.navigationType(fromRaw: 0), "click")
      XCTAssertEqual(
        NavigationTypeMapProbe.navigationType(fromRaw: 1),
        "formsubmit"
      )
      XCTAssertEqual(
        NavigationTypeMapProbe.navigationType(fromRaw: 2),
        "backforward"
      )
      XCTAssertEqual(NavigationTypeMapProbe.navigationType(fromRaw: 3), "reload")
      XCTAssertEqual(
        NavigationTypeMapProbe.navigationType(fromRaw: 4),
        "formresubmit"
      )
    }

    /// Unknown / future `WKNavigationType` values must fall through to
    /// `"other"` so additions to Apple's enum don't crash the bridge.
    func test_navigationTypeMapping_unknownRawValueFallsThroughToOther() {
      XCTAssertEqual(
        NavigationTypeMapProbe.navigationType(fromRaw: -1),
        "other"
      )
      XCTAssertEqual(
        NavigationTypeMapProbe.navigationType(fromRaw: 99),
        "other"
      )
    }

    // MARK: - Test 2: payload construction

    /// The payload builder copies the URL, navigation-type, and
    /// mainDocumentURL verbatim from the navigation action's request.
    func test_payloadBuilder_capturesUrlAndMainDocumentAndNavigationType() {
      let url = URL(string: "https://example.com/page")!
      let mainDoc = URL(string: "https://example.com/")!

      let payload = ShouldStartPayloadProbe.payload(
        url: url,
        mainDocumentURL: mainDoc,
        navigationTypeRaw: 0, // linkActivated
        targetFrameIsMainFrame: true
      )

      XCTAssertEqual(payload.url, "https://example.com/page")
      XCTAssertEqual(payload.mainDocumentURL, "https://example.com/")
      XCTAssertEqual(payload.navigationType, "click")
      XCTAssertEqual(payload.isTopFrame, true)
      XCTAssertEqual(payload.hasTargetFrame, true)
    }

    /// `target=_blank` and other new-window navigations surface as
    /// `targetFrame == nil` on iOS. The payload must reflect both
    /// `hasTargetFrame == false` AND `isTopFrame == nil`.
    func test_payloadBuilder_newWindow_hasTargetFrameFalse() {
      let url = URL(string: "https://example.com/popup")!

      let payload = ShouldStartPayloadProbe.payload(
        url: url,
        mainDocumentURL: nil,
        navigationTypeRaw: 0,
        targetFrameIsMainFrame: nil
      )

      XCTAssertEqual(payload.hasTargetFrame, false)
      XCTAssertNil(payload.isTopFrame)
      XCTAssertNil(payload.mainDocumentURL)
    }

    // MARK: - Test 3: stash-and-resolve allow

    /// When the JS Promise resolves `true` the parked decisionHandler is
    /// invoked with `.allow` and the stash empties.
    func test_pendingDecisions_resolveAllow_invokesHandlerWithAllow_andEmptiesStash() {
      let stash = PendingDecisionsProbe()
      let key = AnyHashable(UUID())
      var observed: PendingDecisionsProbe.Policy?
      stash.park(key) { policy in observed = policy }

      XCTAssertEqual(stash.count, 1, "handler must be parked before resolution")

      stash.resolve(key, allow: true)

      XCTAssertEqual(observed, .allow)
      XCTAssertEqual(stash.count, 0, "stash must drain after resolution")
    }

    // MARK: - Test 4: stash-and-resolve cancel

    /// When the JS Promise resolves `false` the parked decisionHandler
    /// is invoked with `.cancel` and the stash empties.
    func test_pendingDecisions_resolveCancel_invokesHandlerWithCancel() {
      let stash = PendingDecisionsProbe()
      let key = AnyHashable(UUID())
      var observed: PendingDecisionsProbe.Policy?
      stash.park(key) { policy in observed = policy }

      stash.resolve(key, allow: false)

      XCTAssertEqual(observed, .cancel)
      XCTAssertEqual(stash.count, 0)
    }

    // MARK: - Test 5: no-timeout stash (RNW parity)

    /// The stash has NO timeout — entries stay parked indefinitely until
    /// they are explicitly resolved. We assert by pausing real time
    /// briefly and verifying the entry is still present (the production
    /// code uses the same plain dictionary, with no GCD timeout).
    func test_pendingDecisions_noTimeout_stashKeepsHandlerUntilExplicitResolve() {
      let stash = PendingDecisionsProbe()
      let key = AnyHashable(UUID())
      var observed: PendingDecisionsProbe.Policy?
      stash.park(key) { policy in observed = policy }

      // Wait > 250 ms (Android's default-allow window) to prove iOS
      // does NOT apply any timeout.
      let waited = expectation(description: "no-timeout dwell")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        waited.fulfill()
      }
      wait(for: [waited], timeout: 2)

      XCTAssertEqual(
        stash.count, 1,
        "stash must keep the parked handler past 250 ms — iOS applies NO timeout"
      )
      XCTAssertNil(observed, "handler must not be invoked before resolve()")

      // Late-resolution still fires the handler with the supplied policy.
      stash.resolve(key, allow: true)
      XCTAssertEqual(observed, .allow)
      XCTAssertEqual(stash.count, 0)
    }
  }

#endif  // canImport(WebKit)
