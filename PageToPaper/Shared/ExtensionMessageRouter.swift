import Foundation

enum MessageSecrets {
    static let keys: Set<String> = [
        "token",
        "accessToken",
        "deviceToken",
        "refreshToken",
        "password",
        "secret",
    ]

    static func containsSecret(_ value: Any) -> Bool {
        if let dictionary = value as? [String: Any] {
            for (key, child) in dictionary where keys.contains(key) || containsSecret(child) {
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
