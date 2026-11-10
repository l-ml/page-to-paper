import Foundation
import os

enum KeychainSharing {
    static let sharedSuffix = "com.example.pagetopaper.shared"

    /// Mirrors `isUsableSharedGroup` in src/keychainGroup.ts.
    static func isUsableSharedGroup(group: String?, developmentTeam: String?) -> Bool {
        let team = developmentTeam?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let raw = group?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if team.isEmpty || team.contains("$(") { return false }
        if raw.isEmpty || raw.contains("$") { return false }
        if raw == sharedSuffix { return false }
        let teamID = team.hasSuffix(".") ? String(team.dropLast()) : team
        if teamID.isEmpty { return false }
        return raw == teamID + "." + sharedSuffix
    }
}

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

    /// Nil unless the built Info.plist resolved a real development team and a matching access group.
    /// An empty DEVELOPMENT_TEAM expands away the `$(...)` placeholder, so the check uses the resolved strings.
    static var keychainAccessGroup: String? {
        let group = Bundle.main.object(forInfoDictionaryKey: "PageToPaperKeychainAccessGroup") as? String
        let team = Bundle.main.object(forInfoDictionaryKey: "PageToPaperDevelopmentTeam") as? String
        guard KeychainSharing.isUsableSharedGroup(group: group, developmentTeam: team) else {
            return nil
        }
        return group?.trimmingCharacters(in: .whitespacesAndNewlines)
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
