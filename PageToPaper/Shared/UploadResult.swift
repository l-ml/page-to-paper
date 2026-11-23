import Foundation

struct UploadResult: Equatable {
    var ok: Bool
    var message: String
    var documentId: String?
    /// True only when a real upload happened. A mock result stays false, and the popup shows Sent only then.
    var implemented: Bool = false
    /// True when the mock transport handled the send. The popup must not present that as a real send.
    var mock: Bool = false
    /// Set on failures so the popup does not guess a token-clearing kind from the message text.
    var errorKind: String?

    var asDictionary: [String: Any] {
        var payload: [String: Any] = [
            "ok": ok,
            "message": message,
            "implemented": implemented,
        ]
        if mock {
            payload["mock"] = true
        }
        if let documentId, !documentId.isEmpty {
            payload["documentId"] = documentId
        }
        if let errorKind, !errorKind.isEmpty {
            payload["errorKind"] = errorKind
        }
        return payload
    }
}
