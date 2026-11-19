import Foundation

/// Keep in sync with src/pairingCode.ts. There is no Swift test target in this scaffold.
enum PairingCode {
    static let pattern = "^[a-z0-9]{8}$"

    /// Trim, lowercase, then strip spaces and hyphens.
    static func normalize(_ input: String) -> String {
        let lowered = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var result = ""
        for character in lowered where character != "-" && !character.isWhitespace && !character.isNewline {
            result.append(character)
        }
        return result
    }

    static func isValid(_ input: String) -> Bool {
        let code = normalize(input)
        return code.range(of: pattern, options: .regularExpression) != nil
    }
}

enum PairingReason: String, Equatable {
    case expired
    case required
    case unreachable
}

struct PairingLink: Equatable {
    var reason: PairingReason?

    /// `pagetopaper://pair` with an optional `reason`. Unknown params and reasons are ignored.
    static func parse(_ url: URL) -> PairingLink? {
        guard url.scheme?.lowercased() == "pagetopaper", url.host?.lowercased() == "pair" else {
            return nil
        }
        let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first { $0.name == "reason" }?
            .value?
            .lowercased()
        return PairingLink(reason: raw.flatMap(PairingReason.init(rawValue:)))
    }
}
