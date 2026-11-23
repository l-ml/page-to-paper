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
      ? cleanAndBoundHtml(rawHtml, clone, {
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
 * Parses HTML in an inert document, strips heavy/non-article nodes, comments,
 * unused attributes, and dead fragment links, preserves image alt text,
 * deduplicates a leading title heading, and bounds output to `maxLength` in linear time.
 */
export function cleanAndBoundHtml(
  rawHtml: string,
  doc: Document,
  options: { title?: string; maxLength: number; baseUrl?: string },
): string | undefined {
  if (!rawHtml.trim() || options.maxLength <= 0) return undefined;

  const inert = doc.implementation.createHTMLDocument("");
  const container = inert.createElement("div");
  container.innerHTML = rawHtml;

  stripComments(container);

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

  for (const anchor of Array.from(container.querySelectorAll("a"))) {
    if (!anchor.hasAttribute("href")) {
      unwrapElement(anchor);
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

function stripComments(root: Node): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 8) {
      root.removeChild(child);
    } else if (child.hasChildNodes()) {
      stripComments(child);
    }
  }
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  el.remove();
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
  if (rawHref.startsWith("#")) return undefined;
  if (/^https?:\/\//i.test(rawHref)) {
    try {
      const parsed = new URL(rawHref);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return rawHref;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
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
  const tag = element.tagName.toLowerCase();
  if (tag !== "h1" && tag !== "h2") return;
  const headingText = normalizeWhitespace(element.textContent ?? "").toLowerCase();
  if (headingText === normalizedTitle) {
    element.remove();
  }
}

function serializedTextLength(text: string): number {
  let len = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 38) len += 5; // &amp;
    else if (code === 60 || code === 62) len += 4; // &lt; / &gt;
    else if (code === 0x00a0) len += 6; // &nbsp;
    else len += 1;
  }
  return len;
}

function serializedNodeLength(node: ChildNode): number {
  if (node.nodeType === 1) return (node as Element).outerHTML.length;
  if (node.nodeType === 3) return serializedTextLength(node.textContent ?? "");
  return 0;
}

function truncateElementToBudget(el: Element, budget: number): boolean {
  if (budget <= 0) {
    el.textContent = "";
    return false;
  }
  const children = Array.from(el.childNodes);
  let used = 0;
  let cutIndex = -1;
  for (let i = 0; i < children.length; i += 1) {
    const len = serializedNodeLength(children[i]);
    if (used + len > budget) {
      cutIndex = i;
      break;
    }
    used += len;
  }
  if (cutIndex === -1) {
    return used > 0 && (el.textContent ?? "").trim().length > 0;
  }
  for (let i = children.length - 1; i > cutIndex; i -= 1) {
    children[i].remove();
  }
  const cutChild = children[cutIndex];
  if (cutChild.nodeType === 1) {
    const childEl = cutChild as Element;
    const remaining = budget - used;
    const overhead = (childEl.cloneNode(false) as Element).outerHTML.length;
    if (childEl.attributes.length === 0 && childEl.childNodes.length > 1 && remaining > overhead) {
      const kept = truncateElementToBudget(childEl, remaining - overhead);
      if (kept) return (el.textContent ?? "").trim().length > 0;
    }
  }
  cutChild.remove();
  return (el.textContent ?? "").trim().length > 0;
}

function hasTextBefore(parent: Element, stopBefore: ChildNode | undefined): boolean {
  for (let node = parent.firstChild; node && node !== stopBefore; node = node.nextSibling) {
    if ((node.textContent ?? "").trim().length > 0) {
      return true;
    }
  }
  return false;
}

function boundContainerHtml(container: Element, fullText: string, maxLength: number): string | undefined {
  const target = unwrapSingleContainer(container);

  let wrapperOverhead = 0;
  let cursor: Element | null = target;
  while (cursor && cursor !== container) {
    const parent: Element | null = cursor.parentElement;
    if (parent) {
      for (const sibling of Array.from(parent.childNodes)) {
        if (sibling !== cursor && sibling.nodeType === 3 && !(sibling.textContent ?? "").trim()) {
          sibling.remove();
        }
      }
    }
    wrapperOverhead += (cursor.cloneNode(false) as Element).outerHTML.length;
    cursor = parent;
  }

  const budget = maxLength - truncationNotice.length - wrapperOverhead;
  const kept = truncateElementToBudget(target, budget);

  if (kept) {
    const noticeHost = container.ownerDocument.createElement("div");
    noticeHost.innerHTML = truncationNotice;
    const noticeNodes = Array.from(noticeHost.childNodes);
    const firstNotice = noticeNodes[0];
    for (const node of noticeNodes) {
      target.appendChild(node);
    }

    let candidate = container.innerHTML.trim();
    if (candidate.length <= maxLength && hasTextBefore(target, firstNotice)) {
      return candidate;
    }

    // Bounded safety trim in case serialization pushed candidate slightly over budget
    let pops = 0;
    while (candidate.length > maxLength && pops < 4) {
      const prev = firstNotice?.previousSibling;
      if (!prev) break;
      prev.remove();
      pops += 1;
      if (!hasTextBefore(target, firstNotice)) {
        break;
      }
      candidate = container.innerHTML.trim();
    }
    if (candidate.length <= maxLength && hasTextBefore(target, firstNotice)) {
      return candidate;
    }
  }

  return truncatedPlainFallback(fullText, maxLength);
}

function truncatedPlainFallback(fullText: string, maxLength: number): string | undefined {
  const wrapperOverhead = "<p></p>".length + truncationNotice.length;
  if (maxLength > wrapperOverhead) {
    const textBudget = maxLength - wrapperOverhead;
    const clipped = escapeClippedText(fullText, textBudget);
    if (clipped) {
      return `<p>${clipped}</p>${truncationNotice}`;
    }
  }
  if (maxLength < "<p></p>".length + 1) return undefined;
  const textBudget = maxLength - "<p></p>".length;
  const clipped = escapeClippedText(fullText, textBudget);
  return clipped ? `<p>${clipped}</p>` : undefined;
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
