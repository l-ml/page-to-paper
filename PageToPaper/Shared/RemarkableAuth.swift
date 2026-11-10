import Foundation

/// Stores a normalized pairing code as a stand-in device token.
/// This build does not contact reMarkable. The extension cannot read the token.
struct RemarkableAuth {
    var store = TokenStore()

    func isPaired() -> Bool {
        guard let data = try? store.load() else {
            return false
        }
        return !data.isEmpty
    }

    /// Saves the code only when it matches the 8-character pairing format. No network call.
    func pair(withCode code: String) -> Bool {
        let normalized = PairingCode.normalize(code)
        guard PairingCode.isValid(code), let data = normalized.data(using: .utf8), !data.isEmpty else {
            return false
        }
        do {
            try store.save(data)
            guard let stored = try store.load(), stored == data else {
                return false
            }
        } catch {
            return false
        }
        return true
    }

    func signOut() {
        try? store.delete()
    }
}
