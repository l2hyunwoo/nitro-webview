import Foundation

/// Cookie filtering helpers extracted from `HybridNitroWebView` so they can
/// be exercised by `swift test` on the macOS host. The production
/// `HybridNitroWebView` cannot itself be linked into the SwiftPM harness
/// because it depends on Nitro-generated bridge code that only resolves at
/// CocoaPods install time. By living in this independent file the filter
/// rules are testable with real `HTTPCookie` instances rather than via a
/// structural probe.
///
/// `getCookies(url)` returns only cookies that satisfy ALL of:
///   1. host match  — the cookie's domain matches the URL host using the
///                    same scoping rules browsers apply (exact match,
///                    leading-dot suffix, or unprefixed parent-domain
///                    suffix).
///   2. path prefix — the URL's path is a prefix of the cookie's path,
///                    using `/`-aware boundary checks so `/foo` cookies
///                    never leak into `/foobar` requests.
///   3. secure flag — secure cookies are excluded for non-HTTPS URLs.
///
/// Helpers are namespaced under an enum so they can be invoked without
/// instantiating any type and remain trivially equivalent to the static
/// methods callers expect on `HybridNitroWebView`.
public enum NitroWebViewCookieFilter {

  /// Decomposed URL pieces the filter rules operate on. Built once per
  /// `getCookies(url:)` call to keep per-cookie checks allocation-free.
  public struct UrlScope: Equatable {
    public let host: String?
    public let path: String
    public let isSecure: Bool

    public init(host: String?, path: String, isSecure: Bool) {
      // Hosts are matched case-insensitively per RFC 6265 §5.1.2.
      self.host = host?.lowercased()
      // Normalise to a single canonical "/" when the URL has an empty path
      // so the path-prefix test never has to special-case the root request.
      self.path = path.isEmpty ? "/" : path
      self.isSecure = isSecure
    }
  }

  /// Parse a raw URL string into a `UrlScope`. Returns a scope whose host is
  /// `nil` when the URL is unparseable or hostless; in that case the host
  /// rule degrades to "match anything" so the filter never silently swallows
  /// the entire cookie list on a malformed input — the path/secure rules
  /// still apply.
  public static func urlScope(forUrl raw: String) -> UrlScope {
    guard let url = URL(string: raw) else {
      return UrlScope(host: nil, path: "/", isSecure: false)
    }
    let scheme = (url.scheme ?? "").lowercased()
    return UrlScope(
      host: url.host,
      path: url.path,
      isSecure: scheme == "https" || scheme == "wss"
    )
  }

  /// Top-level filter: returns true iff the cookie matches host AND path
  /// AND secure rules for the given URL scope.
  public static func cookieMatches(
    _ cookie: HTTPCookie,
    scope: UrlScope
  ) -> Bool {
    guard hostMatches(cookieDomain: cookie.domain, host: scope.host) else {
      return false
    }
    guard pathMatches(cookiePath: cookie.path, urlPath: scope.path) else {
      return false
    }
    guard secureMatches(cookieIsSecure: cookie.isSecure, urlIsSecure: scope.isSecure) else {
      return false
    }
    return true
  }

  /// Match the cookie's domain against the URL's host the same way browsers
  /// scope cookies (RFC 6265 §5.1.3):
  ///   * exact host match (case-insensitive),
  ///   * leading-dot domain (`.example.com`) — matches the bare domain and
  ///     any subdomain,
  ///   * un-prefixed parent domain (`example.com`) — matches subdomains via
  ///     a `.example.com` suffix.
  /// When the URL has no host (e.g. unparseable input) we treat host match
  /// as a no-op so the path/secure checks remain the binding constraints.
  public static func hostMatches(cookieDomain: String, host: String?) -> Bool {
    guard let host = host?.lowercased() else { return true }
    let domain = cookieDomain.lowercased()
    if domain.isEmpty { return true }
    if domain == host { return true }
    if domain.hasPrefix(".") {
      let bare = String(domain.dropFirst())
      if bare.isEmpty { return false }
      return host == bare || host.hasSuffix(domain)
    }
    return host.hasSuffix("." + domain)
  }

  /// RFC 6265 §5.1.4 path-match: the URL's path matches the cookie's path
  /// when:
  ///   * the cookie path equals the URL path,
  ///   * the cookie path is a prefix of the URL path AND ends with `/`, or
  ///   * the cookie path is a prefix of the URL path AND the URL path's
  ///     next character is `/` (so cookie `/foo` does not leak to URL
  ///     `/foobar`, but does match `/foo/bar`).
  /// Empty cookie paths default to `/`, matching the browser fallback.
  public static func pathMatches(cookiePath: String, urlPath: String) -> Bool {
    let cookie = cookiePath.isEmpty ? "/" : cookiePath
    let url = urlPath.isEmpty ? "/" : urlPath
    if cookie == url { return true }
    if !url.hasPrefix(cookie) { return false }
    if cookie.hasSuffix("/") { return true }
    // url starts with cookie and is strictly longer; verify the boundary
    // character is `/` so `/foo` does not match `/foobar`.
    let nextIndex = url.index(url.startIndex, offsetBy: cookie.count)
    return url[nextIndex] == "/"
  }

  /// A secure cookie may only be returned for a secure (HTTPS / WSS) URL.
  /// Non-secure cookies are always allowed.
  public static func secureMatches(cookieIsSecure: Bool, urlIsSecure: Bool) -> Bool {
    if !cookieIsSecure { return true }
    return urlIsSecure
  }
}
