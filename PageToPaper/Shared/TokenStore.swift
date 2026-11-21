import Foundation
import os
import Security

enum TokenStoreError: Error, Equatable {
    case missingSharedAccessGroup
    case unexpectedStatus(OSStatus)
}

/// Keychain slot for the stub device token. JavaScript cannot read this store.
/// Without a resolved shared access group, device and Release builds refuse the write.
/// A Debug simulator build uses the default keychain group instead of asserting.
struct TokenStore {
    static let service = "com.example.pagetopaper.device-token"
    static let account = "remarkable-device-token"
    private static let log = Logger(subsystem: "com.example.pagetopaper", category: "keychain")

    private let accessGroup: String?
    private static var didLogSimulatorDefault = false

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
        switch KeychainGroupChoice.choose(configured: accessGroup, debugSimulator: Self.debugSimulator) {
        case .explicit(let group):
            return Self.itemQuery(accessGroup: group)
        case .simulatorDefault:
            Self.logSimulatorDefaultOnce()
            return Self.itemQuery(accessGroup: nil)
        case .refuse:
            Self.log.error("Shared Keychain access group is unavailable. Refusing a private keychain the extension cannot read.")
            #if DEBUG
            if writing {
                assertionFailure("Keychain access group is still the unsigned placeholder. The app and extension keychains are separate, so pairing was not stored.")
            }
            #endif
            throw TokenStoreError.missingSharedAccessGroup
        }
    }

    /// True only for a Debug simulator build. Release and device builds stay on the strict path.
    private static var debugSimulator: Bool {
        #if DEBUG && targetEnvironment(simulator)
        true
        #else
        false
        #endif
    }

    private static func itemQuery(accessGroup: String?) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: Self.account,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        return query
    }

    private static func logSimulatorDefaultOnce() {
        if didLogSimulatorDefault { return }
        didLogSimulatorDefault = true
        log.error("Shared keychain access group is unresolved. Simulator Debug is using the default keychain group. Release and device builds refuse this.")
    }
}

/// How a keychain query names its access group. A resolved team group is explicit.
/// A Debug simulator with no team uses the process default. Everything else refuses.
enum KeychainGroupChoice: Equatable {
    case explicit(String)
    case simulatorDefault
    case refuse

    static func choose(configured: String?, debugSimulator: Bool) -> KeychainGroupChoice {
        if let configured {
            let trimmed = configured.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return .explicit(trimmed)
            }
        }
        if debugSimulator {
            return .simulatorDefault
        }
        return .refuse
    }
}
