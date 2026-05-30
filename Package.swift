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
      // `Bridge.h` is the only non-Swift artefact in `ios/` today.
      exclude: ["Bridge.h"],
      sources: [
        "NitroWebViewSourceHandler.swift",
        "NitroWebViewMessageHandler.swift",
        "NitroWebViewErrorMapper.swift",
        "NitroWebViewEvaluateJavaScriptHandler.swift",
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
  ]
)
