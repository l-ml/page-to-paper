import Foundation

struct ArticleConverter {
    /// Scaffold placeholder. EPUB generation is intentionally not implemented.
    func makeEpub(from draft: ArticleDraft) -> Data? {
        _ = (draft.title, draft.url, draft.html, draft.byline)
        return nil
    }
}
