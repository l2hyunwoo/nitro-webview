import XCTest
@testable import NitroWebViewSource

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
/// Decision lifetime tests call the production Nitro-free manager used by
/// NavigationDelegate. Only payload/type mapping above still uses probes.

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

    func test_decisionsHaveUniqueIDs_andOneNavigationDoesNotCancelAnother() {
      let pending = NitroWebViewNavigationDecisions()
      var first: [Bool] = []
      var second: [Bool] = []
      let firstID = pending.park { first.append($0) }
      let secondID = pending.park { second.append($0) }
      XCTAssertNotEqual(firstID, secondID)
      XCTAssertEqual(pending.count, 2)

      pending.resolve(firstID, allow: true)
      XCTAssertEqual(first, [true])
      XCTAssertEqual(second, [])
      XCTAssertEqual(pending.count, 1)
      pending.resolve(secondID, allow: false)
      XCTAssertEqual(second, [false])
      XCTAssertEqual(pending.count, 0)
    }

    func test_removeBeforeCompletion_preventsDuplicateAndReentrantCalls() {
      let pending = NitroWebViewNavigationDecisions()
      var calls: [Bool] = []
      var id: UUID!
      id = pending.park { allow in
        XCTAssertTrue(Thread.isMainThread)
        XCTAssertEqual(pending.count, 0)
        calls.append(allow)
        pending.resolve(id, allow: !allow)
      }
      pending.resolve(id, allow: false)
      pending.resolve(id, allow: true)
      XCTAssertEqual(calls, [false])
    }

    func test_cancelAllDrainsCurrentDecisions_andIgnoresLateResults() {
      let pending = NitroWebViewNavigationDecisions()
      var calls: [Bool] = []
      let first = pending.park { calls.append($0) }
      let second = pending.park { calls.append($0) }
      pending.cancelAll()
      pending.cancelAll()
      pending.resolve(first, allow: true)
      pending.resolve(second, allow: false)
      XCTAssertEqual(calls, [false, false])
      XCTAssertEqual(pending.count, 0)

      var replacement: [Bool] = []
      let replacementID = pending.park { replacement.append($0) }
      XCTAssertNotEqual(first, replacementID)
      pending.resolve(first, allow: true)
      XCTAssertEqual(replacement, [])
      pending.resolve(replacementID, allow: true)
      XCTAssertEqual(replacement, [true])
    }

    func test_cancelAllRemovesSnapshotBeforeCallingHandlers() {
      let pending = NitroWebViewNavigationDecisions()
      var calls: [Bool] = []
      var nextID: UUID!
      _ = pending.park { allow in
        XCTAssertTrue(Thread.isMainThread)
        XCTAssertEqual(pending.count, 0)
        calls.append(allow)
        pending.cancelAll()
        nextID = pending.park { calls.append($0) }
      }
      pending.cancelAll()
      XCTAssertEqual(calls, [false])
      XCTAssertEqual(pending.count, 1, "a new decision is outside the cancelled snapshot")
      pending.resolve(nextID, allow: true)
      XCTAssertEqual(calls, [false, true])
    }

    func test_backgroundCompletionRunsHandlerOnMainThread() {
      let pending = NitroWebViewNavigationDecisions()
      let done = expectation(description: "main-thread decision")
      let id = pending.park { allow in
        XCTAssertTrue(Thread.isMainThread)
        XCTAssertTrue(allow)
        XCTAssertEqual(pending.count, 0)
        done.fulfill()
      }
      DispatchQueue.global().async { pending.resolve(id, allow: true) }
      wait(for: [done], timeout: 2)
    }

    func test_cancellationWinsOverQueuedBackgroundCompletion() {
      let pending = NitroWebViewNavigationDecisions()
      var calls: [Bool] = []
      let id = pending.park { calls.append($0) }
      let queued = DispatchSemaphore(value: 0)
      DispatchQueue.global().async {
        pending.resolve(id, allow: true)
        queued.signal()
      }
      XCTAssertEqual(queued.wait(timeout: .now() + 2), .success)
      pending.cancelAll()
      let drained = expectation(description: "queued completion drained")
      DispatchQueue.main.async { drained.fulfill() }
      wait(for: [drained], timeout: 2)
      XCTAssertEqual(calls, [false])
      XCTAssertEqual(pending.count, 0)
    }

    func test_unresolvedDecisionHasNoAndroidTimeout() {
      let pending = NitroWebViewNavigationDecisions()
      var calls: [Bool] = []
      let id = pending.park { calls.append($0) }
      let waited = expectation(description: "past Android nominal budget")
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { waited.fulfill() }
      wait(for: [waited], timeout: 2)
      XCTAssertEqual(pending.count, 1)
      XCTAssertEqual(calls, [])
      pending.resolve(id, allow: true)
      XCTAssertEqual(calls, [true])
      XCTAssertEqual(pending.count, 0)
    }

  }

#endif  // canImport(WebKit)
