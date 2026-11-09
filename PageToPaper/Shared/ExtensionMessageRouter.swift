import Foundation

enum MessageSecrets {
    /// Matched as substrings after NFKC, trim, lowercase, and stripping non-alphanumerics.
    /// `token` covers deviceToken and refreshToken. Mirrors `isSecretKey` in src/messaging.ts.
    static let stems = ["token", "password", "secret", "apikey", "accesstoken", "authorization", "bearer"]

    static func normalize(_ key: String) -> String {
        let folded = key.precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return String(folded.filter { $0.isLetter || $0.isNumber })
    }

    static func containsSecret(_ value: Any) -> Bool {
        if let dictionary = value as? [String: Any] {
            for (key, child) in dictionary {
                let normalized = normalize(key)
                let keyIsSecret = !normalized.isEmpty && stems.contains { normalized.contains($0) }
                if keyIsSecret || containsSecret(child) {
                    return true
                }
            }
            return false
        }
        if let array = value as? [Any] {
            return array.contains { containsSecret($0) }
        }
        return false
    }
}

enum ExtensionMessageRouter {
    static func respond(to body: [String: Any]?) -> [String: Any] {
        guard let body else {
            return failure("Empty message from the extension.")
        }
        if MessageSecrets.containsSecret(body) {
            return failure("Refusing a message that carries secrets.")
        }
        if (body["type"] as? String) == "pairingStatus" {
            return ["paired": RemarkableAuth().isPaired()]
        }
        if (body["type"] as? String) == "clearPairing" {
            RemarkableAuth().signOut()
            return ["ok": true, "cleared": true]
        }
        guard (body["type"] as? String) == "uploadArticle" else {
            return failure("Unsupported message.")
        }
        guard let draft = ArticleDraft.parse(from: body["draft"]) else {
            return failure("The article needs a title and an http(s) URL.")
        }
        return RemarkableCloudClient().upload(draft).asDictionary
    }

    private static func failure(_ message: String) -> [String: Any] {
        UploadResult(ok: false, message: message, documentId: nil).asDictionary
    }
}
