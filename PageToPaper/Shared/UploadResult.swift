import Foundation

struct UploadResult: Equatable {
    var ok: Bool
    var message: String
    var documentId: String?
    /// False for this scaffold. The popup shows success only when this is true.
    var implemented: Bool = false
    /// Set on failures so the popup does not guess a token-clearing kind from the message text.
    var errorKind: String?

    var asDictionary: [String: Any] {
        var payload: [String: Any] = [
            "ok": ok,
            "message": message,
            "implemented": implemented,
        ]
        if let documentId, !documentId.isEmpty {
            payload["documentId"] = documentId
        }
        if let errorKind, !errorKind.isEmpty {
            payload["errorKind"] = errorKind
        }
        return payload
    }
}
