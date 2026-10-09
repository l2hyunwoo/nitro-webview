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
  /// JSON result. `nil` and `NSNull` map to `"null"`.
  public func evaluate(
    code: String,
    in evaluator: JavaScriptEvaluator
  ) async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      evaluate(
        code: code, in: evaluator,
        resolve: { continuation.resume(returning: $0) },
        reject: { continuation.resume(throwing: $0) }
      )
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
      do {
        resolve(try Self.stringify(result))
      } catch {
        reject(error)
      }
    }
  }

  /// Encode WebKit's result without evaluating the supplied code again.
  internal static func stringify(_ value: Any?) throws -> String {
    let value = value ?? NSNull()
    guard JSONSerialization.isValidJSONObject([value]) else {
      throw NSError(domain: "NitroWebViewEvaluation", code: -1,
        userInfo: [NSLocalizedDescriptionKey: "JavaScript result is not JSON-compatible."])
    }
    let data = try JSONSerialization.data(
      withJSONObject: value, options: [.fragmentsAllowed]
    )
    return String(decoding: data, as: UTF8.self)
  }
}
