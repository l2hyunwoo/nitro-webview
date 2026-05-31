import Foundation

/// Helper that takes a raw `Content-Disposition` HTTP header value and
/// returns the decoded filename, or `nil` when no filename is encoded in the
/// header.
///
/// The parser prefers the **RFC 5987** encoded form
///   `filename*=UTF-8''<percent-encoded>`
/// over the **RFC 2616 / 6266 §4.1** plain form
///   `filename="..."` or `filename=...`
/// because the encoded form is the only one that can losslessly carry
/// non-ASCII names. When both are present in the same header, RFC 6266
/// §4.3 requires user agents to honor `filename*` and ignore `filename` —
/// this implementation follows that rule.
///
/// Why this lives in a standalone file:
///   * The production `HybridNitroWebView` class transitively depends on
///     Nitro-generated bridge symbols (`HybridNitroWebViewSpec`,
///     `NitroModules`) that are only resolved at CocoaPods install time, so
///     it cannot be linked into the `swift test` macOS host harness.
///   * Extracting the filename parser keeps the rule set callable by both
///     the production code path (`HybridNitroWebView` — see
///     `fileDownload(from:contentDisposition:)`) and a host-side XCTest.
///
/// Reference grammar (RFC 6266 §4.1, RFC 5987 §3.2.1):
///
///   content-disposition := "Content-Disposition" ":" disposition-type
///                          *( ";" disposition-parm )
///   disposition-parm    := filename-parm | disp-ext-parm
///   filename-parm       := "filename" "=" value
///                        | "filename*" "=" ext-value
///   ext-value           := charset "'" [ language ] "'" value-chars
///   value-chars         := *( pct-encoded | attr-char )
///
/// Out-of-scope (deliberate, MVP):
///   * Non-UTF-8 charsets in `filename*` (ISO-8859-1, etc.) — RFC 5987 also
///     allows ISO-8859-1, but server-side practice has converged on UTF-8.
///     The parser returns `nil` for non-UTF-8 charsets rather than guessing.
///   * Per-parameter language tag preservation (the `[ language ]` segment).
///   * Quoted-printable encodings in the plain `filename=` form.
///   * Path components — callers must sanitize any directory traversal
///     (e.g. `..`) before persisting the result to disk.
public enum NitroWebViewContentDispositionParser {

  /// Top-level entry point. Returns the decoded filename, or `nil` when the
  /// header is absent, empty, or carries no parsable filename.
  ///
  /// Behavior summary:
  ///   * `nil`/empty input             → `nil`
  ///   * `filename*=UTF-8''…`          → percent-decoded UTF-8 value
  ///   * `filename="…"`                → unquoted value with backslash
  ///                                     escapes resolved
  ///   * `filename=…`                  → bare token value, percent-decoded
  ///                                     when it looks percent-encoded
  ///   * both forms present            → `filename*` wins (RFC 6266 §4.3)
  ///   * `filename*` with non-UTF-8    → fall back to `filename=` if any,
  ///     charset                         otherwise `nil`
  public static func parseFilename(from header: String?) -> String? {
    guard let header = header, !header.isEmpty else { return nil }

    let params = parseParameters(header)

    // RFC 6266 §4.3: when both `filename` and `filename*` are present, the
    // user agent SHOULD pick `filename*`. We do exactly that, and only fall
    // through to `filename` if the encoded form is missing or its charset is
    // one we deliberately refuse to guess at (anything but UTF-8).
    if let star = params["filename*"], let decoded = decodeRFC5987(star) {
      return decoded
    }
    if let plain = params["filename"] {
      return decodePlainFilename(plain)
    }
    return nil
  }

  // MARK: - Parameter extraction

  /// Split a `Content-Disposition` header into a `[name: rawValue]` map.
  /// The disposition type (`attachment` / `inline`) is dropped — only the
  /// parameters matter for filename extraction. Names are lowercased so
  /// lookups (`params["filename*"]`) are case-insensitive per RFC 7230 §3.2.
  ///
  /// The parser is intentionally permissive about whitespace and quoting:
  /// real-world servers emit headers with leading/trailing spaces around
  /// `=`, mixed casing, and inconsistent quoting. It is intentionally
  /// strict about semicolon boundaries — semicolons inside quoted strings
  /// do NOT terminate a parameter.
  private static func parseParameters(_ header: String) -> [String: String] {
    var result: [String: String] = [:]
    let tokens = splitOnSemicolonsRespectingQuotes(header)

    for raw in tokens {
      let token = raw.trimmingCharacters(in: .whitespaces)
      guard !token.isEmpty else { continue }
      guard let eq = token.firstIndex(of: "=") else { continue }
      let name = token[..<eq]
        .trimmingCharacters(in: .whitespaces)
        .lowercased()
      let value = String(token[token.index(after: eq)...])
        .trimmingCharacters(in: .whitespaces)
      guard !name.isEmpty else { continue }
      // Last-write-wins on duplicate parameter names — rare in practice but
      // makes the dictionary behavior unambiguous.
      result[name] = value
    }
    return result
  }

