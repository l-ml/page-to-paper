import SwiftUI

struct OnboardingView: View {
    var continueAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Spacer()
            Text("Page to Paper")
                .font(.largeTitle.weight(.semibold))
            Text("Send the article you are reading in Safari to your reMarkable Cloud Inbox.")
                .font(.title3)
            Text("This version is a scaffold. Pairing, EPUB conversion, and upload are not implemented. reMarkable’s cloud API is unofficial and can change.")
                .foregroundStyle(.secondary)
            Spacer()
            Button("Continue", action: continueAction)
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity, alignment: .center)
        }
        .padding(24)
        .navigationTitle("Welcome")
    }
}
