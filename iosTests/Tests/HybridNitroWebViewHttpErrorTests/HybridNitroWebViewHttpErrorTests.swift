import XCTest

/// Tests for the HTTP-error mapper in `ios/HybridNitroWebView.swift`:
/// `HybridNitroWebView.httpError(from:)` maps an `HTTPURLResponse` to a
/// `MappedHttpError` when the status is 4xx/5xx, otherwise `nil`.
///
/// As with every other iOS unit test in this harness, the production class
/// cannot be linked into this SwiftPM macOS host (it transitively depends on
/// Nitro-generated bridge symbols). The probe below is a **byte-for-byte
/// mirror** of the production function — any change to the production helper
/// must be ported here so the contract stays exercised.

/// Mirror of the production `MappedHttpError` value type.
fileprivate struct MappedHttpError: Equatable {
  let statusCode: Int
  let url: String
  let description: String
}

/// Faithful mirror of `HybridNitroWebView.httpError(from:)`.
fileprivate enum HttpErrorProbe {
  static func httpError(from response: HTTPURLResponse) -> MappedHttpError? {
    guard (400...599).contains(response.statusCode) else { return nil }
    return MappedHttpError(
      statusCode: response.statusCode,
      url: response.url?.absoluteString ?? "",
      description: HTTPURLResponse.localizedString(forStatusCode: response.statusCode)
    )
  }
}

final class HybridNitroWebViewHttpErrorTests: XCTestCase {

  private func makeResponse(
    statusCode: Int,
    urlString: String = "https://example.test/resource"
  ) -> HTTPURLResponse {
    HTTPURLResponse(
      url: URL(string: urlString)!,
      statusCode: statusCode,
      httpVersion: "HTTP/1.1",
      headerFields: [:]
    )!
  }

  // MARK: - Non-error statuses map to nil

  func test_2xx_mapsToNil() {
    XCTAssertNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 200)))
    XCTAssertNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 204)))
  }

  func test_3xx_mapsToNil() {
    XCTAssertNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 301)))
    XCTAssertNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 304)))
  }

  // MARK: - 4xx / 5xx map to a MappedHttpError

  func test_404_mapsStatusAndUrl() {
    let mapped = HttpErrorProbe.httpError(
      from: makeResponse(statusCode: 404, urlString: "https://example.test/missing")
    )
    XCTAssertEqual(
      mapped,
      MappedHttpError(
        statusCode: 404,
        url: "https://example.test/missing",
        description: HTTPURLResponse.localizedString(forStatusCode: 404)
      )
    )
  }

  func test_500_mapsStatus() {
    let mapped = HttpErrorProbe.httpError(from: makeResponse(statusCode: 500))
    XCTAssertNotNil(mapped)
    XCTAssertEqual(mapped?.statusCode, 500)
  }

  func test_boundaryStatuses_400and599_areErrors() {
    XCTAssertNotNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 400)))
    XCTAssertNotNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 599)))
  }

  func test_399and600_areNotErrors() {
    XCTAssertNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 399)))
    XCTAssertNil(HttpErrorProbe.httpError(from: makeResponse(statusCode: 600)))
  }

  func test_description_isLocalizedReasonPhrase() {
    let mapped = HttpErrorProbe.httpError(from: makeResponse(statusCode: 403))
    XCTAssertEqual(
      mapped?.description,
      HTTPURLResponse.localizedString(forStatusCode: 403),
      "description must be the platform localized reason phrase"
    )
  }
}
