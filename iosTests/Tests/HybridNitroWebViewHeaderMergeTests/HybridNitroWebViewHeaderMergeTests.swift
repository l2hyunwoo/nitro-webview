import XCTest

/// Tests for the iOS Swift header merge function that merges
/// `defaultHeaders` and `source.headers` using
/// `Dictionary(_:uniquingKeysWith:)` with last-wins semantics for
/// `source.headers`.
///
/// The production implementation lives in
/// `ios/HybridNitroWebView.swift` as `HybridNitroWebView.mergeHeaders(
/// defaults:perRequest:)`. As with the UIDelegate and FileUpload tests,
/// the production class itself cannot be linked into this SwiftPM harness
/// because it depends on Nitro-generated bridge symbols
/// (`HybridNitroWebViewSpec`, `NitroModules`) that only resolve at
/// CocoaPods install time. The probe below is a **byte-for-byte mirror**
/// of the production `mergeHeaders` function. Any future change in the
/// production logic must be ported to this probe for the contract to
/// keep being exercised.
///
/// Coverage:
///   * Per-request keys override defaultHeaders on exact-key collision.
///   * Case-insensitive collision is honored (iOS divergence from
///     Android).
///   * Non-conflicting keys from both maps survive in the union.
///   * Empty / nil edge cases short-circuit to the other input.
///   * The Swift `Dictionary(_:uniquingKeysWith:)` resolver is
///     last-wins (`{ _, new in new }`) — pinned by a direct test against
///     the same initializer below.

