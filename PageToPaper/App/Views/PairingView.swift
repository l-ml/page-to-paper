import SwiftUI

struct PairingView: View {
    @Binding var reason: PairingReason?

    @Environment(\.scenePhase) private var scenePhase
    @State private var paired = false
    @State private var code = ""
    @State private var showsError = false
    @State private var confirmSignOut = false
    @State private var confirmRepair = false
    @State private var replacing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                status
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
                    Button {
                        confirmRepair = true
                    } label: {
                        Text("Re-pair")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Text("Enter the one-time code from your reMarkable account to connect Cloud upload.")
                        .font(.body)
                    Text("Get an 8-character code at my.remarkable.com/device/browser/connect. It is single use and expires in about 5 minutes.")
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
                            refresh()
                        }
                        .frame(minHeight: 44)
                    }
                    if showsError {
                        Text("Couldn’t pair. Check the code and try again.")
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
            noteReason()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                refresh()
            }
        }
        .onChange(of: reason) { _ in
            noteReason()
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
        .confirmationDialog("Enter a new pairing code?", isPresented: $confirmRepair, titleVisibility: .visible) {
            Button("Re-pair", action: repair)
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

    private func refresh() {
        if replacing { return }
        paired = RemarkableAuth().isPaired()
        if paired {
            showsError = false
        }
    }

    private func noteReason() {
        if reason == .expired && !paired {
            showsError = true
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
        reason = nil
        replacing = true
    }
}
