import SwiftUI

struct OnboardingView: View {
    var continueAction: () -> Void

    private let steps = [
        "Enable Page to Paper in Settings → Safari → Extensions.",
        "Pair your reMarkable with a one-time code.",
        "Tap Page to Paper in the Safari toolbar to send.",
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Page to Paper")
                    .font(.largeTitle.weight(.semibold))
                Text("Send the article you’re reading in Safari to your reMarkable Inbox as an EPUB.")
                    .font(.body)
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(index + 1)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.white)
                                .frame(width: 28, height: 28)
                                .background(Circle().fill(Color.accentColor))
                            Text(step)
                                .font(.body)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                Button(action: continueAction) {
                    Text("Continue")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(24)
        }
        .navigationTitle("Welcome")
        .navigationBarTitleDisplayMode(.inline)
    }
}