  /// Split on `;` boundaries, but only when the `;` is OUTSIDE a
  /// double-quoted string. Backslash escapes inside quotes are honored so
  /// `filename="weird\"name.bin"` doesn't terminate on the embedded quote.
  private static func splitOnSemicolonsRespectingQuotes(_ s: String) -> [String] {
    var parts: [String] = []
    var current = ""
    var inQuotes = false
    var escapeNext = false

    for ch in s {
      if escapeNext {
        current.append(ch)
        escapeNext = false
        continue
      }
      if ch == "\\" && inQuotes {
        // Preserve the escape so quote-stripping downstream can resolve it.
        current.append(ch)
        escapeNext = true
        continue
      }
      if ch == "\"" {
        inQuotes.toggle()
        current.append(ch)
        continue
      }
      if ch == ";" && !inQuotes {
        parts.append(current)
        current = ""
        continue
      }
      current.append(ch)
    }
    if !current.isEmpty { parts.append(current) }
    return parts
  }

  // MARK: - RFC 5987 (`filename*=UTF-8''…`)

  /// Decode an RFC 5987 `ext-value`. Returns `nil` for malformed input or
  /// for charsets other than UTF-8 (the MVP scope).
  ///
  /// Shape: `charset "'" [ language ] "'" value-chars`
  ///
  /// Example: `UTF-8''%E2%82%AC%20rates.txt` → `€ rates.txt`
  internal static func decodeRFC5987(_ raw: String) -> String? {
    let value = raw.trimmingCharacters(in: .whitespaces)
    // The encoded form is never quoted; if a server quoted it anyway, we
    // still tolerate it — strip the surrounding quotes before parsing.
    let unquoted = stripSurroundingQuotes(value)

    // Find the two single-quote delimiters that separate charset / language
    // / value. Both are required by RFC 5987 §3.2.1.
    guard let firstQuote = unquoted.firstIndex(of: "'") else { return nil }
    let afterFirst = unquoted.index(after: firstQuote)
    guard let secondQuote = unquoted[afterFirst...].firstIndex(of: "'") else {
      return nil
    }
    let charset = unquoted[..<firstQuote].lowercased()
    // language segment between the two quotes is allowed to be empty; we
    // discard it either way (out of MVP scope).
    let encoded = String(unquoted[unquoted.index(after: secondQuote)...])

    // MVP: only UTF-8 is honored. Returning nil here lets the caller fall
    // back to a `filename=` parameter if one exists.
    guard charset == "utf-8" else { return nil }

    return percentDecode(encoded)
  }

  /// Percent-decode a UTF-8 ext-value. We hand-roll this rather than relying
  /// on `removingPercentEncoding` because the latter is permissive about
  /// `+` (treating it as space, URL-form style) — RFC 5987 ext-values are
  /// strictly percent-encoded, so `+` must survive verbatim.
  internal static func percentDecode(_ s: String) -> String? {
    var bytes: [UInt8] = []
    var i = s.startIndex
    while i < s.endIndex {
      let ch = s[i]
      if ch == "%" {
        let hexStart = s.index(after: i)
        guard hexStart < s.endIndex else { return nil }
        let hexEnd = s.index(after: hexStart)
        guard hexEnd < s.endIndex else { return nil }
        let after = s.index(after: hexEnd)
        let hex = String(s[hexStart..<after])
        guard let byte = UInt8(hex, radix: 16) else { return nil }
        bytes.append(byte)
        i = after
        continue
      }
      // ext-value attr-chars are all ASCII; non-ASCII at this point is a
      // server bug, but we tolerate it by encoding through UTF-8.
      for b in String(ch).utf8 { bytes.append(b) }
      i = s.index(after: i)
    }
    return String(bytes: bytes, encoding: .utf8)
  }

  // MARK: - Plain `filename=…`

  /// Decode an RFC 6266 plain `filename` parameter value:
  ///   * surrounding double quotes are stripped,
  ///   * backslash-escapes inside the quoted form are resolved
  ///     (`"a\"b"` → `a"b`),
  ///   * percent-encoded sequences are decoded as UTF-8 when the value is
  ///     unquoted and all of its escapes resolve. This matches what many
  ///     real-world servers emit even though RFC 6266 only blesses
  ///     percent-encoding inside the `filename*` form — declining to decode
  ///     would surface `%E2%82%AC` to the JS layer for a plain
  ///     `filename=%E2%82%AC.txt` header.
  internal static func decodePlainFilename(_ raw: String) -> String? {
    let trimmed = raw.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return nil }
    let wasQuoted = trimmed.first == "\"" && trimmed.last == "\""
      && trimmed.count >= 2
    let core = wasQuoted
      ? resolveBackslashEscapes(String(trimmed.dropFirst().dropLast()))
      : trimmed
    if core.isEmpty { return nil }
    // For unquoted values, try a best-effort URL decode; if the decode
    // fails (e.g. malformed `%` sequence) keep the raw value rather than
    // returning nil — return a filename whenever one is present.
    if !wasQuoted, core.contains("%") {
      if let decoded = percentDecode(core) {
        return decoded
      }
    }
    return core
  }

  /// Resolve backslash-escapes inside a quoted-string body. Per RFC 7230
  /// §3.2.6, any `\X` inside a quoted string represents the literal `X`.
  private static func resolveBackslashEscapes(_ s: String) -> String {
    var out = ""
    var escaped = false
    for ch in s {
      if escaped {
        out.append(ch)
        escaped = false
        continue
      }
      if ch == "\\" {
        escaped = true
        continue
      }
      out.append(ch)
    }
    return out
  }

  /// Strip a single pair of surrounding double quotes if present.
  private static func stripSurroundingQuotes(_ s: String) -> String {
    guard s.count >= 2, s.first == "\"", s.last == "\"" else { return s }
    return String(s.dropFirst().dropLast())
  }
}
