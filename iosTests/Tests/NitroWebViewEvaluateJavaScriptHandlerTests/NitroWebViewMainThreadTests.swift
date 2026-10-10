import XCTest
@testable import NitroWebViewSource

final class NitroWebViewMainThreadTests: XCTestCase {
  func testMainThreadCallsRunInline() {
    let completed = expectation(description: "inline main action")
    DispatchQueue.main.async {
      var returned = false
      NitroWebViewMainThread.run {
        XCTAssertTrue(Thread.isMainThread)
        XCTAssertFalse(returned)
        completed.fulfill()
      }
      returned = true
    }
    wait(for: [completed], timeout: 2)
  }

  func testBackgroundCallReturnsWhileMainIsBusyAndExecutesOnMain() {
    let completed = expectation(description: "background action reaches main")
    DispatchQueue.main.async {
      let returned = DispatchSemaphore(value: 0)
      DispatchQueue.global().async {
        NitroWebViewMainThread.run {
          XCTAssertTrue(Thread.isMainThread)
          completed.fulfill()
        }
        returned.signal()
      }
      XCTAssertEqual(returned.wait(timeout: .now() + 1), .success)
    }
    wait(for: [completed], timeout: 2)
  }
}
