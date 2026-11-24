import SwiftUI

struct RootView: View {
    @State private var hasCompletedOnboarding = AppPreferences.hasCompletedOnboarding
    @State private var showPairing = false
    @State private var showPairingSheet = false
    @State private var pairingReason: PairingReason?
    @State private var openPairingAfterOnboarding = false
    @State private var pairingRefreshToken = 0

    var body: some View {
        VStack(spacing: 0) {
            #if DEBUG
            if !AppPreferences.suiteAvailable {
                Text("The App Group is unavailable, so preferences were not saved.")
                    .font(.footnote)
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .background(Color.red.opacity(0.15))
            }
            #endif
            navigation
        }
    }

    private var navigation: some View {
        NavigationView {
            Group {
                if hasCompletedOnboarding {
                    HomeView(
                        showPairing: $showPairing,
                        pairingReason: $pairingReason,
                        isPairingSheetPresented: showPairingSheet,
                        pairingRefreshToken: pairingRefreshToken
                    ) {
                        showPairing = false
                        showPairingSheet = false
                        pairingReason = nil
                        openPairingAfterOnboarding = false
                        hasCompletedOnboarding = false
                    }
                } else {
                    OnboardingView {
                        AppPreferences.hasCompletedOnboarding = true
                        hasCompletedOnboarding = true
                        if openPairingAfterOnboarding || !RemarkableAuth().isPaired() {
                            openPairingAfterOnboarding = false
                            showPairing = true
                        }
                    }
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .accentColor(.blue)
        .onOpenURL(perform: open)
        .sheet(isPresented: $showPairingSheet, onDismiss: {
            pairingReason = nil
            pairingRefreshToken += 1
        }) {
            NavigationView {
                PairingView(reason: $pairingReason, refreshToken: pairingRefreshToken) {
                    pairingRefreshToken += 1
                }
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            showPairingSheet = false
                        }
                    }
                }
            }
            .navigationViewStyle(StackNavigationViewStyle())
            .accentColor(.blue)
        }
    }

    private func open(_ url: URL) {
        guard let link = PairingLink.parse(url) else { return }
        pairingReason = link.reason
        pairingRefreshToken += 1
        if hasCompletedOnboarding {
            if !showPairing {
                showPairingSheet = true
            }
        } else {
            openPairingAfterOnboarding = true
        }
    }
}

struct HomeView: View {
    @Binding var showPairing: Bool
    @Binding var pairingReason: PairingReason?
    var isPairingSheetPresented: Bool = false
    var pairingRefreshToken: Int = 0
    var onResetOnboarding: () -> Void = {}

    @Environment(\.scenePhase) private var scenePhase
    @State private var didOfferPairing = false
    @State private var paired = false

    var body: some View {
        List {
            Section {
                NavigationLink(
                    destination: PairingView(
                        reason: $pairingReason,
                        refreshToken: pairingRefreshToken,
                        onPairingChanged: refreshPairing
                    ),
                    isActive: $showPairing
                ) {
                    HStack {
                        Text("Pairing")
                        Spacer()
                        Text(paired ? "Connected" : "Not paired")
                            .foregroundColor(paired ? .green : .secondary)
                    }
                }
                NavigationLink(
                    destination: SettingsView(
                        pairingRefreshToken: pairingRefreshToken,
                        onResetOnboarding: onResetOnboarding,
                        onPairingChanged: refreshPairing
                    )
                ) {
                    Text("Settings")
                }
            }
            Section {
                Text("Use the Safari toolbar button to send the page you are reading.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
        .listStyle(InsetGroupedListStyle())
        .navigationTitle("Page to Paper")
        .onAppear {
            refreshPairing()
            guard !didOfferPairing else { return }
            didOfferPairing = true
            if !paired && !showPairing && !isPairingSheetPresented {
                showPairing = true
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                refreshPairing()
            }
        }
        .onChange(of: showPairing) { active in
            if !active {
                if !isPairingSheetPresented {
                    pairingReason = nil
                }
                refreshPairing()
            }
        }
        .onChange(of: pairingRefreshToken) { _ in
            refreshPairing()
        }
    }

    private func refreshPairing() {
        paired = RemarkableAuth().isPaired()
    }
}
