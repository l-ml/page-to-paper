import { isExtractRequest } from "./messaging";

function readByline(): string | undefined {
  const selectors = ['meta[name="author"]', 'meta[property="article:author"]'];
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return undefined;
}

function extractDraft(): { type: "articleDraft"; title: string; url: string; byline?: string } {
  const draft: { type: "articleDraft"; title: string; url: string; byline?: string } = {
    type: "articleDraft",
    title: document.title.trim() || "Untitled",
    url: location.href,
  };
  const byline = readByline();
  if (byline) draft.byline = byline;
  return draft;
}

/** Registers the reader once per page, including when the popup injects this file again. */
export function installReader(): void {
  const scope = globalThis as { __pageToPaperReader?: boolean };
  if (scope.__pageToPaperReader) return;
  scope.__pageToPaperReader = true;
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtractRequest(message)) return;
    sendResponse(extractDraft());
    return true;
  });
}

installReader();
