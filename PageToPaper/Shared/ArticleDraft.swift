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
              rawURL.count <= ArticleDraftLimits.url,
              let url = URL(string: rawURL),
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
