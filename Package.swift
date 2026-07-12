// swift-tools-version:5.9
//
// Swift Package for native (Swift) unit tests of the NitroWebView library.
//
// The library is still shipped to React Native consumers via
// `NitroWebview.podspec`; this manifest only exists so `swift test` can
// exercise the iOS handlers on the macOS host. Neither `Package.swift` nor
// `iosTests/` ships to npm consumers (see `package.json#files`).
//
// Run tests:
//   swift test
//   ./iosTests/run-tests.sh

import PackageDescription

let package = Package(
  name: "NitroWebViewNative",
  platforms: [
    // macOS host is enough for these unit tests — they run against
    // protocol-seam spies, not a real WKWebView. iOS shipping is handled
    // by the podspec.
    .macOS(.v11),
  ],
  targets: [
    .target(
      name: "NitroWebViewSource",
      path: "ios",
      exclude: [
        // `Bridge.h` is the only non-Swift artefact in `ios/` today.
        "Bridge.h",
        // `HybridNitroWebView.swift` depends on Nitro-generated bridge
        // code (`HybridNitroWebViewSpec`, `NitroModules`) that is only
        // resolved at CocoaPods install time, so it cannot participate
        // in this SwiftPM host harness. The binding contract it
        // implements is covered by
        // `HybridNitroWebViewUIDelegateBindingTests` via a structural
        // replica.
        "HybridNitroWebView.swift",
      ],
      sources: [
        "NitroWebViewSourceHandler.swift",
        "NitroWebViewMessageHandler.swift",
        "NitroWebViewErrorMapper.swift",
        "NitroWebViewEvaluateJavaScriptHandler.swift",
        // Extracted from `HybridNitroWebView` so it can be exercised on
        // the macOS host without linking the Nitro/WKWebView-bound class.
        "NitroWebViewCookieFilter.swift",
        // Same rationale as the cookie filter — `HybridNitroWebView`
        // can't be linked into this SwiftPM harness, so the parser lives
        // standalone and is re-exposed on the hybrid class via
        // `parseContentDispositionFilename(_:)`.
        "NitroWebViewContentDispositionParser.swift",
      ]
    ),
    .testTarget(
      name: "NitroWebViewSourceHandlerTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/NitroWebViewSourceHandlerTests"
    ),
    .testTarget(
      name: "NitroWebViewMessageHandlerTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/NitroWebViewMessageHandlerTests"
    ),
    .testTarget(
      name: "NitroWebViewErrorMapperTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/NitroWebViewErrorMapperTests"
    ),
    .testTarget(
      name: "NitroWebViewEvaluateJavaScriptHandlerTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/NitroWebViewEvaluateJavaScriptHandlerTests"
    ),
    .testTarget(
      // Asserts the file-upload `WKUIDelegate` binding contract on
      // `HybridNitroWebView`. The real class depends on Nitro-generated
      // bridge code only available at CocoaPods install time, so the
      // test uses a `BindingProbe` whose init mirrors the production
      // wiring step-for-step.
      name: "HybridNitroWebViewUIDelegateBindingTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewUIDelegateBindingTests"
    ),
    .testTarget(
      // Runtime introspection guard that asserts no
      // `runOpenPanelWith:initiatedByFrame:completionHandler:` (a
      // macOS-only WKUIDelegate selector) is implemented on the
      // production class. Uses a structural replica (`FileUploadProbe`)
      // because the production class cannot be linked into this harness.
      name: "HybridNitroWebViewFileUploadIntrospectionTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewFileUploadIntrospectionTests"
    ),
    .testTarget(
      // Exercises the host / path-prefix / secure-flag filter rules in
      // `NitroWebViewCookieFilter` against real `HTTPCookie` instances.
      // Mirrors the call path used by `HybridNitroWebView.getCookies(url:)`.
      name: "HybridNitroWebViewGetCookiesFilterTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewGetCookiesFilterTests"
    ),
    .testTarget(
      // Unit-tests the iOS Swift header-merge function that combines
      // `defaultHeaders` with per-request `source.headers` using
      // `Dictionary(_:uniquingKeysWith:)` with a last-wins resolver
      // (per-request keys override defaults on collision). Exercises a
      // `HeaderMergeProbe` that mirrors the production implementation
      // because the hybrid class cannot be linked into this harness.
      name: "HybridNitroWebViewHeaderMergeTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewHeaderMergeTests"
    ),
    .testTarget(
      // Verifies that `HybridNitroWebView.setCookie(url:cookie:)`
      //   1. applies documented defaults (domain → URL host, path → "/",
      //      expires divided by 1000, secure honored), and
      //   2. persists the resulting `HTTPCookie` in `WKHTTPCookieStore`
      //      (observable via `getAllCookies(_:)`).
      // Uses a `SetCookieProbe` against an isolated
      // `WKWebsiteDataStore.nonPersistent()` because the hybrid class
      // cannot be linked into this harness.
      name: "HybridNitroWebViewSetCookieTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewSetCookieTests"
    ),
    .testTarget(
      // Verifies that `HybridNitroWebView.clearCookies()` invokes
      // `WKWebsiteDataStore.default().removeData(ofTypes:
      // [WKWebsiteDataTypeCookies], modifiedSince: .distantPast,
      // completionHandler:)` and that pre-existing cookies are removed
      // after the call completes. Uses a `ClearCookiesProbe` against an
      // isolated `WKWebsiteDataStore.nonPersistent()`.
      name: "HybridNitroWebViewClearCookiesTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewClearCookiesTests"
    ),
    .testTarget(
      // Exercises the Content-Disposition filename parser in
      // `NitroWebViewContentDispositionParser` (which backs
      // `HybridNitroWebView.parseContentDispositionFilename(_:)`).
      // Covers RFC 5987 encoded, quoted plain, unquoted plain, and the
      // missing-filename case.
      name: "HybridNitroWebViewContentDispositionParserTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewContentDispositionParserTests"
    ),
    .testTarget(
      // Verifies that the URI branch of `HybridNitroWebView.applySource(_:)`
      // forwards every merged header to `URLRequest` via
      // `setValue(_:forHTTPHeaderField:)`. Uses an `ApplySourceWireUpProbe`
      // that mirrors the production lines byte-for-byte (build URLRequest,
      // merge headers, setValue loop) and captures the request instead of
      // handing it to a real WKWebView — keeping the test free of WebKit
      // dependencies. The production class is excluded because it depends
      // on Nitro-generated bridge symbols only available at CocoaPods
      // install time.
      name: "HybridNitroWebViewApplySourceWireUpTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewApplySourceWireUpTests"
    ),
    .testTarget(
      // Exercises `HybridNitroWebView.shouldTreatAsDownload(response:
      // canShowMIMEType:)` against the four cases (attachment header,
      // inline header, missing header with unsupported MIME, supported
      // inline MIME) plus close-cousin edges. Uses an
      // `AttachmentDetectionProbe` that mirrors the production helper.
      // The probe takes no dependencies beyond `Foundation` (used
      // implicitly via `HTTPURLResponse`), so it does not technically
      // need the `NitroWebViewSource` target — kept for consistency
      // with the surrounding download/cookie/header test targets.
      name: "HybridNitroWebViewAttachmentDetectionTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewAttachmentDetectionTests"
    ),
    .testTarget(
      // Exercises the navigation-interception plumbing introduced for
      // `onShouldStartLoadWithRequest`:
      //   1. `navigationType(from:)` raw -> spec-token mapping.
      //   2. `shouldStartPayload(for:)` URL + mainDocumentURL + target
      //      frame construction.
      //   3. The in-memory pending-decisions stash that survives until
      //      the JS Promise resolves (NO timeout — iOS parity with RNW).
      // Uses local probe types that mirror the production helpers
      // byte-for-byte because `HybridNitroWebView` cannot be linked into
      // this SwiftPM harness.
      name: "HybridNitroWebViewShouldStartTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewShouldStartTests"
    ),
    .testTarget(
      // Exercises `HybridNitroWebView.cachePolicy(forCacheEnabled:)`, the
      // helper that maps the `cacheEnabled` settings prop to the
      // `URLRequest.cachePolicy` used for the next source-triggered
      // navigation (false -> reloadIgnoringLocalCacheData; true / nil ->
      // useProtocolCachePolicy). Uses a `CachePolicyProbe` that mirrors
      // the production helper because the hybrid class cannot be linked
      // into this harness.
      name: "HybridNitroWebViewCachePolicyTests",
      dependencies: ["NitroWebViewSource"],
      path: "iosTests/Tests/HybridNitroWebViewCachePolicyTests"
    ),
  ]
)
