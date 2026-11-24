import SwiftUI

struct RootView: View {
    @State private var hasCompletedOnboarding = AppPreferences.hasCompletedOnboarding
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
                        pairingRefreshToken: pairingRefreshToken,
                        onOfferPairing: {
                            if !showPairingSheet {
                                showPairingSheet = true
                            }
                        },
                        onResetOnboarding: {
                            showPairingSheet = false
                            pairingReason = nil
                            openPairingAfterOnboarding = false
                            hasCompletedOnboarding = false
                        }
                    )
                } else {
                    OnboardingView {
                        AppPreferences.hasCompletedOnboarding = true
                        hasCompletedOnboarding = true
                        if openPairingAfterOnboarding || !RemarkableAuth().isPaired() {
                            openPairingAfterOnboarding = false
                            showPairingSheet = true
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
            showPairingSheet = true
        } else {
            openPairingAfterOnboarding = true
        }
    }
}

struct HomeView: View {
    var pairingRefreshToken: Int = 0
    var onOfferPairing: () -> Void = {}
    var onResetOnboarding: () -> Void = {}

    @Environment(\.scenePhase) private var scenePhase
    @State private var didOfferPairing = false
    @State private var paired = false
    @State private var manualPairingReason: PairingReason?

    var body: some View {
        List {
            Section {
                NavigationLink(
                    destination: PairingView(
                        reason: $manualPairingReason,
                        refreshToken: pairingRefreshToken,
                        onPairingChanged: refreshPairing
                    )
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
            if !paired {
                onOfferPairing()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
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
