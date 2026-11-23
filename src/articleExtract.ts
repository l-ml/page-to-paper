import { Readability } from "@mozilla/readability";
import { limits } from "./messaging";

export interface ExtractedArticle {
  title?: string;
  byline?: string;
  html?: string;
}

const dropElementsSelector =
  "script, style, noscript, iframe, object, embed, svg, canvas, video, audio, form, button, input, select, textarea, template";

const wrapperTags = new Set(["div", "article", "section", "main"]);
const truncationNotice = "<p><em>[Article truncated to fit the EPUB size limit.]</em></p>";

/**
 * Extracts readable article metadata and sanitized HTML from a cloned DOM so
 * the live page is never mutated. Returns `{}` on non-article pages or parse failures.
 */
export function extractReadableArticle(doc: Document, pageUrl: string): ExtractedArticle {
  try {
    const clone = doc.cloneNode(true) as Document;
    ensureBaseHref(clone, pageUrl);
    const parsed = new Readability(clone, { charThreshold: 120 }).parse();
    if (!parsed) return {};

    const title = parsed.title?.trim() || undefined;
    const byline = parsed.byline?.trim() || undefined;
    const rawHtml = parsed.content?.trim();
    const html = rawHtml
      ? cleanAndBoundHtml(rawHtml, doc, {
          title,
          maxLength: limits.html,
          baseUrl: pageUrl,
        })
      : undefined;

    const result: ExtractedArticle = {};
    if (title) result.title = title;
    if (byline) result.byline = byline;
    if (html) result.html = html;
    return result;
  } catch {
    return {};
  }
}

/**
 * Strips heavy/non-article nodes and unused attributes, preserves image alt text,
 * deduplicates a leading title H1, and bounds the serialized HTML to `maxLength`.
 */
export function cleanAndBoundHtml(
  rawHtml: string,
  doc: Document,
  options: { title?: string; maxLength: number; baseUrl?: string },
): string | undefined {
  if (!rawHtml.trim() || options.maxLength <= 0) return undefined;

  const container = doc.createElement("div");
  container.innerHTML = rawHtml;

  for (const node of Array.from(container.querySelectorAll(dropElementsSelector))) {
    node.remove();
  }

  for (const img of Array.from(container.querySelectorAll("img"))) {
    const alt = img.getAttribute("alt")?.trim() ?? "";
    if (!alt) {
      img.remove();
      continue;
    }
    for (const attr of Array.from(img.attributes)) {
      if (attr.name !== "alt") {
        img.removeAttribute(attr.name);
      }
    }
    img.setAttribute("alt", alt);
  }

  for (const el of Array.from(container.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if (tag === "img") continue;
    let safeHref: string | undefined;
    if (tag === "a") {
      const rawHref = el.getAttribute("href")?.trim();
      if (rawHref) {
        safeHref = normalizeLinkHref(rawHref, options.baseUrl);
      }
    }
    for (const attr of Array.from(el.attributes)) {
      el.removeAttribute(attr.name);
    }
    if (safeHref) {
      el.setAttribute("href", safeHref);
    }
  }

  removeDuplicateTitleHeading(container, options.title);

  const fullText = normalizeWhitespace(container.textContent ?? "");
  if (!fullText) return undefined;

  const initial = container.innerHTML.trim();
  if (initial.length <= options.maxLength) {
    return initial;
  }

  return boundContainerHtml(container, fullText, options.maxLength);
}

function ensureBaseHref(clone: Document, pageUrl: string): void {
  if (!/^https?:\/\//i.test(pageUrl) || clone.querySelector("base")) return;
  const base = clone.createElement("base");
  base.setAttribute("href", pageUrl);
  const head = clone.head ?? clone.querySelector("head");
  if (head) {
    head.prepend(base);
    return;
  }
  if (clone.documentElement) {
    const createdHead = clone.createElement("head");
    createdHead.appendChild(base);
    clone.documentElement.prepend(createdHead);
  }
}

function normalizeLinkHref(rawHref: string, baseUrl?: string): string | undefined {
  if (rawHref.startsWith("#")) return rawHref;
  if (/^https?:\/\//i.test(rawHref)) return rawHref;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawHref)) return undefined;
  if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
    try {
      const resolved = new URL(rawHref, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        return resolved.href;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function unwrapSingleContainer(root: Element): Element {
  let current = root;
  while (true) {
    const meaningful = Array.from(current.childNodes).filter(isMeaningfulNode);
    if (meaningful.length === 1 && meaningful[0].nodeType === 1) {
      const child = meaningful[0] as Element;
      if (wrapperTags.has(child.tagName.toLowerCase())) {
        current = child;
        continue;
      }
    }
    break;
  }
  return current;
}

function isMeaningfulNode(node: ChildNode): boolean {
  return node.nodeType === 1 || (node.nodeType === 3 && (node.textContent ?? "").trim().length > 0);
}

function removeDuplicateTitleHeading(container: Element, title?: string): void {
  const normalizedTitle = normalizeWhitespace(title ?? "").toLowerCase();
  if (!normalizedTitle) return;
  const host = unwrapSingleContainer(container);
  const first = Array.from(host.childNodes).find(isMeaningfulNode);
  if (!first || first.nodeType !== 1) return;
  const element = first as Element;
  if (element.tagName.toLowerCase() !== "h1") return;
  const headingText = normalizeWhitespace(element.textContent ?? "").toLowerCase();
  if (headingText === normalizedTitle) {
    element.remove();
  }
}

function boundContainerHtml(container: Element, fullText: string, maxLength: number): string | undefined {
  const target = unwrapSingleContainer(container);
  while (target.lastChild && container.innerHTML.trim().length + truncationNotice.length > maxLength) {
    target.lastChild.remove();
  }

  if ((target.textContent ?? "").trim().length > 0) {
    const noticeHost = container.ownerDocument.createElement("div");
    noticeHost.innerHTML = truncationNotice;
    while (noticeHost.firstChild) {
      target.appendChild(noticeHost.firstChild);
    }
    const candidate = container.innerHTML.trim();
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  return truncatedPlainFallback(fullText, maxLength);
}

function truncatedPlainFallback(fullText: string, maxLength: number): string | undefined {
  const wrapperOverhead = "<p></p>".length + truncationNotice.length;
  if (maxLength <= wrapperOverhead) {
    if (maxLength < "<p></p>".length + 1) return undefined;
    const textBudget = maxLength - "<p></p>".length;
    const clipped = escapeClippedText(fullText, textBudget);
    return clipped ? `<p>${clipped}</p>` : undefined;
  }
  const textBudget = maxLength - wrapperOverhead;
  const clipped = escapeClippedText(fullText, textBudget);
  return clipped ? `<p>${clipped}</p>${truncationNotice}` : truncationNotice;
}

function escapeClippedText(text: string, maxEscapedLength: number): string {
  if (maxEscapedLength <= 0) return "";
  let out = "";
  for (const ch of text) {
    const escaped = escapeHtmlChar(ch);
    if (out.length + escaped.length > maxEscapedLength) break;
    out += escaped;
  }
  return out.trimEnd();
}

function escapeHtmlChar(ch: string): string {
  switch (ch) {
    case "&":
      return "&amp;";
    case "<":
      return "&lt;";
    case ">":
      return "&gt;";
    case '"':
      return "&quot;";
    case "'":
      return "&#39;";
    default:
      return ch;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
