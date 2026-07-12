import Foundation

/// Native→web message-delivery statement builder — the Swift mirror of
/// `src/bridgeScript.ts`'s `encodeJsStringLiteral` / `buildPostMessageScript`.
///
/// Lives standalone (not on `HybridNitroWebView`) so `swift test` can exercise
/// the escaping on the macOS host without linking the Nitro/WKWebView-bound
/// hybrid class — the same seam pattern used by
/// `NitroWebViewContentDispositionParser`. The hybrid re-exposes these via
/// `HybridNitroWebView.postMessageScript(_:)` and delivers the emitted
/// statement through `WKWebView.evaluateJavaScript(_, completionHandler: nil)`.
enum NitroWebViewPostMessage {
  /// Escape a string into a JavaScript *source* string literal (double-quoted,
  /// quotes included). Mirrors the TS `encodeJsStringLiteral`:
  ///
  ///   - `JSONSerialization` produces a valid JSON string for quotes,
  ///     backslashes, newlines, and control chars — the same escapes
  ///     `JSON.stringify` emits. It needs a container, so we serialize a
  ///     single-element array and strip the surrounding `[` / `]`.
  ///   - Like `JSON.stringify`, it leaves U+2028 / U+2029 RAW, which are
  ///     illegal *unescaped* inside a JS string literal on pre-ES2019 engines.
  ///     We post-escape them so the emitted statement always parses.
  static func encodeJsStringLiteral(_ value: String) -> String {
    let literal: String
    if let data = try? JSONSerialization.data(
      withJSONObject: [value],
      options: []
    ),
      let array = String(data: data, encoding: .utf8) {
      // `["<escaped>"]` → drop the outer brackets to get `"<escaped>"`.
      literal = String(array.dropFirst().dropLast())
    } else {
      // Defensive: JSONSerialization never fails for a [String], but fall
      // back to a bare quoted form rather than emitting invalid JS.
      literal = "\"\(value)\""
    }
    return
      literal
      .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
      .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
  }

  /// Build the one-shot delivery statement. iOS dispatches on `window`
  /// (react-native-webview parity — `RNCWebViewImpl.m:1113`).
  static func buildStatement(_ message: String) -> String {
    let data = encodeJsStringLiteral(message)
    return "window.dispatchEvent(new MessageEvent('message',{data:\(data)}));"
  }
}
