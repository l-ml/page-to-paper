import Foundation

struct UploadResult: Equatable {
    var ok: Bool
    var message: String
    var documentId: String?

    var asDictionary: [String: Any] {
        var payload: [String: Any] = [
            "ok": ok,
            "message": message,
        ]
        if let documentId, !documentId.isEmpty {
            payload["documentId"] = documentId
        }
        return payload
    }
}
