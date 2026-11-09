import SwiftUI

struct SettingsView: View {
    var body: some View {
        List {
            Section(header: Text("Safari")) {
                Text("Enable Page to Paper in Settings → Safari → Extensions, then allow it for the site you are reading.")
            }
            Section(header: Text("This build")) {
                SettingsRow(title: "Display name", value: "Page to Paper")
                SettingsRow(title: "Bundle ID", value: Bundle.main.bundleIdentifier ?? "com.example.pagetopaper")
                SettingsRow(title: "App Group", value: AppPreferences.appGroupID)
                SettingsRow(title: "Keychain group", value: AppPreferences.keychainAccessGroupSuffix)
                SettingsRow(title: "Version", value: shortVersion)
            }
            Section(header: Text("Before TestFlight")) {
                Text("Replace com.example.pagetopaper, the App Group, and the Keychain access group, then set your development team. Those identifiers are placeholders.")
            }
        }
        .navigationTitle("Settings")
    }

    private var shortVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
    }
}

private struct SettingsRow: View {
    var title: String
    var value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.body)
                .textSelection(.enabled)
        }
        .padding(.vertical, 4)
    }
}
