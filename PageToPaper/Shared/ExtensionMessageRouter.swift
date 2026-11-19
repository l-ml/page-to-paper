import Foundation

enum MessageSecrets {
    /// Any non-ASCII key is rejected. ASCII keys are matched as substrings after
    /// NFKC, trim, lowercase, and stripping non-alphanumerics.
    /// `token` covers deviceToken and refreshToken. Mirrors `isSecretKey` in src/messaging.ts.
    static let stems = ["token", "password", "secret", "apikey", "accesstoken", "authorization", "bearer"]

    static func normalize(_ key: String) -> String {
        let folded = key.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return String(folded.filter { $0.isLetter || $0.isNumber })
    }

    static func isSecretKey(_ key: String) -> Bool {
        if key.unicodeScalars.contains(where: { $0.value > 127 }) {
            return true
        }
        let normalized = normalize(key)
        return !normalized.isEmpty && stems.contains { normalized.contains($0) }
    }

    static func containsSecret(_ value: Any) -> Bool {
        if let dictionary = value as? [String: Any] {
            for (key, child) in dictionary where isSecretKey(key) || containsSecret(child) {
                return true
            }
            return false
        }
        if let array = value as? [Any] {
            return array.contains { containsSecret($0) }
        }
        return false
    }
}

/// 8 to 80 ASCII letters, digits, and hyphens. Keep in sync with `isIdempotencyKey`.
enum IdempotencyKey {
    static let minimumCount = 8
    static let maximumCount = 80

    static func parse(_ value: Any?) -> String? {
        guard let text = value as? String else { return nil }
        if text.count < minimumCount || text.count > maximumCount { return nil }
        for scalar in text.unicodeScalars {
            let code = scalar.value
            let digit = code >= 48 && code <= 57
            let upper = code >= 65 && code <= 90
            let lower = code >= 97 && code <= 122
            if !digit && !upper && !lower && code != 45 { return nil }
        }
        return text
    }
}

enum ExtensionMessageRouter {
    static func respond(to body: [String: Any]?) async -> [String: Any] {
        guard let body else {
            return failure("Empty message from the extension.", kind: "appUnreachable")
        }
        if MessageSecrets.containsSecret(body) {
            return failure("Refusing a message that carries secrets.", kind: "unknown")
        }
        if (body["type"] as? String) == "pairingStatus" {
            return ["paired": RemarkableAuth().isPaired()]
        }
        if (body["type"] as? String) == "clearPairing" {
            RemarkableAuth().signOut()
            return ["ok": true, "cleared": true]
        }
        guard (body["type"] as? String) == "uploadArticle" else {
            return failure("Unsupported message.", kind: "unknown")
        }
        guard let draft = ArticleDraft.parse(from: body["draft"]) else {
            return failure("The article needs a title and an http(s) URL.", kind: "unsupportedPage")
        }
        guard RemarkableAuth().isPaired() else {
            return failure("Pair your reMarkable in the Page to Paper app.", kind: "notPaired")
        }
        guard let key = IdempotencyKey.parse(body["idempotencyKey"]) else {
            return failure("The send payload is not valid.", kind: "unsupportedPage")
        }
        return await RemarkableCloudClient().upload(draft, idempotencyKey: key).asDictionary
    }

    private static func failure(_ message: String, kind: String) -> [String: Any] {
        UploadResult(ok: false, message: message, documentId: nil, errorKind: kind).asDictionary
    }
}
