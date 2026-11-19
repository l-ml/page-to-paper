import { isExtractRequest, limits } from "./messaging";

function readByline(): string | undefined {
  const selectors = ['meta[name="author"]', 'meta[property="article:author"]'];
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return undefined;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

/** Title and byline are clipped to the shared limits. The URL is left intact so an over-long one can be rejected as unsupported. */
export function articleFields(title: string, url: string, byline?: string): { title: string; url: string; byline?: string } {
  const fields: { title: string; url: string; byline?: string } = {
    title: clip(title, limits.title) || "Untitled",
    url,
  };
  const clippedByline = byline ? clip(byline, limits.byline) : "";
  if (clippedByline) fields.byline = clippedByline;
  return fields;
}

function extractDraft(): { type: "articleDraft"; title: string; url: string; byline?: string } {
  const fields = articleFields(document.title, location.href, readByline());
  return { type: "articleDraft", ...fields };
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
