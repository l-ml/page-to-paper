import Foundation
import os
import Security

enum TokenStoreError: Error, Equatable {
    case missingSharedAccessGroup
    case unexpectedStatus(OSStatus)
}

/// Keychain slot for the stub device token. JavaScript cannot read this store.
/// A missing shared access group is a hard failure: the app and extension would otherwise
/// write into separate keychains.
struct TokenStore {
    static let service = "com.example.pagetopaper.device-token"
    static let account = "remarkable-device-token"
    private static let log = Logger(subsystem: "com.example.pagetopaper", category: "keychain")

    private let accessGroup: String?

    init(accessGroup: String? = AppPreferences.keychainAccessGroup) {
        self.accessGroup = accessGroup
    }

    func save(_ data: Data) throws {
        let query = try baseQuery(writing: true)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecSuccess {
            return
        }
        guard updated == errSecItemNotFound else {
            throw TokenStoreError.unexpectedStatus(updated)
        }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw TokenStoreError.unexpectedStatus(status)
        }
    }

    func load() throws -> Data? {
        var query = try baseQuery(writing: false)
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
        let status = SecItemDelete(try baseQuery(writing: false) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError.unexpectedStatus(status)
        }
    }

    private func baseQuery(writing: Bool) throws -> [String: Any] {
        guard let accessGroup, !accessGroup.isEmpty else {
            Self.log.error("Shared Keychain access group is unavailable. Refusing a private keychain the extension cannot read.")
            #if DEBUG
            if writing {
                assertionFailure("Keychain access group is still the unsigned placeholder. The app and extension keychains are separate, so pairing was not stored.")
            }
            #endif
            throw TokenStoreError.missingSharedAccessGroup
        }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}
