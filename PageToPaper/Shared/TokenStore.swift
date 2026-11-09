import Foundation
import Security

enum TokenStoreError: Error, Equatable {
    case missingAccessGroup
    case unexpectedStatus(OSStatus)
}

/// Shared Keychain slot for a future reMarkable device token.
/// The scaffold never writes a token. JavaScript cannot read this store.
struct TokenStore {
    static let service = "com.example.pagetopaper.device-token"
    static let account = "remarkable-device-token"

    private let accessGroup: String?

    init(accessGroup: String? = AppPreferences.keychainAccessGroup) {
        self.accessGroup = accessGroup
    }

    func save(_ data: Data) throws {
        try delete()
        var query = try baseQuery()
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw TokenStoreError.unexpectedStatus(status)
        }
    }

    func load() throws -> Data? {
        var query = try baseQuery()
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
        let status = SecItemDelete(try baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError.unexpectedStatus(status)
        }
    }

    private func baseQuery() throws -> [String: Any] {
        guard let accessGroup, !accessGroup.isEmpty else {
            throw TokenStoreError.missingAccessGroup
        }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}
