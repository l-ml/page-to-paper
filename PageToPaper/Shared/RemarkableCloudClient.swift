import Foundation
import os

/// Per-call budget for one transport send. The popup waits longer than this so a timeout can be shown.
enum UploadTiming {
    static let transportTimeout: TimeInterval = 20

    static func withTimeout<T: Sendable>(
        _ seconds: TimeInterval,
        operation: @escaping @Sendable () async throws -> T
    ) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask {
                try await operation()
            }
            group.addTask {
                try await Task.sleep(nanoseconds: Self.nanoseconds(seconds))
                throw UploadTimedOut()
            }
            do {
                guard let value = try await group.next() else {
                    group.cancelAll()
                    throw UploadTimedOut()
                }
                group.cancelAll()
                return value
            } catch {
                group.cancelAll()
                throw error
            }
        }
    }

    fileprivate static func nanoseconds(_ seconds: TimeInterval) -> UInt64 {
        if seconds <= 0 { return 0 }
        return UInt64(seconds * 1_000_000_000)
    }
}

struct UploadTimedOut: Error {}

struct UploadRequest: Sendable, Equatable {
    var epub: Data
    var idempotencyKey: String
}

struct UploadReceipt: Sendable, Equatable {
    var documentId: String
    var mock: Bool
    var replay: Bool
}

/// Sends one EPUB. Implementations must stop promptly when the task is cancelled.
/// The timeout cannot return until `send` returns, so a transport that ignores
/// cancellation holds the result past the popup's wait.
protocol UploadTransport: Sendable {
    func send(_ request: UploadRequest) async throws -> UploadReceipt
}

enum MockTransportError: Error {
    case empty
    case rejected
    case rateLimited
}

/// DEBUG-only fault for a manual timeout, failure, or rate limit. Release builds ignore it.
/// App Group suite `group.com.example.pagetopaper`, key `mockUploadFault`: `slow`, `fail`, or `ratelimit`.
enum MockUploadFault: String, CaseIterable, Equatable {
    case off
    case fail
    case slow
    case rateLimit = "ratelimit"

    static let preferenceKey = "mockUploadFault"

    var label: String {
        switch self {
        case .off: return "Off"
        case .fail: return "Fail"
        case .slow: return "Slow (timeout)"
        case .rateLimit: return "Rate limit"
        }
    }

    static func current() -> MockUploadFault {
        #if DEBUG
        let raw = UserDefaults(suiteName: AppPreferences.appGroupID)?
            .string(forKey: preferenceKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        switch raw {
        case "fail": return .fail
        case "slow": return .slow
        case "ratelimit", "rate_limit", "rate-limit": return .rateLimit
        default: return .off
        }
        #else
        return .off
        #endif
    }

    #if DEBUG
    static func set(_ fault: MockUploadFault) {
        guard let defaults = UserDefaults(suiteName: AppPreferences.appGroupID) else { return }
        if fault == .off {
            defaults.removeObject(forKey: preferenceKey)
        } else {
            defaults.set(fault.rawValue, forKey: preferenceKey)
        }
    }
    #endif
}

/// In-memory stand-in for a cloud upload. There is no network call.
/// Keys live until this process is killed. Safari may kill the extension, so a replay after that is best-effort.
actor MockUploadTransport: UploadTransport {
    static let shared = MockUploadTransport()

    private var receipts: [String: UploadReceipt] = [:]

    init() {}

    func send(_ request: UploadRequest) async throws -> UploadReceipt {
        guard !request.epub.isEmpty else {
            throw MockTransportError.empty
        }
        if var existing = receipts[request.idempotencyKey] {
            existing.replay = true
            trace(id: existing.documentId, replay: true)
            return existing
        }
        switch MockUploadFault.current() {
        case .fail:
            throw MockTransportError.rejected
        case .rateLimit:
            throw MockTransportError.rateLimited
        case .off, .slow:
            break
        }
        let created = UploadReceipt(
            documentId: "mock-\(UUID().uuidString.lowercased())",
            mock: true,
            replay: false
        )
        receipts[request.idempotencyKey] = created
        trace(id: created.documentId, replay: false)
        if MockUploadFault.current() == .slow {
            try await Task.sleep(nanoseconds: UploadTiming.nanoseconds(UploadTiming.transportTimeout + 5))
        }
        return created
    }

    private func trace(id: String, replay: Bool) {
        let stored = String(receipts.count)
        let replayed = replay ? "true" : "false"
        Logger(subsystem: "com.example.pagetopaper", category: "mock-upload")
            .info("mock document \(id, privacy: .public) replay=\(replayed, privacy: .public) stored=\(stored, privacy: .public)")
    }
}

struct RemarkableCloudClient {
    var converter = ArticleConverter()
    var transport: any UploadTransport

    init(transport: any UploadTransport = MockUploadTransport.shared) {
        self.transport = transport
    }

    /// Builds an EPUB and hands it to the transport. The default transport is a mock and opens no connection.
    func upload(_ draft: ArticleDraft, idempotencyKey: String) async -> UploadResult {
        let epub: Data
        switch converter.makeEpub(from: draft) {
        case .failure(.tooLarge):
            return UploadResult(
                ok: false,
                message: "This page is too large to save as an EPUB.",
                documentId: nil,
                implemented: false,
                errorKind: "unsupportedPage"
            )
        case .failure(.unrepresentable):
            return Self.unprepared()
        case .epub(let data):
            epub = data
        }
        guard !epub.isEmpty, epub.count <= EpubLimits.maxBytes else {
            return Self.unprepared()
        }
        let request = UploadRequest(epub: epub, idempotencyKey: idempotencyKey)
        let transport = self.transport
        do {
            let receipt = try await UploadTiming.withTimeout(UploadTiming.transportTimeout) {
                try await transport.send(request)
            }
            return Self.accepted(receipt)
        } catch MockTransportError.rateLimited {
            return UploadResult(
                ok: false,
                message: "Too many sends. Please wait a moment and try again.",
                documentId: nil,
                implemented: false,
                errorKind: "rateLimit"
            )
        } catch is UploadTimedOut {
            return UploadResult(
                ok: false,
                message: "The send timed out.",
                documentId: nil,
                implemented: false,
                errorKind: "timeout"
            )
        } catch {
            return UploadResult(
                ok: false,
                message: "The send could not be completed.",
                documentId: nil,
                implemented: false,
                errorKind: "unknown"
            )
        }
    }

    private static func accepted(_ receipt: UploadReceipt) -> UploadResult {
        if receipt.mock {
            return UploadResult(
                ok: true,
                message: "Test mode: nothing was uploaded to your reMarkable.",
                documentId: receipt.documentId,
                implemented: false,
                mock: true
            )
        }
        return UploadResult(
            ok: true,
            message: "Saved to Inbox as EPUB.",
            documentId: receipt.documentId,
            implemented: true,
            mock: false
        )
    }

    private static func unprepared() -> UploadResult {
        UploadResult(
            ok: false,
            message: "The page could not be prepared as an EPUB.",
            documentId: nil,
            implemented: false,
            errorKind: "unsupportedPage"
        )
    }
}
