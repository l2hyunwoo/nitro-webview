import XCTest
@testable import NitroWebViewSource

final class NitroWebViewDownloadFilesTests: XCTestCase {
  func testDestinationConfinesSuggestedPathsAndKeepsFileAbsent() throws {
    for name in ["../../report.pdf", "", ".", "..", "/"] {
      let destination = try NitroWebViewDownloadFiles.destination(suggestedFilename: name)
      defer { try? NitroWebViewDownloadFiles.discard(destination) }
      XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path))
      XCTAssertNotNil(UUID(uuidString: destination.deletingLastPathComponent().lastPathComponent))
      XCTAssertTrue(FileManager.default.fileExists(atPath: destination.deletingLastPathComponent().path))
      XCTAssertEqual(destination.lastPathComponent, name == "../../report.pdf" ? "report.pdf" : "download")
    }
  }

  func testFailureOrCompletedCancellationRemovesPartialFileAndDirectory() throws {
    let destination = try NitroWebViewDownloadFiles.destination(suggestedFilename: "partial.bin")
    try Data([1, 2, 3]).write(to: destination)
    try NitroWebViewDownloadFiles.discard(destination)
    XCTAssertFalse(FileManager.default.fileExists(atPath: destination.deletingLastPathComponent().path))
    // Late duplicate cleanup must also succeed.
    try NitroWebViewDownloadFiles.discard(destination)
  }

  func testDestinationFailurePropagates() throws {
    let rootFile = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try Data([0]).write(to: rootFile)
    defer { try? FileManager.default.removeItem(at: rootFile) }
    XCTAssertThrowsError(try NitroWebViewDownloadFiles.destination(suggestedFilename: "file", rootDirectory: rootFile))
  }
}
