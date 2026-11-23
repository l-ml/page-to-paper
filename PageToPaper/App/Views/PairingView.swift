import SwiftUI

struct PairingView: View {
    @Binding var reason: PairingReason?

    @Environment(\.scenePhase) private var scenePhase
    @State private var paired = false
    @State private var code = ""
    @State private var showsError = false
    @State private var confirmSignOut = false
    @State private var replacing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                status
                reasonCallout
                if paired && !replacing {
                    Text("This device can send EPUBs to your reMarkable Inbox.")
                        .font(.body)
                    Button {
                        confirmSignOut = true
                    } label: {
                        Text("Sign out")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .foregroundColor(.red)
                    Button(action: repair) {
                        Text("Re-pair")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Text("Enter the one-time code from your reMarkable account to connect Cloud upload.")
                        .font(.body)
                    if let connectURL = URL(string: "https://my.remarkable.com/device/browser/connect") {
                        Link(destination: connectURL) {
                            Label("Get code at my.remarkable.com", systemImage: "arrow.up.right.square")
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .padding(.horizontal, 12)
                                .background(Color.accentColor.opacity(0.12))
                                .cornerRadius(10)
                        }
                    }
                    Text("It is an 8-character single-use code that expires in about 5 minutes.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                    TextField("Enter pairing code", text: $code)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.asciiCapable)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .textContentType(.oneTimeCode)
                        .frame(minHeight: 44)
                    Button(action: pair) {
                        Text("Pair")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!PairingCode.isValid(code))
                    if replacing {
                        Button("Cancel") {
                            replacing = false
                            code = ""
                            showsError = false
                            reason = nil
                            refresh()
                        }
                        .frame(minHeight: 44)
                    }
                    if showsError {
                        Text("Couldn’t pair. Check the code and try again. Codes are single use and expire in a few minutes.")
                            .font(.footnote)
                            .foregroundColor(.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Text("When connected, the device token is stored in the Keychain — never in extension JavaScript.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
            .padding(24)
        }
        .navigationTitle("Pairing")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            refresh()
            syncReason()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                refresh()
                syncReason()
            }
        }
        .onChange(of: reason) { _ in
            syncReason()
        }
        .onChange(of: code) { _ in
            if showsError {
                showsError = false
            }
        }
        .confirmationDialog("Sign out of reMarkable on this device?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive, action: signOut)
            Button("Cancel", role: .cancel) {}
        }
    }

    private var status: some View {
        let title = replacing ? "New code" : (paired ? "Connected" : "Not paired")
        let symbol = paired && !replacing ? "checkmark.circle" : "link"
        return Label(title, systemImage: symbol)
            .font(.title2)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(title)
    }

    @ViewBuilder
    private var reasonCallout: some View {
        if let message = reasonBanner {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: reason == .unreachable ? "info.circle.fill" : "exclamationmark.triangle.fill")
                    .foregroundColor(reason == .unreachable ? .accentColor : .orange)
                    .accessibilityHidden(true)
                Text(message)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.secondary.opacity(0.12))
            .cornerRadius(10)
        }
    }

    private var reasonBanner: String? {
        switch reason {
        case .expired:
            return (!paired || replacing)
                ? "Your reMarkable session expired. Enter a fresh one-time code to reconnect."
                : nil
        case .required:
            return (!paired || replacing)
                ? "Pair your reMarkable before sending pages from Safari."
                : nil
        case .unreachable:
            return "Page to Paper is open. Return to Safari and tap Retry."
        case .none:
            return nil
        }
    }

    private func syncReason() {
        switch reason {
        case .expired:
            if paired && !replacing {
                replacing = true
            }
        case .required:
            if paired && !replacing {
                reason = nil
            }
        case .unreachable, .none:
            break
        }
    }

    private func refresh() {
        if replacing { return }
        paired = RemarkableAuth().isPaired()
        if paired {
            showsError = false
        }
    }

    private func pair() {
        if RemarkableAuth().pair(withCode: code) {
            code = ""
            showsError = false
            reason = nil
            replacing = false
            refresh()
        } else {
            showsError = true
        }
    }

    private func signOut() {
        RemarkableAuth().signOut()
        code = ""
        showsError = false
        reason = nil
        refresh()
    }

    private func repair() {
        code = ""
        showsError = false
        if reason == .unreachable {
            reason = nil
        }
        replacing = true
    }
}
