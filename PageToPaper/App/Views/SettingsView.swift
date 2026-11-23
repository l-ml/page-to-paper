import SwiftUI

struct SettingsView: View {
    var onResetOnboarding: (() -> Void)? = nil
    var onPairingChanged: (() -> Void)? = nil

    @Environment(\.scenePhase) private var scenePhase
    @State private var paired = false
    @State private var pairingReason: PairingReason?
    @State private var showPairing = false
    @State private var confirmSignOut = false
    #if DEBUG
    @State private var mockFault = MockUploadFault.current()
    #endif

    var body: some View {
        List {
            Section(header: Text("Safari")) {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "safari")
                        .foregroundColor(.accentColor)
                        .accessibilityHidden(true)
                    Text("Enable Page to Paper in Settings → Safari → Extensions, then allow it for the site you are reading.")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, 2)
            }
            Section(header: Text("reMarkable")) {
                NavigationLink(destination: PairingView(reason: $pairingReason), isActive: $showPairing) {
                    HStack {
                        Text("Connection")
                        Spacer()
                        if paired {
                            Label("Connected", systemImage: "checkmark.circle.fill")
                                .foregroundColor(.green)
                        } else {
                            Text("Not paired")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                if paired {
                    Button("Sign out", role: .destructive) { confirmSignOut = true }
                }
            }
            Section(
                header: Text("About"),
                footer: Text("Page to Paper is not affiliated with reMarkable. Cloud upload uses an unofficial API that can change.")
            ) {
                SettingsRow(title: "Display name", value: "Page to Paper")
                SettingsRow(title: "Version", value: "\(shortVersion) (\(buildVersion))")
                SettingsRow(title: "Upload mode", value: "Test mode (mock)")
            }
            #if DEBUG
            Section(header: Text("Developer")) {
                Picker("Mock upload fault", selection: $mockFault) {
                    ForEach(MockUploadFault.allCases, id: \.self) { fault in
                        Text(fault.label).tag(fault)
                    }
                }
                .disabled(!AppPreferences.suiteAvailable)
                .onChange(of: mockFault) { newValue in
                    MockUploadFault.set(newValue)
                }
                Button("Reset onboarding") {
                    AppPreferences.hasCompletedOnboarding = false
                    onResetOnboarding?()
                }
                .disabled(!AppPreferences.suiteAvailable)
                SettingsRow(title: "Bundle ID", value: Bundle.main.bundleIdentifier ?? "com.example.pagetopaper")
                SettingsRow(title: "App Group", value: AppPreferences.appGroupID)
                SettingsRow(title: "Keychain group", value: AppPreferences.keychainAccessGroup ?? "unavailable")
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
        .onChange(of: showPairing) { active in
            if !active {
                refresh()
                onPairingChanged?()
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

    private var buildVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    }

    private func refresh() {
        paired = RemarkableAuth().isPaired()
        #if DEBUG
        mockFault = MockUploadFault.current()
        #endif
    }

    private func signOut() {
        RemarkableAuth().signOut()
        refresh()
        onPairingChanged?()
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
