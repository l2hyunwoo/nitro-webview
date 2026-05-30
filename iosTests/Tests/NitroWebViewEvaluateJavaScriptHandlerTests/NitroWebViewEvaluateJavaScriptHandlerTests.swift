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

  func test_evaluate_onePlusOne_resolvesToString2() async throws {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let evaluator = StubEvaluator(result: NSNumber(value: 2))

    let result = try await handler.evaluate(code: "1+1", in: evaluator)

    XCTAssertEqual(result, "2")
    XCTAssertEqual(evaluator.invocations.count, 1)
    XCTAssertEqual(evaluator.invocations.first?.code, "1+1")
  }

  func test_evaluate_completionOverload_onePlusOne_resolvesToString2() {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let evaluator = StubEvaluator(result: NSNumber(value: 2))

    let exp = expectation(description: "resolve fires with \"2\"")
    var resolvedValue: String?
    var rejectedError: Error?

    handler.evaluate(
      code: "1+1",
      in: evaluator,
      resolve: { value in
        resolvedValue = value
        exp.fulfill()
      },
      reject: { error in
        rejectedError = error
        exp.fulfill()
      }
    )

    wait(for: [exp], timeout: 1.0)

    XCTAssertNil(rejectedError)
    XCTAssertEqual(resolvedValue, "2")
    XCTAssertEqual(evaluator.invocations.first?.code, "1+1")
  }

  func test_evaluate_invokesEvaluatorExactlyOncePerCall() async throws {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let evaluator = StubEvaluator(result: NSNumber(value: 42))

    _ = try await handler.evaluate(code: "21 * 2", in: evaluator)
    _ = try await handler.evaluate(code: "21 * 2", in: evaluator)

    XCTAssertEqual(evaluator.invocations.count, 2)
    XCTAssertEqual(evaluator.invocations[0].code, "21 * 2")
    XCTAssertEqual(evaluator.invocations[1].code, "21 * 2")
  }

  func test_evaluate_throwsWhenEvaluatorReturnsError() async {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let stubError = NSError(
      domain: "WKErrorDomain",
      code: 4,
      userInfo: [NSLocalizedDescriptionKey: "JS error: bad syntax"]
    )
    let evaluator = StubEvaluator(result: nil, error: stubError)

    do {
      _ = try await handler.evaluate(code: "throw 'bad'", in: evaluator)
      XCTFail("evaluate must throw when the evaluator hands back an Error")
    } catch {
      let nsError = error as NSError
      XCTAssertEqual(nsError.domain, "WKErrorDomain")
      XCTAssertEqual(nsError.code, 4)
    }
  }

  func test_stringify_nilCollapsesToEmptyString() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(nil), ""
    )
  }

  func test_stringify_nsNullCollapsesToEmptyString() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(NSNull()), ""
    )
  }

  func test_stringify_integerNSNumber_isStringifiedWithoutDecimal() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(NSNumber(value: 2)),
      "2"
    )
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(NSNumber(value: 42)),
      "42"
    )
  }

  /// JS booleans must emit "true"/"false" (matching JS's `String(true)`)
  /// rather than "1"/"0" from NSNumber's Int-backed stringValue.
  func test_stringify_booleanNSNumber_isStringifiedAsLowercase() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(true),
      "true"
    )
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(false),
      "false"
    )
  }

  func test_stringify_string_isVerbatim() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify("hello"),
      "hello"
    )
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify("漢字 🎉"),
      "漢字 🎉"
    )
  }

  func test_stringify_nsString_isBridgedVerbatim() {
    let ns: NSString = "ns-string"
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(ns),
      "ns-string"
    )
  }

  /// Doubles that are exact integers stringify without a trailing `.0`
  /// (mirrors JS's `String(2.0) === "2"`).
  func test_stringify_doubleThatIsIntegerCollapsesToIntegerString() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(NSNumber(value: 2.0)),
      "2"
    )
  }

  func test_stringify_doubleWithFractionalPart_keepsDecimal() {
    XCTAssertEqual(
      NitroWebViewEvaluateJavaScriptHandler.stringify(NSNumber(value: 2.5)),
      "2.5"
    )
  }

  func test_evaluate_stringResult_isForwardedVerbatim() async throws {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let evaluator = StubEvaluator(result: "document title")

    let result = try await handler.evaluate(
      code: "document.title", in: evaluator
    )

    XCTAssertEqual(result, "document title")
    XCTAssertEqual(evaluator.invocations.first?.code, "document.title")
  }

  /// `void 0` evaluates to JS `undefined`, which WKWebView delivers as `nil`.
  func test_evaluate_undefinedResult_resolvesToEmptyString() async throws {
    let handler = NitroWebViewEvaluateJavaScriptHandler()
    let evaluator = StubEvaluator(result: nil)

    let result = try await handler.evaluate(code: "void 0", in: evaluator)

    XCTAssertEqual(result, "")
  }
}
