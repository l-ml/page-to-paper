import Foundation
import os

/// Dictionary key Safari uses for `browser.runtime.sendNativeMessage`.
/// Shipping SDKs mark the SafariServices constant for this key unavailable below iOS 17.
/// This target is iOS 15.4, so the handler uses the literal key instead.
enum SafariExtensionMessage {
    static let key = "message"
}

private let nativeLog = Logger(subsystem: "com.example.pagetopaper", category: "native-message")

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        nativeLog.info("beginRequest")
        guard let item = context.inputItems.first as? NSExtensionItem else {
            nativeLog.error("beginRequest missing item")
            Self.finish(context, result: [
                "ok": false,
                "implemented": false,
                "message": "Empty message from the extension.",
                "errorKind": "appUnreachable",
            ])
            return
        }
        let body = item.userInfo?[SafariExtensionMessage.key] as? [String: Any]
        let type = body?["type"] as? String ?? "missing"
        nativeLog.info("native message type=\(type, privacy: .public)")
        // The handler entry point is synchronous. The task finishes by calling completeRequest.
        Task {
            let result = await ExtensionMessageRouter.respond(to: body)
            Self.finish(context, result: result)
        }
    }

    /// Every path passes a dictionary to `completeRequest`.
    private static func finish(_ context: NSExtensionContext, result: [String: Any]) {
        if let documentId = result["documentId"] as? String {
            nativeLog.info("upload documentId=\(documentId, privacy: .public)")
        }
        if let errorKind = result["errorKind"] as? String {
            nativeLog.error("upload errorKind=\(errorKind, privacy: .public)")
        }
        let response = NSExtensionItem()
        response.userInfo = [SafariExtensionMessage.key: result]
        nativeLog.info("completeRequest")
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
