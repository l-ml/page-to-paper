import Foundation

enum MessageSecrets {
    /// Normalized like `normalizeSecretKey` in src/messaging.ts: lowercased, `_` and `-` removed.
    static let normalizedKeys: Set<String> = [
        "token",
        "password",
        "secret",
        "accesstoken",
        "authorization",
        "bearer",
        "devicetoken",
        "refreshtoken",
    ]

    static func normalize(_ key: String) -> String {
        String(key.lowercased().filter { $0 != "_" && $0 != "-" })
    }

    static func containsSecret(_ value: Any) -> Bool {
        if let dictionary = value as? [String: Any] {
            for (key, child) in dictionary where normalizedKeys.contains(normalize(key)) || containsSecret(child) {
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
