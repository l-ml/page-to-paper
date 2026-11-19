import Foundation

struct RemarkableCloudClient {
    var converter = ArticleConverter()

    /// Accepts a draft so the extension can show a result. Does not build an EPUB or open a connection.
    func upload(_ draft: ArticleDraft) -> UploadResult {
        _ = converter.makeEpub(from: draft)
        return UploadResult(
            ok: true,
            message: "Stub accepted. Nothing was uploaded; EPUB conversion and reMarkable Cloud are not implemented.",
            documentId: nil,
            implemented: false
        )
    }
}
