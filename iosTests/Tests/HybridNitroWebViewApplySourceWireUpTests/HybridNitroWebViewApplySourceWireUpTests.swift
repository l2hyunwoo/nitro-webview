import XCTest
@testable import NitroWebViewSource

final class HybridNitroWebViewApplySourceWireUpTests: XCTestCase {
  func testProductionRequestContainsOnlyFinalHeaderValues() throws {
    let headers = try NitroWebViewSourceHandler.mergeHeaders(
      defaults: ["Authorization": "default", "X-App": "nitro"],
      perRequest: ["authorization": "request", "X-Extra": "value"]
    )
    let request = try NitroWebViewSourceHandler.makeRequest(uri: "https://example.com", headers: headers)
    XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "request")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-App"), "nitro")
    XCTAssertEqual(request.value(forHTTPHeaderField: "X-Extra"), "value")
    XCTAssertEqual(request.allHTTPHeaderFields?.count, 3)
  }

  func testRequestRejectsAmbiguousHeaders() {
    XCTAssertThrowsError(try NitroWebViewSourceHandler.makeRequest(
      uri: "https://example.com", headers: ["X-App": "one", "x-app": "two"]
    )) { error in
      XCTAssertEqual((error as NSError).domain, "NitroWebViewSource")
      XCTAssertEqual((error as NSError).code, -1)
    }
  }

  func testRequestWithoutHeaders() throws {
    let request = try NitroWebViewSourceHandler.makeRequest(uri: "https://example.com")
    XCTAssertTrue(request.allHTTPHeaderFields?.isEmpty ?? true)
  }
}
