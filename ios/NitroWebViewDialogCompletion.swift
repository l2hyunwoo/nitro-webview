/// Shared by user actions and lifecycle cancellation. Clear before invoking
/// WebKit, since completing a dialog can synchronously cause another request.
final class NitroWebViewDialogCompletion {
  private var handler: ((String?) -> Void)?

  init(_ handler: @escaping (String?) -> Void) {
    self.handler = handler
  }

  func resolve(_ value: String?) {
    let completion = handler
    handler = nil
    completion?(value)
  }

  deinit {
    handler?(nil)
  }
}
