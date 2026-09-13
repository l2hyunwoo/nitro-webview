import XCTest
@testable import NitroWebViewSource

final class NitroWebViewDialogCompletionTests: XCTestCase {
  func testActionThenUnmountCompletesOnlyOnce() {
    var results: [String?] = []
    let pending = NitroWebViewDialogCompletion { results.append($0) }
    pending.resolve("accepted")
    pending.resolve(nil)
    XCTAssertEqual(results, ["accepted"])
  }

  func testUnmountThenLateActionCompletesOnlyOnce() {
    var results: [String?] = []
    let pending = NitroWebViewDialogCompletion { results.append($0) }
    pending.resolve(nil)
    pending.resolve("too late")
    XCTAssertEqual(results.count, 1)
    XCTAssertNil(results[0])
  }

  func testEmptyPromptIsNotCancellation() {
    var results: [String?] = []
    let pending = NitroWebViewDialogCompletion { results.append($0) }
    pending.resolve("")
    XCTAssertEqual(results, [""])
  }

  func testCompletionCanReenterWithoutCallingHandlerAgain() {
    var calls = 0
    var pending: NitroWebViewDialogCompletion!
    pending = NitroWebViewDialogCompletion { _ in
      calls += 1
      pending.resolve(nil)
    }
    pending.resolve("OK")
    XCTAssertEqual(calls, 1)
  }

  func testOwnerReleaseCancelsUnansweredRequest() {
    var results: [String?] = []
    var pending: NitroWebViewDialogCompletion? = NitroWebViewDialogCompletion { results.append($0) }
    XCTAssertNotNil(pending)
    pending = nil
    XCTAssertEqual(results.count, 1)
    XCTAssertNil(results[0])
  }
}
