import SwiftUI

struct SettingsView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var paired = false
    @State private var pairingReason: PairingReason?
    @State private var confirmSignOut = false

    var body: some View {
        List {
            Section(header: Text("Safari")) {
                Text("Enable Page to Paper in Settings → Safari → Extensions, then allow it for the site you are reading.")
            }
            Section(header: Text("reMarkable")) {
                NavigationLink(destination: PairingView(reason: $pairingReason)) {
                    HStack {
                        Text("Connection")
                        Spacer()
                        Text(paired ? "Connected" : "Not paired")
                            .foregroundColor(.secondary)
                    }
                }
                Button("Sign out") { confirmSignOut = true }
                    .foregroundColor(.red)
            }
            Section(
                header: Text("About"),
                footer: Text("Page to Paper is not affiliated with reMarkable. Cloud upload uses an unofficial API that can change.")
            ) {
                SettingsRow(title: "Display name", value: "Page to Paper")
                SettingsRow(title: "Version", value: shortVersion)
            }
            #if DEBUG
            Section(header: Text("Developer")) {
                SettingsRow(title: "Bundle ID", value: Bundle.main.bundleIdentifier ?? "com.example.pagetopaper")
                SettingsRow(title: "App Group", value: AppPreferences.appGroupID)
                SettingsRow(title: "Keychain group", value: AppPreferences.keychainAccessGroupSuffix)
            }
            Section(header: Text("Before TestFlight")) {
                Text("Replace com.example.pagetopaper, the App Group, and the Keychain access group, then set your development team. Those identifiers are placeholders.")
            }
            #endif
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: refresh)
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                refresh()
            }
        }
        .confirmationDialog("Sign out of reMarkable on this device?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive, action: signOut)
            Button("Cancel", role: .cancel) {}
        }
    }

    private var shortVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
    }

    private func refresh() {
        paired = RemarkableAuth().isPaired()
    }

    private func signOut() {
        RemarkableAuth().signOut()
        refresh()
    }
}

private struct SettingsRow: View {
    var title: String
    var value: String

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }
}