/// Faithful mirror of the production `mergeHeaders` static function.
/// Kept verbatim so any divergence in the production class will be
/// reflected here when the change is ported over.
fileprivate enum HeaderMergeProbe {
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

final class HybridNitroWebViewHeaderMergeTests: XCTestCase {

  // MARK: - Headline override

  /// When `defaults` and `perRequest` both supply a value for the same
  /// key, the per-request (source.headers) value wins and is the one
  /// that appears in the merged output.
  func test_sourceHeaders_overrideDefaultHeaders_onDuplicateKeys() {
    let defaults = [
      "Authorization": "Bearer default-token",
      "X-Tenant": "default-tenant",
    ]
    let perRequest = [
      "Authorization": "Bearer per-request-token",
      "X-Tenant": "per-request-tenant",
    ]

    let merged = HeaderMergeProbe.mergeHeaders(
      defaults: defaults,
      perRequest: perRequest
    )

    XCTAssertEqual(
      merged["Authorization"],
      "Bearer per-request-token",
      "source.headers value must override defaultHeaders value on duplicate key (Authorization)."
    )
    XCTAssertEqual(
      merged["X-Tenant"],
      "per-request-tenant",
      "source.headers value must override defaultHeaders value on duplicate key (X-Tenant)."
    )
  }

  // MARK: - Case-insensitive collision (iOS production contract)

  /// iOS treats HTTP header names as case-insensitive (this matches the
  /// `URLRequest.setValue(_:forHTTPHeaderField:)` contract). When the
  /// keys differ only in casing, the per-request casing wins and the
  /// default-cased duplicate is dropped from the output. Documented on
  /// `mergeHeaders`.
  func test_caseInsensitiveCollision_perRequestKeyAndValueSurvive() {
    let defaults = ["Authorization": "default"]
    let perRequest = ["authorization": "from-source"]

    let merged = HeaderMergeProbe.mergeHeaders(
      defaults: defaults,
      perRequest: perRequest
    )

    XCTAssertEqual(merged["authorization"], "from-source")
    XCTAssertNil(
      merged["Authorization"],
      "default casing of a colliding header key must not survive in the merged output."
    )
    XCTAssertEqual(
      merged.count, 1,
      "case-insensitive collision must produce exactly one entry, not two."
    )
  }

  // MARK: - Union of non-conflicting keys

  /// Non-conflicting keys from both maps must appear in the union. This
  /// is the "additive" half of the merge contract.
  func test_nonConflictingKeys_fromBothMaps_appearInUnion() {
    let defaults = ["X-Default-Only": "d-value"]
    let perRequest = ["X-PerRequest-Only": "r-value"]

    let merged = HeaderMergeProbe.mergeHeaders(
      defaults: defaults,
      perRequest: perRequest
    )

    XCTAssertEqual(merged["X-Default-Only"], "d-value")
    XCTAssertEqual(merged["X-PerRequest-Only"], "r-value")
    XCTAssertEqual(merged.count, 2)
  }

  // MARK: - Edge cases: nil / empty inputs

  /// `defaults == nil` => the result is just `perRequest`.
  func test_nilDefaults_returnsPerRequestOnly() {
    let perRequest = ["X-A": "1"]
    let merged = HeaderMergeProbe.mergeHeaders(defaults: nil, perRequest: perRequest)
    XCTAssertEqual(merged, perRequest)
  }

  /// `perRequest == nil` => the result is just `defaults`.
  func test_nilPerRequest_returnsDefaultsOnly() {
    let defaults = ["X-B": "2"]
    let merged = HeaderMergeProbe.mergeHeaders(defaults: defaults, perRequest: nil)
    XCTAssertEqual(merged, defaults)
  }

  /// Both `nil` => empty result.
  func test_bothNil_returnsEmpty() {
    XCTAssertTrue(
      HeaderMergeProbe.mergeHeaders(defaults: nil, perRequest: nil).isEmpty
    )
  }

  /// Empty `perRequest` => fast-path returns `defaults` unchanged.
  func test_emptyPerRequest_returnsDefaultsUnchanged() {
    let defaults = ["X-C": "3", "X-D": "4"]
    let merged = HeaderMergeProbe.mergeHeaders(defaults: defaults, perRequest: [:])
    XCTAssertEqual(merged, defaults)
  }

  /// Empty `defaults` => fast-path returns `perRequest` unchanged.
  func test_emptyDefaults_returnsPerRequestUnchanged() {
    let perRequest = ["X-E": "5"]
    let merged = HeaderMergeProbe.mergeHeaders(defaults: [:], perRequest: perRequest)
    XCTAssertEqual(merged, perRequest)
  }

  // MARK: - Dictionary(_:uniquingKeysWith:) resolver pin

  /// Direct pin on the Swift API contract. `Dictionary(_:uniquingKeysWith:)`
  /// invokes the resolver in `(old, new)` order, and our policy is to
  /// always return `new`. Verifying this against the standard-library
  /// initializer guarantees the resolver argument we pass in
  /// `HybridNitroWebView.mergeHeaders` carries the documented
  /// "source.headers wins" semantics.
  func test_dictionaryUniquingKeysWith_lastWinsResolver_returnsNewValue() {
    let pairs = [("k", "old"), ("k", "new")]
    let resolved = Dictionary(pairs, uniquingKeysWith: { _, new in new })
    XCTAssertEqual(
      resolved["k"], "new",
      "Dictionary(_:uniquingKeysWith:) with `{ _, new in new }` must keep the rightmost value — this is the kernel of the source.headers-wins contract."
    )
  }

  /// Companion sanity check: the merged map keeps the per-request entry
  /// even when the *value* on the default side is non-empty / non-nil —
  /// the override is unconditional, not "only when source.headers value
  /// is non-empty". This guards against a regression where an empty
  /// per-request value gets filtered out.
  func test_emptyPerRequestValue_stillOverridesDefault() {
    let defaults = ["X-Token": "real-default"]
    let perRequest = ["X-Token": ""]

    let merged = HeaderMergeProbe.mergeHeaders(
      defaults: defaults,
      perRequest: perRequest
    )

    XCTAssertEqual(
      merged["X-Token"], "",
      "An empty per-request value still overrides the default — override is by-key, not by-value-truthiness."
    )
  }
}
