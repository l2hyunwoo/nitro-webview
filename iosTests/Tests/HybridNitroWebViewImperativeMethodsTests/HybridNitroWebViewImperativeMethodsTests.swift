import XCTest

#if canImport(WebKit)
  import WebKit
#endif

/// Tests for the imperative-method + blob-download helpers added to
/// `ios/HybridNitroWebView.swift`:
///
///   1. `HybridNitroWebView.cacheDataTypes()` — the cache-only website-data
///      record set `clearCache()` passes to `removeData(ofTypes:)`. Must be
///      exactly `{DiskCache, MemoryCache}` and MUST NOT include cookies /
///      localStorage (using `allWebsiteDataTypes()` would over-clear).
///   2. `HybridNitroWebView.isBlobDownload(response:canShowMIMEType:)` — the
///      predicate routing a `blob:` navigation response through
///      `WKDownloadDelegate` (temp-file streaming) instead of the HTTP
///      cancel-and-emit path.
///   3. `HybridNitroWebView.NavigationDelegate.blobDownloadDestination(
///      suggestedFilename:)` — the unique, non-existent temp-file path a blob
///      download is written to.
///
/// As with every other iOS unit test in this harness, the production class
/// cannot be linked (it depends on Nitro-generated bridge symbols resolved
/// only at CocoaPods install time), so each helper is exercised through a
/// **byte-for-byte probe mirror**. Any change to the production helpers must
/// be ported here.
#if canImport(WebKit)

  // MARK: - Production-logic mirrors

  /// Mirror of `HybridNitroWebView.cacheDataTypes()`.
  fileprivate enum CacheTypesProbe {
    static func cacheDataTypes() -> Set<String> {
      [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
    }
  }

  /// Mirror of `HybridNitroWebView.isBlobDownload(response:canShowMIMEType:)`.
  fileprivate enum BlobDownloadProbe {
    static func isBlobDownload(
      response: URLResponse,
      canShowMIMEType: Bool
    ) -> Bool {
      guard response.url?.scheme?.lowercased() == "blob" else { return false }
      return !canShowMIMEType
    }
  }

  /// Mirror of
  /// `HybridNitroWebView.NavigationDelegate.blobDownloadDestination(
  /// suggestedFilename:)`.
  fileprivate enum BlobDestinationProbe {
    static func blobDownloadDestination(suggestedFilename: String) -> URL? {
      let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("nitro-webview-blob", isDirectory: true)
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
      do {
        try FileManager.default.createDirectory(
          at: dir, withIntermediateDirectories: true
        )
      } catch {
        return nil
      }
      let name = suggestedFilename.isEmpty ? "download" : suggestedFilename
      return dir.appendingPathComponent(name)
    }
  }

  final class HybridNitroWebViewImperativeMethodsTests: XCTestCase {

    // MARK: - clearCache record types

    func test_cacheDataTypes_isExactlyDiskAndMemoryCache() {
      let types = CacheTypesProbe.cacheDataTypes()
      XCTAssertEqual(
        types,
        [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache],
        "clearCache must scope removeData to exactly the disk + memory cache types."
      )
    }

    func test_cacheDataTypes_excludesCookiesAndLocalStorage() {
      let types = CacheTypesProbe.cacheDataTypes()
      XCTAssertFalse(
        types.contains(WKWebsiteDataTypeCookies),
        "clearCache MUST NOT remove cookies (that's clearCookies' job)."
      )
      XCTAssertFalse(
        types.contains(WKWebsiteDataTypeLocalStorage),
        "clearCache MUST NOT remove localStorage."
      )
    }

    /// The record types clearCache uses must be a strict subset of the
    /// full removable-types set — proving they are real WebKit identifiers
    /// AND that we are deliberately NOT using `allWebsiteDataTypes()` (which
    /// would wipe cookies/storage too).
    func test_cacheDataTypes_isProperSubsetOfAllWebsiteDataTypes() {
      let types = CacheTypesProbe.cacheDataTypes()
      let all = WKWebsiteDataStore.allWebsiteDataTypes()
      XCTAssertTrue(
        types.isSubset(of: all),
        "cache types must be valid removable WebKit data-type identifiers."
      )
      XCTAssertTrue(
        types.isStrictSubset(of: all),
        "cache types must be a STRICT subset — clearCache is not clearAllData."
      )
    }

    // MARK: - isBlobDownload

    private func makeResponse(urlString: String) -> URLResponse {
      URLResponse(
        url: URL(string: urlString)!,
        mimeType: "application/octet-stream",
        expectedContentLength: -1,
        textEncodingName: nil
      )
    }

    func test_isBlobDownload_true_forBlobSchemeThatCannotRenderInline() {
      let r = makeResponse(urlString: "blob:https://app.example/abc-123")
      XCTAssertTrue(
        BlobDownloadProbe.isBlobDownload(response: r, canShowMIMEType: false),
        "a blob: response WebKit cannot render inline is a download."
      )
    }

    func test_isBlobDownload_false_forBlobSchemeWebKitCanRenderInline() {
      // An inline-renderable blob (e.g. a PNG the page navigated to) should
      // display, not download.
      let r = makeResponse(urlString: "blob:https://app.example/img")
      XCTAssertFalse(
        BlobDownloadProbe.isBlobDownload(response: r, canShowMIMEType: true),
        "an inline-renderable blob: must NOT be forced to download."
      )
    }

    func test_isBlobDownload_false_forHttpScheme() {
      let r = makeResponse(urlString: "https://example.test/file.zip")
      XCTAssertFalse(
        BlobDownloadProbe.isBlobDownload(response: r, canShowMIMEType: false),
        "http(s) downloads take the shouldTreatAsDownload path, not the blob path."
      )
    }

    func test_isBlobDownload_isCaseInsensitiveOnScheme() {
      let r = makeResponse(urlString: "BLOB:https://app.example/x")
      XCTAssertTrue(
        BlobDownloadProbe.isBlobDownload(response: r, canShowMIMEType: false),
        "scheme comparison must be case-insensitive."
      )
    }

    // MARK: - blobDownloadDestination

    func test_blobDownloadDestination_isAFileUrlThatDoesNotYetExist() {
      guard let dest = BlobDestinationProbe.blobDownloadDestination(
        suggestedFilename: "report.pdf"
      ) else {
        return XCTFail("destination must not be nil for a well-formed name")
      }
      XCTAssertTrue(dest.isFileURL, "destination must be a file:// URL")
      XCTAssertEqual(
        dest.lastPathComponent,
        "report.pdf",
        "destination must end with the suggested filename"
      )
      XCTAssertFalse(
        FileManager.default.fileExists(atPath: dest.path),
        "WKDownload requires the destination file to NOT already exist"
      )
      // The parent dir IS created (WKDownload writes into it).
      XCTAssertTrue(
        FileManager.default.fileExists(
          atPath: dest.deletingLastPathComponent().path
        ),
        "the parent temp directory must exist so WKDownload can write into it"
      )
    }

    func test_blobDownloadDestination_isUniquePerCall() {
      let a = BlobDestinationProbe.blobDownloadDestination(suggestedFilename: "f.bin")
      let b = BlobDestinationProbe.blobDownloadDestination(suggestedFilename: "f.bin")
      XCTAssertNotNil(a)
      XCTAssertNotNil(b)
      XCTAssertNotEqual(
        a, b,
        "same-name downloads must land in distinct UUID subdirs (no collision)"
      )
    }

    func test_blobDownloadDestination_fallsBackToDownloadForEmptyName() {
      guard let dest = BlobDestinationProbe.blobDownloadDestination(
        suggestedFilename: ""
      ) else {
        return XCTFail("destination must not be nil for empty name")
      }
      XCTAssertEqual(
        dest.lastPathComponent,
        "download",
        "an empty suggested filename must fall back to 'download'"
      )
    }
  }

#endif  // canImport(WebKit)
