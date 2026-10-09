import XCTest
@testable import NitroWebViewSource

final class HybridNitroWebViewHeaderMergeTests: XCTestCase {
  func testCaseInsensitiveSourcePrecedenceAndPreservedCasing() throws {
    let merged = try NitroWebViewSourceHandler.mergeHeaders(
      defaults: ["Authorization": "default", "X-App": "nitro"],
      perRequest: ["authorization": "request", "X-Extra": "value"]
    )
    XCTAssertEqual(merged, ["authorization": "request", "X-App": "nitro", "X-Extra": "value"])
  }

  func testNilAndEmptyInputs() throws {
    XCTAssertEqual(try NitroWebViewSourceHandler.mergeHeaders(defaults: nil, perRequest: nil), [:])
    XCTAssertEqual(try NitroWebViewSourceHandler.mergeHeaders(defaults: ["X": "1"], perRequest: [:]), ["X": "1"])
    XCTAssertEqual(try NitroWebViewSourceHandler.mergeHeaders(defaults: [:], perRequest: ["X": "1"]), ["X": "1"])
    XCTAssertEqual(try NitroWebViewSourceHandler.mergeHeaders(defaults: ["X": "1"], perRequest: ["x": ""]), ["x": ""])
  }

  func testDuplicatesWithinEitherInputAreSourceErrorsEvenIfOverridden() {
    let duplicates = ["Authorization": "one", "authorization": "two"]
    let cases: [([String: String]?, [String: String]?)] = [
      (duplicates, nil), (nil, duplicates),
      (duplicates, ["authorization": "override"]), (["Authorization": "default"], duplicates),
    ]
    for (defaults, request) in cases {
      XCTAssertThrowsError(try NitroWebViewSourceHandler.mergeHeaders(defaults: defaults, perRequest: request)) { error in
        XCTAssertEqual((error as NSError).domain, "NitroWebViewSource")
        XCTAssertEqual((error as NSError).code, -1)
      }
    }
  }
}
