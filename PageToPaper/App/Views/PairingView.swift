import SwiftUI

struct PairingView: View {
    @State private var paired = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label(paired ? "Paired" : "Not paired", systemImage: paired ? "checkmark.circle" : "link")
                .font(.title2)
            Text("Device-token pairing with reMarkable Cloud is not implemented. This build never stores a token, and the extension cannot see secrets.")
            Text("When pairing exists, the device token will live in the shared Keychain access group. It will not live in extension JavaScript or in UserDefaults.")
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .navigationTitle("Pairing")
        .onAppear {
            paired = RemarkableAuth().isPaired()
        }
    }
}
