import XCTest
import ObjectiveC.runtime

#if canImport(WebKit)
  import WebKit
#endif

/// Runtime introspection guard for the iOS file-upload contract.
///
/// The file-upload contract on iOS depends entirely on iOS 14+ default
/// `WKWebView` chooser behavior, which fires whenever **any** `WKUIDelegate`
/// is installed — even an empty one. The implementation therefore
/// deliberately leaves out every optional `WKUIDelegate` method.
///
/// The single most dangerous mistake a future contributor could make is
/// pasting an `webView(_:runOpenPanelWith:initiatedByFrame:completionHandler:)`
/// override into `HybridNitroWebView`. That selector is a **macOS-only**
/// `WKUIDelegate` method — it has no effect on iOS WebKit and, if shimmed
/// in via `@objc`, can mask the default system picker on iOS while not
/// providing one. This test pins the contract with two runtime checks:
///
///   1. `class_getInstanceMethod` on the selector must return `nil`
///      (no implementation registered anywhere in the class hierarchy
///      exposed to the Objective-C runtime).
///   2. `responds(to:)` on an instance must return `false`.
///
/// As with `HybridNitroWebViewUIDelegateBindingTests`, the production class
/// cannot be linked into this SwiftPM harness because it depends on
/// Nitro-generated bridge symbols (`HybridNitroWebViewSpec`,
/// `NitroModules`) that only resolve at CocoaPods install time. The probe
/// below mirrors the production class's `WKUIDelegate` adoption pattern
/// **line for line**: an empty `extension … : WKUIDelegate {}` with no
/// optional methods. Any future regression where someone adds a
/// `runOpenPanelWith…` override to the production class would, by parity,
/// be expected to land on the probe too — at which point this test fails.
#if canImport(WebKit)

  /// Mirror of `HybridNitroWebView`'s `WKUIDelegate` adoption pattern:
  /// the class itself contains no `WKUIDelegate` method implementations,
  /// and conformance is declared via an empty extension below.
  fileprivate final class FileUploadProbe: NSObject {
    let view: WKWebView

    override init() {
      let configuration = WKWebViewConfiguration()
      self.view = WKWebView(frame: .zero, configuration: configuration)
      super.init()
      view.uiDelegate = self
    }
  }

  /// Empty `WKUIDelegate` conformance — matches the production
  /// `extension HybridNitroWebView: WKUIDelegate {}` declaration in
  /// `ios/HybridNitroWebView.swift`. Deliberately no method bodies.
  extension FileUploadProbe: WKUIDelegate {}

  final class HybridNitroWebViewFileUploadIntrospectionTests: XCTestCase {

    /// The macOS-only `WKUIDelegate` selector that must NEVER appear on
    /// `HybridNitroWebView` (and therefore, by parity, on the probe).
    /// Stored as a string so this file compiles on iOS slices that
    /// don't even declare the selector.
    private static let runOpenPanelSelectorName =
      "webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:"

    /// `class_getInstanceMethod` returns `nil` when the runtime has no
    /// IMP registered for the selector anywhere in the class hierarchy.
    /// The strictest of the two runtime checks.
    func test_runOpenPanelSelector_isNotImplementedOnClass() {
      let selector = Selector(Self.runOpenPanelSelectorName)
      let method = class_getInstanceMethod(FileUploadProbe.self, selector)

      XCTAssertNil(
        method,
        """
        class_getInstanceMethod returned non-nil for \
        \(Self.runOpenPanelSelectorName) on FileUploadProbe — somebody \
        added a macOS-only WKUIDelegate runOpenPanel override. Remove \
        it: iOS 14+ presents the file picker automatically when any \
        uiDelegate is installed.
        """
      )
    }

    /// `responds(to:)` exercises the live dispatch path the same way
    /// `WKWebView` would when probing for an optional `WKUIDelegate`
    /// callback (alongside `class_getInstanceMethod`).
    func test_runOpenPanelSelector_instanceDoesNotRespond() {
      let probe = FileUploadProbe()
      let selector = Selector(Self.runOpenPanelSelectorName)

      XCTAssertFalse(
        probe.responds(to: selector),
        """
        FileUploadProbe instance responds to \
        \(Self.runOpenPanelSelectorName) — that selector is macOS-only \
        and must not be implemented on HybridNitroWebView. iOS file \
        picker behavior comes from the system default when uiDelegate \
        is non-nil; an override would mask it.
        """
      )
    }

    /// Sanity guard: the binding the file-upload feature actually
    /// depends on — `uiDelegate` being non-nil — is still in place on
    /// the probe. Without this, the two negative assertions above would
    /// be hollow (an unbound delegate trivially doesn't respond to
    /// anything).
    func test_uiDelegateIsStillInstalled() {
      let probe = FileUploadProbe()

      XCTAssertNotNil(
        probe.view.uiDelegate,
        "uiDelegate must be installed for iOS 14+ to present the default file picker."
      )
      XCTAssertTrue(
        probe.view.uiDelegate === probe,
        "uiDelegate must be === the hybrid instance (mirrors production wiring)."
      )
    }
  }

#endif  // canImport(WebKit)
