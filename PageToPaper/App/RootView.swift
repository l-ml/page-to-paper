import SwiftUI

struct RootView: View {
    @State private var hasCompletedOnboarding = AppPreferences.hasCompletedOnboarding

    var body: some View {
        NavigationView {
            if hasCompletedOnboarding {
                HomeView()
            } else {
                OnboardingView {
                    AppPreferences.hasCompletedOnboarding = true
                    hasCompletedOnboarding = true
                }
            }
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
}

struct HomeView: View {
    var body: some View {
        List {
            Section {
                NavigationLink(destination: PairingView()) {
                    Text("Pairing")
                }
                NavigationLink(destination: SettingsView()) {
                    Text("Settings")
                }
            }
            Section {
                Text("Use the Safari toolbar button to send the page you are reading. This build does not upload anything.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Page to Paper")
    }
}
