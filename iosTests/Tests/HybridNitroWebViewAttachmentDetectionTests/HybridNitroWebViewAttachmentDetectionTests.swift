import XCTest

/// Tests for the attachment-detection helper in
/// `ios/HybridNitroWebView.swift` that takes an `HTTPURLResponse` plus a
/// `canShowMIMEType` flag and returns a `Bool` indicating whether the
/// response should be treated as a download (true when
/// `Content-Disposition` `hasPrefix("attachment")` OR `canShowMIMEType` is
/// false).
///
/// The production helper lives at the top level of
/// `ios/HybridNitroWebView.swift` as
/// `HybridNitroWebView.shouldTreatAsDownload(response:canShowMIMEType:)`.
/// As with every other iOS unit test in this harness, the production
/// class cannot be linked into this SwiftPM macOS host harness because
/// it transitively depends on Nitro-generated bridge symbols
/// (`HybridNitroWebViewSpec`, `NitroModules`) that only resolve at
/// CocoaPods install time. The probe below is a **byte-for-byte mirror**
/// of the production function — any future change in the production
/// helper must be ported here so the contract continues to be exercised.
///
/// Coverage:
///   1. attachment header
///   2. inline header
///   3. missing header with unsupported MIME
///   4. supported inline MIME
///
/// We also pin a handful of close-cousin behaviors (case-insensitive
/// prefix match, leading whitespace tolerance, nil response fallback) so
/// regressions in the parser surface here rather than only in real
/// device testing.

/// Faithful mirror of the production
/// `HybridNitroWebView.shouldTreatAsDownload(response:canShowMIMEType:)`.
/// Kept verbatim so any divergence in the production class is reflected
/// here when the change is ported.
fileprivate enum AttachmentDetectionProbe {
  static func shouldTreatAsDownload(
    response: HTTPURLResponse?,
    canShowMIMEType: Bool
  ) -> Bool {
    if let disposition = response?
      .value(forHTTPHeaderField: "Content-Disposition") {
      let trimmed = disposition
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .lowercased()
      if trimmed.hasPrefix("attachment") { return true }
    }
    if !canShowMIMEType { return true }
    return false
  }
}

final class HybridNitroWebViewAttachmentDetectionTests: XCTestCase {

  // MARK: - Test fixtures

  /// Build an `HTTPURLResponse` carrying the supplied Content-Disposition
  /// header (or none if `nil`). MIME type is fixed because the predicate
  /// only consults `canShowMIMEType` (a separate input) — the MIME on the
  /// `HTTPURLResponse` itself is irrelevant to the helper.
  private func makeResponse(
    contentDisposition: String?,
    mimeType: String = "application/octet-stream"
  ) -> HTTPURLResponse {
    let url = URL(string: "https://example.test/resource")!
    var headers: [String: String] = [:]
    if let cd = contentDisposition {
      headers["Content-Disposition"] = cd
    }
    return HTTPURLResponse(
      url: url,
      statusCode: 200,
      httpVersion: "HTTP/1.1",
      headerFields: headers
    )!
  }

  // MARK: - Case 1: attachment header
  /// `Content-Disposition: attachment` — the canonical RFC 6266 §4.2
  /// signal that the response should be saved rather than rendered. The
  /// helper must return `true` regardless of `canShowMIMEType` (a server
  /// can force-download a PDF or HTML page).
  func test_attachmentHeader_returnsTrue_whenCanShowMIMEType_isTrue() {
    let response = makeResponse(contentDisposition: "attachment")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertTrue(
      result,
      "Content-Disposition: attachment must force a download even when the WebView can render the MIME type."
    )
  }

  /// Same as above but with a filename parameter — the prefix check must
  /// still match because it inspects only the leading disposition type.
  func test_attachmentHeader_withFilename_returnsTrue() {
    let response = makeResponse(
      contentDisposition: "attachment; filename=\"report.pdf\""
    )

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertTrue(
      result,
      "Content-Disposition: attachment with a filename= parameter must still be detected as a download (hasPrefix `attachment`)."
    )
  }

  /// Case-insensitive prefix match — RFC 7230 §3.2 says header values are
  /// not case-folded for us, but the disposition-type token IS
  /// case-insensitive per RFC 6266 §4.1.
  func test_attachmentHeader_mixedCase_returnsTrue() {
    let response = makeResponse(contentDisposition: "Attachment; filename=x.bin")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertTrue(
      result,
      "`Attachment` (capitalized) must be recognized — disposition-type tokens are case-insensitive."
    )
  }

