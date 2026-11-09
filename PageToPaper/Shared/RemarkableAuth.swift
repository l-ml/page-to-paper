import Foundation

/// Placeholder for a future device-token exchange.
/// This build never contacts reMarkable and never stores a token.
struct RemarkableAuth {
    var store = TokenStore()

    func isPaired() -> Bool {
        guard let data = try? store.load() else {
            return false
        }
        return !data.isEmpty
    }
}
