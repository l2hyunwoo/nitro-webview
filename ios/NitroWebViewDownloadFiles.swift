import Foundation

/// Each native blob download owns one directory until failure or handoff to the consumer.
enum NitroWebViewDownloadFiles {
  static func destination(
    suggestedFilename: String,
    rootDirectory: URL = FileManager.default.temporaryDirectory
      .appendingPathComponent("nitro-webview-blob", isDirectory: true)
  ) throws -> URL {
    let directory = rootDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let component = (suggestedFilename as NSString).lastPathComponent
    let name = component.isEmpty || component == "." || component == ".." || component == "/" ? "download" : component
    return directory.appendingPathComponent(name, isDirectory: false)
  }

  /// Only pass destinations returned by destination(suggestedFilename:rootDirectory:).
  static func discard(_ destination: URL) throws {
    do {
      try FileManager.default.removeItem(at: destination.deletingLastPathComponent())
    } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileNoSuchFileError {
      // A cancelled download can finish cleanup before its failure callback arrives.
    }
  }
}
