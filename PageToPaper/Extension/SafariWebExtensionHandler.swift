import Foundation

/// Dictionary key Safari uses for `browser.runtime.sendNativeMessage`.
/// Shipping SDKs mark the SafariServices constant for this key unavailable below iOS 17.
/// This target is iOS 15.4, so the handler uses the literal key instead.
enum SafariExtensionMessage {
    static let key = "message"
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let body = item?.userInfo?[SafariExtensionMessage.key] as? [String: Any]
        let result = ExtensionMessageRouter.respond(to: body)

        let response = NSExtensionItem()
        response.userInfo = [SafariExtensionMessage.key: result]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
