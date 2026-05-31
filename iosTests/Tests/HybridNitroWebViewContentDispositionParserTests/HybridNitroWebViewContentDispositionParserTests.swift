import XCTest

@testable import NitroWebViewSource

/// `Content-Disposition` filename parsing tests covering four cases:
///
///   1. RFC 5987 encoded `filename*=UTF-8''<percent-encoded>`
///   2. Quoted plain `filename="..."`
///   3. Unquoted plain `filename=...`
///   4. Missing filename (header present, no `filename` parameter at all)
///
/// The production parser lives in
/// `ios/NitroWebViewContentDispositionParser.swift` and is re-exposed as a
/// static helper on `HybridNitroWebView` via
/// `HybridNitroWebView.parseContentDispositionFilename(_:)`. The hybrid
/// class itself cannot be linked into the SwiftPM macOS host harness
/// (Nitro-generated bridge symbols), so the tests call the standalone
/// parser directly — that is the same call path the hybrid class uses
/// internally, so the assertions land on the same code.
final class HybridNitroWebViewContentDispositionParserTests: XCTestCase {

  // MARK: - Case 1: RFC 5987 encoded `filename*`

  /// RFC 5987 ext-value with UTF-8 charset and a percent-encoded body.
  /// The Euro sign U+20AC encodes as the byte sequence E2 82 AC, hence
  /// `%E2%82%AC` in the header. The parser must percent-decode the
  /// bytes and re-assemble them as UTF-8.
  func test_rfc5987_encoded_decodesUtf8PercentEscapes() {
    let header = "attachment; filename*=UTF-8''%E2%82%AC%20rates.txt"
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "€ rates.txt")
  }

  /// RFC 6266 §4.3: when both `filename` and `filename*` are present, the
  /// encoded form wins. Without this pin, a regression could silently
  /// return the ASCII fallback even when a non-ASCII encoded name is
  /// available.
  func test_rfc5987_encodedFormWinsOverPlainFormWhenBothPresent() {
    let header = """
      attachment; filename="ascii-fallback.txt"; \
      filename*=UTF-8''%E2%82%AC%20rates.txt
      """
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(
      decoded, "€ rates.txt",
      "filename*= must take precedence over filename= per RFC 6266 §4.3."
    )
  }

  /// Language tag between the two single quotes is allowed and discarded.
  /// `filename*=UTF-8'en'…` is a valid RFC 5987 ext-value; the parser must
  /// not be tripped up by the non-empty `[language]` segment.
  func test_rfc5987_languageTagBetweenQuotes_isStripped() {
    let header = "attachment; filename*=UTF-8'en'hello%20world.bin"
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "hello world.bin")
  }

  // MARK: - Case 2: Quoted plain `filename="..."`

  /// Quoted form — the most common server output. Surrounding double
  /// quotes must be stripped, and the inner content must be returned
  /// verbatim (including spaces).
  func test_quotedPlain_returnsContentWithoutSurroundingQuotes() {
    let header = "attachment; filename=\"my report.pdf\""
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "my report.pdf")
  }

  /// Backslash escapes inside the quoted form (RFC 7230 §3.2.6) must
  /// resolve so that `"weird\"name"` yields the literal `weird"name`.
  /// Without this, a server-supplied quoted name containing an embedded
  /// quote would be truncated or mangled.
  func test_quotedPlain_resolvesBackslashEscapes() {
    let header = "attachment; filename=\"weird\\\"name.bin\""
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "weird\"name.bin")
  }

  /// A semicolon INSIDE a quoted filename must not terminate the
  /// parameter — the parser tracks quoted-string boundaries explicitly.
  func test_quotedPlain_preservesSemicolonInsideQuotes() {
    let header = "attachment; filename=\"a;b.txt\""
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "a;b.txt")
  }

  // MARK: - Case 3: Unquoted plain `filename=…`

  /// Bare token form (no quotes). The value should be returned verbatim
  /// when it does not contain percent-escapes.
  func test_unquotedPlain_returnsBareToken() {
    let header = "attachment; filename=report.pdf"
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "report.pdf")
  }

  /// When the unquoted form contains percent-escapes (a common
  /// real-world server output), the parser URL-decodes them as UTF-8.
  /// Exercises the URL-decoding behavior of the fallback path.
  func test_unquotedPlain_urlDecodesPercentEscapes() {
    let header = "attachment; filename=%E2%82%AC%20rates.txt"
    let decoded = NitroWebViewContentDispositionParser
      .parseFilename(from: header)
    XCTAssertEqual(decoded, "€ rates.txt")
  }

  // MARK: - Case 4: Missing filename

  /// `Content-Disposition: attachment` with no filename parameter at all.
  /// The parser must return `nil` so callers can fall back to a
  /// URL-derived name (e.g. `URLResponse.suggestedFilename`).
  func test_missingFilename_returnsNil() {
    let header = "attachment"
    XCTAssertNil(
      NitroWebViewContentDispositionParser.parseFilename(from: header)
    )
  }

  /// `inline` disposition with no filename — same result.
  func test_missingFilename_inlineDisposition_returnsNil() {
    let header = "inline"
    XCTAssertNil(
      NitroWebViewContentDispositionParser.parseFilename(from: header)
    )
  }

  /// `nil` header (no Content-Disposition at all) → `nil`. The hybrid
  /// class feeds `nil` straight through when the response is not an
  /// `HTTPURLResponse` or the header is absent.
  func test_nilHeader_returnsNil() {
    XCTAssertNil(
      NitroWebViewContentDispositionParser.parseFilename(from: nil)
    )
  }

  /// Empty header string → `nil`. Same justification: a present-but-empty
  /// header carries no usable filename.
  func test_emptyHeader_returnsNil() {
    XCTAssertNil(
      NitroWebViewContentDispositionParser.parseFilename(from: "")
    )
  }

  /// Disposition with unrelated parameters but no `filename` / `filename*`
  /// must still return `nil` — the parser must not invent a name from a
  /// stray `size=` or `creation-date=`.
  func test_unrelatedParameters_returnNil() {
    let header = "attachment; size=12345; creation-date=\"Mon, 01 Jan 2024 00:00:00 GMT\""
    XCTAssertNil(
      NitroWebViewContentDispositionParser.parseFilename(from: header)
    )
  }
}
