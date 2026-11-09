import Foundation
import Security

enum TokenStoreError: Error, Equatable {
    case unexpectedStatus(OSStatus)
}

/// Keychain slot for the stub device token. JavaScript cannot read this store.
/// When the shared access group is not signed yet, the item stays in the app’s local keychain
/// so Pair and Sign out can change what the screens show. It is not shared with the extension until the group exists.
struct TokenStore {
    static let service = "com.example.pagetopaper.device-token"
    static let account = "remarkable-device-token"

    private let accessGroup: String?

    init(accessGroup: String? = AppPreferences.keychainAccessGroup) {
        self.accessGroup = accessGroup
    }

    func save(_ data: Data) throws {
        try delete()
        var query = baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw TokenStoreError.unexpectedStatus(status)
        }
    }

    func load() throws -> Data? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw TokenStoreError.unexpectedStatus(status)
        }
        return item as? Data
    }

    func delete() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError.unexpectedStatus(status)
        }
    }

    private func baseQuery() -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
        ]
        if let accessGroup, !accessGroup.isEmpty {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }
}
