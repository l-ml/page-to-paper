import { extractReadableArticle } from "./articleExtract";
import { isExtractRequest, limits } from "./messaging";

function readByline(): string | undefined {
  const selectors = ['meta[name="author"]', 'meta[property="article:author"]'];
  for (const selector of selectors) {
    const content = document.querySelector(selector)?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return undefined;
}

interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}

function segmentsOf(value: string): Iterable<string> {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (locales: undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter;
    }
  ).Segmenter;
  if (typeof Segmenter !== "function") return Array.from(value);
  try {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(value), (part) => part.segment);
  } catch {
    return Array.from(value);
  }
}

/** Stops on a whole grapheme, and never exceeds `max` UTF-16 units (what `parseArticleDraft` checks). */
function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  let out = "";
  for (const segment of segmentsOf(trimmed)) {
    if (out.length + segment.length > max) break;
    out += segment;
  }
  return out;
}

/** Title and byline are clipped to the shared limits. The URL is left intact so an over-long one can be rejected as unsupported. */
export function articleFields(
  title: string,
  url: string,
  byline?: string,
  html?: string,
): { title: string; url: string; byline?: string; html?: string } {
  const fields: { title: string; url: string; byline?: string; html?: string } = {
    title: clip(title, limits.title) || "Untitled",
    url,
  };
  const clippedByline = byline ? clip(byline, limits.byline) : "";
  if (clippedByline) fields.byline = clippedByline;
  const trimmedHtml = html?.trim();
  if (trimmedHtml && trimmedHtml.length <= limits.html) {
    fields.html = trimmedHtml;
  }
  return fields;
}

function extractDraft(): { type: "articleDraft"; title: string; url: string; byline?: string; html?: string } {
  const extracted = extractReadableArticle(document, location.href);
  const fields = articleFields(
    extracted.title || document.title,
    location.href,
    extracted.byline || readByline(),
    extracted.html,
  );
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
