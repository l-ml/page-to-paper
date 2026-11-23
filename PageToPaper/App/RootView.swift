import SwiftUI

enum HomeDestination: Hashable {
    case pairing
    case settings
}

struct RootView: View {
    @State private var hasCompletedOnboarding = AppPreferences.hasCompletedOnboarding
    @State private var destination: HomeDestination?
    @State private var pendingPairingAfterDismiss = false
    @State private var pairingReason: PairingReason?
    @State private var openPairingAfterOnboarding = false

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
                    HomeView(destination: $destination, pairingReason: $pairingReason) {
                        pendingPairingAfterDismiss = false
                        destination = nil
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
                            destination = .pairing
                        }
                    }
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .accentColor(.blue)
        .onOpenURL(perform: open)
        .onChange(of: destination) { current in
            if current == nil && pendingPairingAfterDismiss {
                pendingPairingAfterDismiss = false
                if hasCompletedOnboarding {
                    DispatchQueue.main.async {
                        if hasCompletedOnboarding && destination == nil {
                            destination = .pairing
                        }
                    }
                }
            }
        }
    }

    private func open(_ url: URL) {
        guard let link = PairingLink.parse(url) else { return }
        pairingReason = link.reason
        if hasCompletedOnboarding {
            if destination == .settings {
                pendingPairingAfterDismiss = true
                destination = nil
            } else {
                pendingPairingAfterDismiss = false
                destination = .pairing
            }
        } else {
            openPairingAfterOnboarding = true
        }
    }
}

struct HomeView: View {
    @Binding var destination: HomeDestination?
    @Binding var pairingReason: PairingReason?
    var onResetOnboarding: () -> Void = {}

    @Environment(\.scenePhase) private var scenePhase
    @State private var didOfferPairing = false
    @State private var paired = false

    var body: some View {
        List {
            Section {
                NavigationLink(
                    destination: PairingView(reason: $pairingReason, onPairingChanged: refreshPairing),
                    tag: HomeDestination.pairing,
                    selection: $destination
                ) {
                    HStack {
                        Text("Pairing")
                        Spacer()
                        Text(paired ? "Connected" : "Not paired")
                            .foregroundColor(paired ? .green : .secondary)
                    }
                }
                NavigationLink(
                    destination: SettingsView(onResetOnboarding: onResetOnboarding, onPairingChanged: refreshPairing),
                    tag: HomeDestination.settings,
                    selection: $destination
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
            if !paired && destination == nil {
                destination = .pairing
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                refreshPairing()
            }
        }
        .onChange(of: destination) { current in
            if current == nil {
                refreshPairing()
            }
        }
    }

    private func refreshPairing() {
        paired = RemarkableAuth().isPaired()
    }
}
