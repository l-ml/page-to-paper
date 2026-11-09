import Foundation
import os

enum AppPreferences {
    static let appGroupID = "group.com.example.pagetopaper"
    static let keychainAccessGroupSuffix = "com.example.pagetopaper.shared"
    private static let onboardingKey = "hasCompletedOnboarding"
    private static let log = Logger(subsystem: "com.example.pagetopaper", category: "preferences")
    private static var didReportMissingSuite = false

    /// False when the suite cannot be opened. This build never falls back to UserDefaults.standard.
    static var suiteAvailable: Bool {
        UserDefaults(suiteName: appGroupID) != nil
    }

    static var hasCompletedOnboarding: Bool {
        get { suite()?.bool(forKey: onboardingKey) ?? false }
        set { suite()?.set(newValue, forKey: onboardingKey) }
    }

    /// Team-prefixed Keychain access group from the processed Info.plist.
    /// Nil while the value is still the `$(AppIdentifierPrefix)` placeholder.
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

    private static func suite() -> UserDefaults? {
        if let defaults = UserDefaults(suiteName: appGroupID) {
            return defaults
        }
        if !didReportMissingSuite {
            didReportMissingSuite = true
            log.error("App Group \(appGroupID, privacy: .public) is unavailable. Refusing UserDefaults.standard.")
        }
        return nil
    }
}
