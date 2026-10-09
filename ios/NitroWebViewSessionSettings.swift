import Foundation

struct NitroWebViewSessionSettings: Equatable {
  let incognito: Bool
  let sharedCookies: Bool
  let javaScript: Bool

  func error(comparedTo mounted: Self?) -> String? {
    if incognito && sharedCookies {
      return "incognito and sharedCookiesEnabled cannot be enabled together."
    }
    if let mounted, self != mounted {
      return "incognito, sharedCookiesEnabled and javaScriptEnabled are initial settings. Remount with a new key."
    }
    return nil
  }
}
