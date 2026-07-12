import XCTest

/// Tests for the cache-policy mapping helper in `ios/HybridNitroWebView.swift`
/// that maps the `cacheEnabled` settings prop to the
/// `URLRequest.cachePolicy` used for the next `source`-triggered navigation.
///
/// The production helper lives at the top level of
/// `ios/HybridNitroWebView.swift` as
/// `HybridNitroWebView.cachePolicy(forCacheEnabled:)`. As with every other
/// iOS unit test in this harness, the production class cannot be linked into
/// this SwiftPM macOS host harness because it transitively depends on
/// Nitro-generated bridge symbols (`HybridNitroWebViewSpec`, `NitroModules`)
/// that only resolve at CocoaPods install time. The probe below is a
/// byte-for-byte mirror of the production function; any future change in the
/// production helper must be ported here so the contract stays exercised.
///
/// Contract:
///   - `cacheEnabled == false` -> `.reloadIgnoringLocalCacheData` (bypass
///     the local cache).
///   - `cacheEnabled == true` -> `.useProtocolCachePolicy` (protocol default).
///   - `cacheEnabled == nil` (prop unset) -> `.useProtocolCachePolicy`
///     (leave the platform default untouched).
private enum CachePolicyProbe {
  static func cachePolicy(forCacheEnabled cacheEnabled: Bool?)
    -> URLRequest.CachePolicy {
    return cacheEnabled == false
      ? .reloadIgnoringLocalCacheData
      : .useProtocolCachePolicy
  }
}

final class HybridNitroWebViewCachePolicyTests: XCTestCase {

  func testCacheDisabledBypassesLocalCache() {
    XCTAssertEqual(
      CachePolicyProbe.cachePolicy(forCacheEnabled: false),
      .reloadIgnoringLocalCacheData
    )
  }

  func testCacheEnabledUsesProtocolDefault() {
    XCTAssertEqual(
      CachePolicyProbe.cachePolicy(forCacheEnabled: true),
      .useProtocolCachePolicy
    )
  }

  func testUnsetLeavesProtocolDefault() {
    XCTAssertEqual(
      CachePolicyProbe.cachePolicy(forCacheEnabled: nil),
      .useProtocolCachePolicy
    )
  }
}
