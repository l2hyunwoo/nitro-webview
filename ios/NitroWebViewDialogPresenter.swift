import UIKit
import WebKit

final class NitroDialogWebView: WKWebView {
  var onDetach: (() -> Void)?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { onDetach?() }
  }
}

final class NitroWebViewDialogPresenter {
  enum Kind {
    case alert, confirm, prompt(String?)
  }

  private var active: NitroWebViewDialogCompletion?
  private weak var alert: UIAlertController?

  func present(in webView: WKWebView, title: String?, message: String,
               kind: Kind, completion: @escaping (String?) -> Void) {
    // Suppress overlapping requests instead of leaving WebKit waiting for a
    // presenter occupied by another dialog or an unrelated native modal.
    guard active == nil, webView.window != nil,
          let presenter = owningController(of: webView),
          presenter.viewIfLoaded?.window === webView.window,
          presenter.presentedViewController == nil,
          !presenter.isBeingDismissed, !presenter.isBeingPresented else {
      completion(nil)
      return
    }

    let pending = NitroWebViewDialogCompletion(completion)
    let dialog = UIAlertController(title: title ?? "Web page", message: message, preferredStyle: .alert)
    if case .prompt(let defaultText) = kind {
      dialog.addTextField { $0.text = defaultText }
    }
    let respond: (String?) -> Void = { [weak self, weak dialog] value in
      // Resolve after dismissal so JS can immediately open its next dialog.
      let complete = {
        self?.finish(pending, value: value)
        pending.resolve(value)
      }
      if let dialog, dialog.presentingViewController != nil {
        dialog.dismiss(animated: false, completion: complete)
      } else {
        complete()
      }
    }
    dialog.addAction(UIAlertAction(title: "OK", style: .default) { [weak dialog] _ in
      if case .prompt = kind {
        respond(dialog?.textFields?.first?.text ?? "")
      } else {
        respond("")
      }
    })
    if case .alert = kind {} else {
      dialog.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in respond(nil) })
    }
    active = pending
    alert = dialog
    presenter.present(dialog, animated: true)
    if dialog.presentingViewController == nil { cancel() }
  }

  func cancel() {
    let pending = active
    let dialog = alert
    active = nil
    alert = nil
    dialog?.dismiss(animated: false)
    pending?.resolve(nil)
  }

  private func finish(_ pending: NitroWebViewDialogCompletion, value: String?) {
    if active === pending {
      active = nil
      alert = nil
    }
    pending.resolve(value)
  }

  private func owningController(of view: UIView) -> UIViewController? {
    var responder: UIResponder? = view.next
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }
}
