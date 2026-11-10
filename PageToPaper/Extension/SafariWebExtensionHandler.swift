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
        let result = Self.reply(for: context)
        let response = NSExtensionItem()
        response.userInfo = [SafariExtensionMessage.key: result]
        nativeLog.info("completeRequest")
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    /// Every path returns a dictionary. `beginRequest` always passes that dictionary to `completeRequest`.
    private static func reply(for context: NSExtensionContext) -> [String: Any] {
        nativeLog.info("beginRequest")
        guard let item = context.inputItems.first as? NSExtensionItem else {
            nativeLog.error("beginRequest missing item")
            return [
                "ok": false,
                "implemented": false,
                "message": "Empty message from the extension.",
            ]
        }
        let body = item.userInfo?[SafariExtensionMessage.key] as? [String: Any]
        let type = body?["type"] as? String ?? "missing"
        nativeLog.info("native message type=\(type, privacy: .public)")
        return ExtensionMessageRouter.respond(to: body)
    }
}
