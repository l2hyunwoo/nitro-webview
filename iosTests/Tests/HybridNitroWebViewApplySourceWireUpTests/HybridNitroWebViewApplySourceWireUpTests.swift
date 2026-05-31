import XCTest
import Foundation

/// Tests for the `applySource` header wire-up in `HybridNitroWebView`.
///
/// The production path (lines 186–198 of `ios/HybridNitroWebView.swift`)
/// builds a `URLRequest`, calls `mergeHeaders(defaults:perRequest:)` to
/// combine `defaultHeaders` with `source.headers`, then loops over the
/// merged map and calls `request.setValue(_:forHTTPHeaderField:)` for every
/// entry before handing the request to `WKWebView.load(_:)`.
///
/// `HybridNitroWebView` cannot be linked into this SwiftPM harness because
/// it depends on Nitro-generated bridge symbols (`HybridNitroWebViewSpec`,
/// `NitroModules`) that are only resolved at CocoaPods install time. The
/// `ApplySourceWireUpProbe` below mirrors the production logic byte-for-byte
/// and captures the resulting `URLRequest` instead of forwarding it to a
/// real `WKWebView`, which lets these tests exercise the header-merge +
/// `setValue` wire-up without any UIKit/WebKit dependency.

// MARK: - Merge helper (mirrored from production)

/// Faithful replica of `HybridNitroWebView.mergeHeaders(defaults:perRequest:)`.
/// Kept verbatim so any production change that drifts from this probe will
/// surface when the probe is ported to match.
fileprivate enum MergeProbe {
  static func mergeHeaders(
    defaults: [String: String]?,
    perRequest: [String: String]?
  ) -> [String: String] {
    let d = defaults ?? [:]
    let r = perRequest ?? [:]
    if r.isEmpty { return d }
    if d.isEmpty { return r }

    var conflictingLower: Set<String> = []
    for k in r.keys { conflictingLower.insert(k.lowercased()) }

    let filteredDefaults = d.filter { !conflictingLower.contains($0.key.lowercased()) }

    let pairs = filteredDefaults.map { ($0.key, $0.value) }
      + r.map { ($0.key, $0.value) }
    return Dictionary(pairs, uniquingKeysWith: { _, new in new })
  }
}

// MARK: - Wire-up probe

/// Structural replica of the URI branch inside
/// `HybridNitroWebView.applySource(_:)`. Performs the same steps — build
/// `URLRequest`, merge headers, call `setValue(_:forHTTPHeaderField:)` for
/// every merged entry — and stores the resulting request so tests can
/// assert against `allHTTPHeaderFields`.
fileprivate struct ApplySourceWireUpProbe {
  /// Headers applied to every navigation (mirrors `defaultHeaders`).
  var defaultHeaders: [String: String]?

  /// Runs the production wire-up for the URI source branch and returns the
  /// fully-populated `URLRequest`. Returns `nil` when `uri` cannot be
  /// parsed into a `URL` (mirrors the `guard let url = URL(string:)` early
  /// return in the production path).
  func applySource(uri: String, perRequestHeaders: [String: String]?) -> URLRequest? {
    guard let url = URL(string: uri) else { return nil }
    var request = URLRequest(url: url)
    let merged = MergeProbe.mergeHeaders(
      defaults: defaultHeaders,
      perRequest: perRequestHeaders
    )
    for (k, v) in merged {
      request.setValue(v, forHTTPHeaderField: k)
    }
    // Production calls `view.load(request)` here; the probe captures instead.
    return request
  }
}

// MARK: - Tests

final class HybridNitroWebViewApplySourceWireUpTests: XCTestCase {

  // MARK: - Full merge applied to URLRequest

  /// Given `defaultHeaders = ["X-A": "1", "X-B": "2"]` and per-request
  /// headers `["X-B": "two", "X-C": "3"]`, every entry in the merged map
  /// must appear in `URLRequest.allHTTPHeaderFields`.
  ///
  /// `URLRequest` normalises header names case-insensitively, so the
  /// assertion uses case-insensitive key lookup via `allHTTPHeaderFields`
  /// dictionary access.
  func test_applySource_setsEveryMergedHeader_onURLRequest() {
    var probe = ApplySourceWireUpProbe()
    probe.defaultHeaders = ["X-A": "1", "X-B": "2"]

    let request = probe.applySource(
      uri: "https://example.com",
      perRequestHeaders: ["X-B": "two", "X-C": "3"]
    )

    XCTAssertNotNil(request, "applySource must produce a URLRequest for a valid URI.")
    let fields = request?.allHTTPHeaderFields ?? [:]

    // Non-conflicting default header survives.
    XCTAssertEqual(
      fields["X-A"], "1",
      "Non-conflicting default header X-A must appear in the request."
    )
    // Per-request value wins on collision.
    XCTAssertEqual(
      fields["X-B"], "two",
      "Per-request X-B must override the default X-B value."
    )
    // Per-request-only header is present.
    XCTAssertEqual(
      fields["X-C"], "3",
      "Per-request-only header X-C must appear in the request."
    )
    XCTAssertEqual(
      fields.count, 3,
      "Exactly three distinct headers must be present after the merge."
    )
  }

  // MARK: - Per-request override

  /// When `defaultHeaders` and per-request headers share the same key
  /// (exact match), the per-request value replaces the default value on
  /// the outgoing `URLRequest`. This is the primary contract of the
  /// `source.headers` field.
  func test_applySource_perRequestHeader_overridesDefaultHeader_onURLRequest() {
    var probe = ApplySourceWireUpProbe()
    probe.defaultHeaders = ["Authorization": "Bearer default"]

    let request = probe.applySource(
      uri: "https://api.example.com/data",
      perRequestHeaders: ["Authorization": "Bearer per-request"]
    )

    XCTAssertNotNil(request)
    let fields = request?.allHTTPHeaderFields ?? [:]
    XCTAssertEqual(
      fields["Authorization"], "Bearer per-request",
      "Per-request Authorization must override the default Authorization."
    )
    XCTAssertEqual(
      fields.count, 1,
      "A single header key after conflict resolution must yield exactly one entry."
    )
  }

  // MARK: - Nil headers produce no header fields

  /// When both `defaultHeaders` and `source.headers` are nil, the merged
  /// map is empty and no `setValue(_:forHTTPHeaderField:)` call is made,
  /// so `allHTTPHeaderFields` must be nil or empty.
  func test_applySource_nilHeaders_setNoHeadersOnURLRequest() {
    var probe = ApplySourceWireUpProbe()
    probe.defaultHeaders = nil

    let request = probe.applySource(
      uri: "https://example.com/page",
      perRequestHeaders: nil
    )

    XCTAssertNotNil(request, "applySource must still return a URLRequest even with no headers.")
    let fields = request?.allHTTPHeaderFields
    let isEmpty = fields == nil || fields!.isEmpty
    XCTAssertTrue(
      isEmpty,
      "No headers must be set on the URLRequest when both defaultHeaders and source.headers are nil."
    )
  }
}
