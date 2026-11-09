import Foundation

enum AppPreferences {
    static let appGroupID = "group.com.example.pagetopaper"
    static let keychainAccessGroupSuffix = "com.example.pagetopaper.shared"
    private static let onboardingKey = "hasCompletedOnboarding"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    static var hasCompletedOnboarding: Bool {
        get { defaults.bool(forKey: onboardingKey) }
        set { defaults.set(newValue, forKey: onboardingKey) }
    }

    /// Team-prefixed Keychain access group, read from the processed Info.plist.
    /// Nil when the placeholder has not been signed, so TokenStore does not write.
    static var keychainAccessGroup: String? {
        guard let configured = Bundle.main.object(forInfoDictionaryKey: "PageToPaperKeychainAccessGroup") as? String else {
            return nil
        }
        let trimmed = configured.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains("$(") else {
            return nil
        }
        return trimmed
    }
}
