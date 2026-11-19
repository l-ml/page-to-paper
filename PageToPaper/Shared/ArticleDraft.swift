import Foundation

enum ArticleDraftLimits {
    static let title = 300
    static let byline = 200
    static let html = 500_000
    static let url = 2_000
}

struct ArticleDraft: Equatable {
    var title: String
    var url: String
    var html: String?
    var byline: String?

    /// Accepts the `draft` object from an `uploadArticle` message.
    /// Field limits match `src/messaging.ts`.
    static func parse(from value: Any?) -> ArticleDraft? {
        guard let body = value as? [String: Any], !MessageSecrets.containsSecret(body) else {
            return nil
        }
        guard let title = nonEmpty(body["title"]), title.count <= ArticleDraftLimits.title else {
            return nil
        }
        guard let rawURL = nonEmpty(body["url"]),
              let bridgedURL = percentEncodingBridgeCharacters(in: rawURL),
              bridgedURL.count <= ArticleDraftLimits.url,
              let url = URL(string: bridgedURL),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.user == nil,
              url.password == nil,
              let host = url.host,
              !host.isEmpty
        else {
            return nil
        }

        let html: String?
        switch optionalText(body["html"], max: ArticleDraftLimits.html) {
        case .absent:
            html = nil
        case .value(let text):
            html = text
        case .invalid:
            return nil
        }

        let byline: String?
        switch optionalText(body["byline"], max: ArticleDraftLimits.byline) {
        case .absent:
            byline = nil
        case .value(let text):
            byline = text
        case .invalid:
            return nil
        }

        return ArticleDraft(title: title, url: url.absoluteString, html: html, byline: byline)
    }

    /// `[]{}|^` stay raw in a WHATWG path or query. `URL(string:)` on iOS 15 and 16 returns nil for them.
    /// Brackets in the host are left alone so an IPv6 literal still parses.
    private static func percentEncodingBridgeCharacters(in raw: String) -> String {
        let tailStart = pathStart(in: raw)
        return String(raw[..<tailStart]) + encodeReserved(String(raw[tailStart...]))
    }

    private static func pathStart(in raw: String) -> String.Index {
        guard let scheme = raw.range(of: "://") else {
            return raw.startIndex
        }
        let afterScheme = raw[scheme.upperBound...]
        return afterScheme.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) ?? raw.endIndex
    }

    private static func encodeReserved(_ tail: String) -> String {
        var encoded = ""
        for scalar in tail.unicodeScalars {
            switch scalar.value {
            case 91, 93, 123, 125, 124, 94:
                encoded += String(format: "%%%02X", scalar.value)
            default:
                encoded.unicodeScalars.append(scalar)
            }
        }
        return encoded
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let text = value as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private enum OptionalText {
    case absent
    case value(String)
    case invalid
}

private func optionalText(_ value: Any?, max: Int) -> OptionalText {
    if value == nil || value is NSNull {
        return .absent
    }
    guard let text = value as? String else { return .invalid }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return .absent }
    if trimmed.count > max { return .invalid }
    return .value(trimmed)
}
