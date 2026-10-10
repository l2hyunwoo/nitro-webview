import XCTest

@testable import NitroWebViewSource

/// Synchronous stub that records each `code` and resolves the completion
/// handler with a pre-programmed `(result, error)` pair.
private final class StubEvaluator: JavaScriptEvaluator {
  struct Invocation: Equatable {
    let code: String
  }

  private(set) var invocations: [Invocation] = []

  var stubResult: Any?
  var stubError: Error?

  init(result: Any? = nil, error: Error? = nil) {
    self.stubResult = result
    self.stubError = error
  }

  func evaluateJavaScriptPayload(
    _ code: String,
    completionHandler: @escaping (Any?, Error?) -> Void
  ) {
    invocations.append(Invocation(code: code))
    completionHandler(stubResult, stubError)
  }
}

final class NitroWebViewEvaluateJavaScriptHandlerTests: XCTestCase {
  func testScalarJSONResults() throws {
    let cases: [(Any?, String)] = [
      (nil, "null"), (NSNull(), "null"), (NSNumber(value: 2), "2"),
      (NSNumber(value: 2.0), "2"), (NSNumber(value: 2.5), "2.5"), (true, "true"), (false, "false"),
      ("hello", "\"hello\""), (NSString(string: "hello"), "\"hello\""),
    ]
    for (value, expected) in cases {
      XCTAssertEqual(try NitroWebViewEvaluateJavaScriptHandler.stringify(value), expected)
    }
  }

  func testStringsObjectsAndArraysRoundTripAsJSON() throws {
    let text = "quote \" backslash \\ newline\n한글 🎉"
    let encoded = try NitroWebViewEvaluateJavaScriptHandler.stringify(text)
    XCTAssertEqual(try decode(encoded) as? String, text)
    let object = try NitroWebViewEvaluateJavaScriptHandler.stringify(["a": 1])
    XCTAssertEqual(try decode(object) as? [String: Int], ["a": 1])
    let array = try NitroWebViewEvaluateJavaScriptHandler.stringify([1, "a", NSNull()] as [Any])
    XCTAssertEqual(try decode(array) as? NSArray, [1, "a", NSNull()] as NSArray)
  }

  func testUnsupportedResultsRejectInsteadOfDescriptiveStrings() {
    XCTAssertThrowsError(try NitroWebViewEvaluateJavaScriptHandler.stringify(Date()))
    XCTAssertThrowsError(try NitroWebViewEvaluateJavaScriptHandler.stringify(Double.nan))
  }

  func testOriginalCodeEvaluatesOnceAndReturnsJSON() async throws {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let evaluator = StubEvaluator(result: ["title": "漢字 🎉"])
    let code = "({ title: document.title })"
    let result = try await handler.evaluate(code: code, in: evaluator)
    XCTAssertEqual(try decode(result) as? [String: String], ["title": "漢字 🎉"])
    XCTAssertEqual(evaluator.invocations.map { $0.code }, [code])
  }

  func testAsyncNativeErrorsPropagate() async {
    let error = NSError(domain: "WKErrorDomain", code: 4)
    do {
      _ = try await NitroWebViewEvaluateJavaScriptHandler().evaluate(
        code: "throw 'bad'", in: StubEvaluator(error: error)
      )
      XCTFail("must reject")
    } catch {
      let received = error as NSError
      XCTAssertEqual(received.domain, "WKErrorDomain")
      XCTAssertEqual(received.code, 4)
    }
  }

  func testCompletionVariantHasOneTerminalCallbackForSuccessAndErrors() {
    for evaluator in [StubEvaluator(result: 2), StubEvaluator(result: Date()), StubEvaluator(error: NSError(domain: "WKErrorDomain", code: 4))] {
      var resolved: [String] = []
      var rejected: [Error] = []
      NitroWebViewEvaluateJavaScriptHandler().evaluate(
        code: "source()", in: evaluator,
        resolve: { resolved.append($0) }, reject: { rejected.append($0) }
      )
      XCTAssertEqual(resolved.count + rejected.count, 1)
      XCTAssertEqual(evaluator.invocations.map { $0.code }, ["source()"])
      if evaluator.stubResult as? Int == 2 {
        XCTAssertEqual(resolved, ["2"])
      } else {
        XCTAssertEqual(rejected.count, 1)
      }
    }
  }

  private func decode(_ value: String) throws -> Any {
    try JSONSerialization.jsonObject(with: Data(value.utf8), options: [.fragmentsAllowed])
  }
}
