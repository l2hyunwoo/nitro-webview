import Foundation

/// Main-thread-owned WebKit decisions. Unresolved decisions have no timeout.
final class NitroWebViewNavigationDecisions {
  private var handlers: [UUID: (Bool) -> Void] = [:]

  var count: Int { handlers.count }

  func park(_ handler: @escaping (Bool) -> Void) -> UUID {
    precondition(Thread.isMainThread)
    let id = UUID()
    handlers[id] = handler
    return id
  }

  func resolve(_ id: UUID, allow: Bool) {
    guard Thread.isMainThread else {
      DispatchQueue.main.async { [weak self] in
        self?.resolve(id, allow: allow)
      }
      return
    }
    // Remove first: calling WebKit can synchronously reenter this manager.
    let handler = handlers.removeValue(forKey: id)
    handler?(allow)
  }

  func cancelAll() {
    precondition(Thread.isMainThread)
    let pending = handlers
    handlers.removeAll()
    for handler in pending.values { handler(false) }
  }
}
