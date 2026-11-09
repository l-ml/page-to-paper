import SwiftUI

struct RootView: View {
    @State private var hasCompletedOnboarding = AppPreferences.hasCompletedOnboarding
    @State private var showPairing = false
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
                    HomeView(showPairing: $showPairing, pairingReason: $pairingReason)
                } else {
                    OnboardingView {
                        AppPreferences.hasCompletedOnboarding = true
                        hasCompletedOnboarding = true
                        if openPairingAfterOnboarding || !RemarkableAuth().isPaired() {
                            showPairing = true
                        }
                    }
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
        .accentColor(.blue)
        .onOpenURL(perform: open)
    }

    private func open(_ url: URL) {
        guard let link = PairingLink.parse(url) else { return }
        pairingReason = link.reason
        if hasCompletedOnboarding {
            showPairing = true
        } else {
            openPairingAfterOnboarding = true
        }
    }
}

struct HomeView: View {
    @Binding var showPairing: Bool
    @Binding var pairingReason: PairingReason?
    @State private var didOfferPairing = false

    var body: some View {
        List {
            Section {
                NavigationLink(destination: PairingView(reason: $pairingReason), isActive: $showPairing) {
                    Text("Pairing")
                }
                NavigationLink(destination: SettingsView()) {
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
            guard !didOfferPairing else { return }
            didOfferPairing = true
            if !RemarkableAuth().isPaired() {
                showPairing = true
            }
        }
    }
}
