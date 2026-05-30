import Foundation

/// Mirror of the JS-side `WebViewErrorEvent.nativeEvent`:
///
///     { code: number, description: string, url: string, domain: string }
///
/// Equatable so tests can compare expected vs actual with a per-field diff.
public struct NitroWebViewErrorEvent: Equatable {
  public let code: Int
  public let description: String
  public let url: String
  public let domain: String

  public init(code: Int, description: String, url: String, domain: String) {
    self.code = code
    self.description = description
    self.url = url
    self.domain = domain
  }
}

/// Pure-function mapper from `NSError` (as delivered by WKNavigationDelegate's
/// `didFailNavigation` / `didFailProvisionalNavigation`) into the structured
/// `NitroWebViewErrorEvent` that the JS-side `onError` callback expects.
public enum NitroWebViewErrorMapper {

  /// Map an `NSError` from a WKNavigationDelegate failure callback into a
  /// `NitroWebViewErrorEvent`.
  ///
  /// - Parameters:
  ///   - error: The `NSError` WebKit handed the delegate.
  ///   - fallbackUrl: The URL the delegate believed it was loading at the
  ///     moment of failure. Used when the `NSError`'s `userInfo` does NOT
  ///     contain a failing-URL key (e.g. some WebKitErrorDomain errors).
  public static func event(
    from error: NSError,
    fallbackUrl: String? = nil
  ) -> NitroWebViewErrorEvent {
    let code = error.code
    let domain = error.domain

    // Defensive coercion: the Obj-C bridge can hand back NSNull for
    // `localizedDescription` in pathological cases.
    let description = (error.userInfo[NSLocalizedDescriptionKey] as? String)
      ?? error.localizedDescription

    let url = extractFailingURL(from: error, fallbackUrl: fallbackUrl)

    return NitroWebViewErrorEvent(
      code: code,
      description: description,
      url: url,
      domain: domain
    )
  }

  /// Resolution order — first hit wins:
  ///   1. `userInfo[NSURLErrorFailingURLStringErrorKey]` (String)
  ///   2. `userInfo[NSURLErrorFailingURLErrorKey]` (URL -> `absoluteString`)
  ///   3. `fallbackUrl` argument supplied by the delegate call
  ///   4. `""` (preserves JS contract `url: string`)
  internal static func extractFailingURL(
    from error: NSError,
    fallbackUrl: String?
  ) -> String {
    if let raw = error.userInfo[NSURLErrorFailingURLStringErrorKey] as? String {
      return raw
    }
    if let url = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL {
      return url.absoluteString
    }
    if let fallback = fallbackUrl {
      return fallback
    }
    return ""
  }
}
