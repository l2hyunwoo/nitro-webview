import Foundation

/// Keep WebKit calls on main without waiting for a busy UI thread.
enum NitroWebViewMainThread {
  static func run(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() }
    else { DispatchQueue.main.async(execute: action) }
  }
}
