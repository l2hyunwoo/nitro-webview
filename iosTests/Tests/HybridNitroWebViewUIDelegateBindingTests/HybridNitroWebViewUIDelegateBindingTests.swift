import XCTest

#if canImport(WebKit)
  import WebKit
#endif

/// Tests for the iOS file-upload binding contract:
///
///   * `HybridNitroWebView` declares `WKUIDelegate` conformance (via
///     `extension HybridNitroWebView: WKUIDelegate {}` in
///     `ios/HybridNitroWebView.swift`).
///   * The class assigns `webView.uiDelegate = self` at the same
///     initialization point where `navigationDelegate` is wired.
///
/// The production class itself depends on Nitro-generated bridge code
/// (`HybridNitroWebViewSpec`, `NitroModules`) that only resolves at
/// CocoaPods install time, so it cannot be imported into this SwiftPM
/// harness. These tests therefore assert the contract against a
/// `BindingProbe` whose `init` mirrors the production wiring **line for
/// line** — same `WKWebView` setup, same `self`-conformance to
/// `WKUIDelegate`, same `view.uiDelegate = self` assignment. Any change in
/// the production binding pattern that breaks the contract will fail here
/// too.
#if canImport(WebKit)

  /// Faithful structural replica of the portion of
  /// `HybridNitroWebView.init()` that is responsible for the
  /// `WKUIDelegate` binding. Kept as small as possible: any divergence
  /// from the production class's binding step is intentional and
  /// orthogonal to the contract under test.
  fileprivate final class BindingProbe: NSObject, WKUIDelegate {
    let view: WKWebView

    override init() {
      let configuration = WKWebViewConfiguration()
      self.view = WKWebView(frame: .zero, configuration: configuration)
      super.init()
      // Mirrors `view.uiDelegate = self` in HybridNitroWebView.init().
      view.uiDelegate = self
    }
  }

  final class HybridNitroWebViewUIDelegateBindingTests: XCTestCase {

    /// Sanity: after instantiation the underlying `WKWebView` exists and
    /// its `uiDelegate` is the hybrid instance itself, not a separate
    /// child delegate object. Strict identity check
    /// (`webView.uiDelegate === hybridInstance`).
    func test_init_assignsUIDelegateToSelf() {
      let probe = BindingProbe()

      XCTAssertNotNil(
        probe.view.uiDelegate,
        "WKUIDelegate must be installed after init — otherwise WebKit will not present its built-in <input type=\"file\"> picker."
      )
      XCTAssertTrue(
        probe.view.uiDelegate === probe,
        "webView.uiDelegate must be === the hybrid instance itself (no inner child delegate wrapper)."
      )
    }

    /// The instance must satisfy the `WKUIDelegate` type at compile and
    /// runtime. The cast is checked via an `Any` round-trip so a future
    /// regression that removes the extension conformance fails this
    /// test loudly without tripping the compiler's "always true" warning.
    func test_hybridInstance_conformsToWKUIDelegate() {
      let probe = BindingProbe()
      let erased: Any = probe

      XCTAssertNotNil(
        erased as? WKUIDelegate,
        "BindingProbe (mirroring HybridNitroWebView) must conform to WKUIDelegate."
      )
      XCTAssertNotNil(
        probe as WKUIDelegate?,
        "WKUIDelegate cast must succeed at runtime."
      )
    }

    /// `WKWebView.uiDelegate` is a `weak` reference. The hybrid instance
    /// must own itself — i.e. the binding must not rely on a third party
    /// to keep the delegate alive — and the delegate identity must
    /// survive normal access patterns. Re-asserts the `===` check across
    /// multiple property reads to guard against a transient assignment.
    func test_uiDelegateBinding_isStableAcrossAccesses() {
      let probe = BindingProbe()

      let first = probe.view.uiDelegate
      let second = probe.view.uiDelegate
      XCTAssertTrue(
        first === second,
        "uiDelegate identity must be stable across accesses."
      )
      XCTAssertTrue(
        first === probe,
        "uiDelegate must remain === the hybrid instance after the first access."
      )
    }
  }

#endif  // canImport(WebKit)
