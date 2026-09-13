import Foundation

#if canImport(WebKit)
  import WebKit
#endif

/// Mirror of the JS-side `LoadHtmlCommand`:
///
///     { type: 'loadHtml', html: string, baseUrl?: string }
public struct NitroLoadHtmlPayload: Equatable {
  public let html: String
  public let baseUrlString: String?

  public init(html: String, baseUrlString: String? = nil) {
    self.html = html
    self.baseUrlString = baseUrlString
  }
}

/// Abstraction over `WKWebView.loadHTMLString(_:baseURL:)`.
///
/// The method is named `loadHTMLStringPayload` to avoid colliding with
/// WKWebView's existing `loadHTMLString(_:baseURL:) -> WKNavigation?`, whose
/// concrete return type cannot satisfy a protocol witness directly.
public protocol WebViewHTMLLoader: AnyObject {
  func loadHTMLStringPayload(_ string: String, baseURL: URL?)
}

#if canImport(WebKit)
  extension WKWebView: WebViewHTMLLoader {
    public func loadHTMLStringPayload(_ string: String, baseURL: URL?) {
      _ = self.loadHTMLString(string, baseURL: baseURL)
    }
  }
#endif

/// Native handler for the `loadHtml` command on iOS.
///
/// When the JS side omits `baseUrl` we pass `nil` through verbatim rather
/// than substituting `about:blank`; that policy belongs in the HybridView
/// wrapper, not in this dispatch primitive.
public final class NitroWebViewSourceHandler {
  public init() {}

  /// Builds the request used by the actual WKWebView load path.
  public static func makeRequest(
    uri: String, method: String? = nil, body: String? = nil,
    headers: [String: String] = [:],
    cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
  ) throws -> URLRequest {
    let method = method ?? "GET"
    func invalid(_ message: String) -> NSError {
      NSError(domain: "NitroWebViewSource", code: -1,
              userInfo: [NSLocalizedDescriptionKey: message])
    }
    guard method == "GET" || method == "POST" else {
      throw invalid("source.method must be GET or POST")
    }
    guard method == "POST" || body == nil else {
      throw invalid("source.body requires POST")
    }
    guard let url = URL(string: uri) else { throw invalid("Invalid source URI") }
    if method == "POST" && !["http", "https"].contains(url.scheme?.lowercased() ?? "") {
      throw invalid("POST requires an HTTP(S) URI")
    }
    var request = URLRequest(url: url, cachePolicy: cachePolicy)
    request.httpMethod = method
    if method == "POST" { request.httpBody = Data((body ?? "").utf8) }
    for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
    return request
  }

  /// Apply a normalised HTML payload to the given WebView.
  public func applyHtmlPayload(
    _ payload: NitroLoadHtmlPayload,
    to webView: WebViewHTMLLoader
  ) {
    let baseURL = Self.parseBaseURL(payload.baseUrlString)
    webView.loadHTMLStringPayload(payload.html, baseURL: baseURL)
  }

  /// Parse a `baseUrl` string from the JS bridge into a `URL?`.
  /// Empty or nil input returns `nil` to match RN-WebView's fallback semantics.
  internal static func parseBaseURL(_ raw: String?) -> URL? {
    guard let raw = raw, !raw.isEmpty else { return nil }
    return URL(string: raw)
  }
}