  /// Leading whitespace before `attachment` (some misbehaving servers
  /// emit ` attachment; …`) must not defeat the prefix check.
  func test_attachmentHeader_withLeadingWhitespace_returnsTrue() {
    let response = makeResponse(contentDisposition: "   attachment; filename=x")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertTrue(
      result,
      "Leading whitespace before `attachment` must be tolerated — header is trimmed before the prefix check."
    )
  }

  // MARK: - Case 2: inline header
  /// `Content-Disposition: inline` plus `canShowMIMEType == true` — the
  /// happy-path inline render case. Helper must return `false`.
  func test_inlineHeader_withSupportedMIME_returnsFalse() {
    let response = makeResponse(contentDisposition: "inline")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertFalse(
      result,
      "Content-Disposition: inline with a supported MIME must render inline (not a download)."
    )
  }

  /// `Content-Disposition: inline` plus `canShowMIMEType == false` — the
  /// inline hint cannot override WebKit's verdict that it cannot render
  /// the MIME. Helper must return `true` via Rule 2.
  func test_inlineHeader_withUnsupportedMIME_returnsTrue() {
    let response = makeResponse(contentDisposition: "inline")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: false
    )

    XCTAssertTrue(
      result,
      "When WebKit cannot render the MIME, an `inline` disposition must still produce a download."
    )
  }

  // MARK: - Case 3: missing header with unsupported MIME
  /// No `Content-Disposition` header at all, and WebKit cannot render the
  /// MIME — the predicate falls through Rule 1 and lands on Rule 2.
  func test_missingHeader_withUnsupportedMIME_returnsTrue() {
    let response = makeResponse(contentDisposition: nil)

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: false
    )

    XCTAssertTrue(
      result,
      "Missing Content-Disposition + unsupported MIME must be treated as a download via the canShowMIMEType=false branch."
    )
  }

  // MARK: - Case 4: supported inline MIME
  /// No `Content-Disposition` header AND WebKit can render the MIME —
  /// the most common case for a normal HTML/CSS/JS navigation. Must
  /// return `false`.
  func test_missingHeader_withSupportedMIME_returnsFalse() {
    let response = makeResponse(contentDisposition: nil)

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertFalse(
      result,
      "Missing Content-Disposition + supported MIME is the happy-path inline render — not a download."
    )
  }

  // MARK: - Additional edge cases

  /// `nil` HTTPURLResponse (non-HTTP response, e.g. file:// URL): Rule 1
  /// is skipped because there's no header to inspect, and the predicate
  /// must then defer entirely to `canShowMIMEType`.
  func test_nilResponse_supportedMIME_returnsFalse() {
    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: nil,
      canShowMIMEType: true
    )

    XCTAssertFalse(
      result,
      "Nil response + canShowMIMEType=true must NOT be treated as a download — Rule 1 is skipped and Rule 2 votes inline."
    )
  }

  /// `nil` HTTPURLResponse plus unsupported MIME — Rule 2 alone makes
  /// the predicate fire.
  func test_nilResponse_unsupportedMIME_returnsTrue() {
    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: nil,
      canShowMIMEType: false
    )

    XCTAssertTrue(
      result,
      "Nil response + canShowMIMEType=false must be treated as a download via Rule 2."
    )
  }

  /// An unrelated disposition value (e.g. `form-data` — used by multipart
  /// uploads, never seen on a response). Treat as "not attachment" so
  /// the predicate falls through to the canShowMIMEType check.
  func test_unrelatedDispositionType_withSupportedMIME_returnsFalse() {
    let response = makeResponse(contentDisposition: "form-data; name=\"file\"")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertFalse(
      result,
      "An unknown disposition-type must not be treated as `attachment`; Rule 2 then renders inline."
    )
  }

  /// Empty header string (`Content-Disposition: ` — server bug). Trimmed
  /// value is empty, so `hasPrefix("attachment")` returns false. Falls
  /// through to canShowMIMEType.
  func test_emptyDispositionHeader_withSupportedMIME_returnsFalse() {
    let response = makeResponse(contentDisposition: "")

    let result = AttachmentDetectionProbe.shouldTreatAsDownload(
      response: response,
      canShowMIMEType: true
    )

    XCTAssertFalse(
      result,
      "Empty Content-Disposition header (server bug) must not be treated as `attachment`."
    )
  }
}
