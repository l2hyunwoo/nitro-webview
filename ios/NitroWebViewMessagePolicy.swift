import Foundation

/// Message sender policy is independent of the top-level navigation URL.
enum NitroWebViewMessagePolicy {
  struct Compiled {
    let origins: Set<String>?
    let error: String?

    init(_ values: [String]?) {
      guard let values else { origins = nil; error = nil; return }
      let canonical = values.compactMap(NitroWebViewMessagePolicy.canonicalOrigin)
      origins = Set(canonical)
      error = canonical.count == values.count ? nil
        : "allowedMessageOrigins accepts only exact HTTP(S) origins."
    }

    func allows(_ senderOrigin: String?) -> Bool {
      guard error == nil else { return false }
      guard let origins else { return true }
      guard let senderOrigin, let target = NitroWebViewMessagePolicy.canonicalOrigin(senderOrigin) else { return false }
      return origins.contains(target)
    }
  }
  private static let hostCharacters = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789.-[]:")

  static func canonicalOrigin(_ value: String) -> String? {
    guard value.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
      let parts = URLComponents(string: value),
      let scheme = parts.scheme?.lowercased(), ["http", "https"].contains(scheme),
      let serialized = parts.string, let hostRange = parts.rangeOfHost
    else { return nil }
    // The serialized host preserves IDNA encoding and IPv6 brackets.
    let host = serialized[hostRange].lowercased()
    guard !host.isEmpty,
      host.unicodeScalars.allSatisfy(hostCharacters.contains),
      parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
      ["", "/"].contains(parts.path),
      !serialized[hostRange.upperBound...].hasPrefix(":") || parts.port != nil,
      parts.port == nil || (1...65535).contains(parts.port!)
    else { return nil }
    let port = parts.port ?? (scheme == "https" ? 443 : 80)
    let defaultPort = scheme == "https" ? 443 : 80
    return "\(scheme)://\(host)" + (port == defaultPort ? "" : ":\(port)")
  }

  static func senderOrigin(scheme: String, host: String, port: Int) -> String {
    let host = host.contains(":") && !host.hasPrefix("[") ? "[\(host)]" : host
    let value = "\(scheme)://\(host)" + (port == 0 ? "" : ":\(port)")
    return canonicalOrigin(value) ?? "null"
  }

  static func configurationError(_ origins: [String]?) -> String? {
    Compiled(origins).error
  }

  static func allows(_ origins: [String]?, senderOrigin: String?) -> Bool {
    Compiled(origins).allows(senderOrigin)
  }
}
