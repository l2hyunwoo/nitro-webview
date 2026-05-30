import Foundation

#if canImport(WebKit)
  import WebKit
#endif

/// Abstraction over `WKWebView.evaluateJavaScript(_:completionHandler:)`.
///
/// Named `evaluateJavaScriptPayload` (rather than `evaluateJavaScript`) to
/// avoid colliding with WKWebView's own method when WKWebView conforms.
public protocol JavaScriptEvaluator: AnyObject {
  func evaluateJavaScriptPayload(
    _ code: String,
    completionHandler: @escaping (Any?, Error?) -> Void
  )
}

#if canImport(WebKit)
  extension WKWebView: JavaScriptEvaluator {
    public func evaluateJavaScriptPayload(
      _ code: String,
      completionHandler: @escaping (Any?, Error?) -> Void
    ) {
      self.evaluateJavaScript(code, completionHandler: completionHandler)
    }
  }
#endif

/// Native handler for the `evaluateJavaScript` imperative method on iOS.
///
/// Mirrors the JS-side contract `evaluateJavaScript(code: string): Promise<string>`.
/// `WKWebView.evaluateJavaScript(_:completionHandler:)` is documented as
/// main-thread only; the handler does not add its own dispatch hop.
public final class NitroWebViewEvaluateJavaScriptHandler {
  public init() {}

  /// Evaluate `code` inside the supplied evaluator and resolve with the
  /// stringified result. `nil` JS results map to the empty string.
  public func evaluate(
    code: String,
    in evaluator: JavaScriptEvaluator
  ) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      evaluator.evaluateJavaScriptPayload(code) { result, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: Self.stringify(result))
      }
    }
  }

  /// Completion-handler variant for callers that cannot await (e.g. the
  /// Nitro promise-bridge sites that hand us a (resolve, reject) pair).
  public func evaluate(
    code: String,
    in evaluator: JavaScriptEvaluator,
    resolve: @escaping (String) -> Void,
    reject: @escaping (Error) -> Void
  ) {
    evaluator.evaluateJavaScriptPayload(code) { result, error in
      if let error = error {
        reject(error)
        return
      }
      resolve(Self.stringify(result))
    }
  }

  /// Stringify the raw `Any?` value WebKit delivers in the
  /// `evaluateJavaScript` completion handler.
  ///
  /// `NSNumber` and `Bool` are special-cased because `String(describing:)`
  /// on an `Any?` containing an `NSNumber` is toolchain-sensitive (some
  /// Foundation builds emit `"Optional(2)"`). Booleans map to lowercase
  /// `"true"`/`"false"` to match JavaScript's own `String(true)` semantics.
  internal static func stringify(_ value: Any?) -> String {
    guard let value = value else { return "" }
    if value is NSNull { return "" }
    if let s = value as? String { return s }
    if let s = value as? NSString { return s as String }
    if let n = value as? NSNumber {
      if CFGetTypeID(n) == CFBooleanGetTypeID() {
        return n.boolValue ? "true" : "false"
      }
      let cType = String(cString: n.objCType)
      if cType == "f" || cType == "d" {
        // Doubles that are exact integers stringify without `.0`
        // (mirrors JavaScript's `String(2.0) === "2"`).
        let d = n.doubleValue
        if d.truncatingRemainder(dividingBy: 1) == 0,
           d.isFinite,
           abs(d) < Double(Int64.max) {
          return String(Int64(d))
        }
        return String(d)
      }
      return n.stringValue
    }
    return String(describing: value)
  }
}
