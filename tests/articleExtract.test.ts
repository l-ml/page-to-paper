/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanAndBoundHtml, extractReadableArticle } from "../src/articleExtract";
import { limits, parseArticleDraft } from "../src/messaging";

function mountDocument(html: string, url = "https://news.example/posts/2026/hello"): void {
  window.location.href = url;
  document.open();
  document.write(html);
  document.close();
}

const sampleArticleHtml = `<!doctype html>
<html lang="en">
  <head>
    <title>A Long Walk in Winter — Example Blog</title>
    <meta name="author" content="Ada Lovelace" />
    <style>.ad { display: none; }</style>
  </head>
  <body>
    <header><nav><a href="/home">Home</a> | <a href="/about">About</a></nav></header>
    <main>
      <article>
        <h1>A Long Walk in Winter</h1>
        <p class="byline">By Ada Lovelace</p>
        <p>First paragraph of a thoughtful essay about walking through quiet snow-covered trails and taking notes for later reading on e-ink paper. Read the <a href="/notes/trail">trail notes</a> or jump to <a href="#summary">the summary</a>.</p>
        <p>Second paragraph continues with enough prose so Readability scores this node cleanly as the primary article content rather than boilerplate navigation or footer widgets.</p>
        <figure>
          <img src="data:image/png;base64,${"A".repeat(400)}" srcset="/img@2x.png 2x" alt="Snowy trail through pine trees" class="hero" />
          <figcaption>Morning light on the ridge.</figcaption>
        </figure>
        <img src="/pixel.gif" alt="" />
        <p>Third paragraph discusses why <a href="javascript:alert(1)">unsafe links</a> and <script>console.log("x")</script><iframe title="ad"></iframe> embedded scripts should be removed cleanly while keeping <mark>highlighted</mark> phrases intact.</p>
        <h2 id="summary">Summary</h2>
        <p>Final thoughts on keeping reading calm, distraction-free, and portable across devices.</p>
      </article>
    </main>
    <footer><p>Copyright 2026 Example Blog. Subscribe to our newsletter.</p></footer>
  </body>
</html>`;

beforeEach(() => {
  delete (globalThis as { __pageToPaperReader?: boolean }).__pageToPaperReader;
});

describe("extractReadableArticle", () => {
  it("extracts article HTML, cleans media/attrs, resolves links, and leaves the live DOM untouched", () => {
    mountDocument(sampleArticleHtml);
    const originalScripts = document.querySelectorAll("script").length;
    const originalImages = document.querySelectorAll("img").length;
    const originalNav = document.querySelector("nav")?.textContent;

    const extracted = extractReadableArticle(document, window.location.href);

    expect(extracted.title).toContain("A Long Walk in Winter");
    expect(extracted.byline).toContain("Ada Lovelace");
    expect(extracted.html).toBeDefined();
    expect(extracted.html).toContain("First paragraph of a thoughtful essay");
    expect(extracted.html).toContain('<a href="https://news.example/notes/trail">trail notes</a>');
    expect(extracted.html).toContain('<a href="#summary">the summary</a>');
    expect(extracted.html).toContain('<img alt="Snowy trail through pine trees">');
    expect(extracted.html).not.toContain("data:image/png");
    expect(extracted.html).not.toContain("srcset");
    expect(extracted.html).not.toContain("pixel.gif");
    expect(extracted.html).not.toContain("<script");
    expect(extracted.html).not.toContain("<iframe");
    expect(extracted.html).not.toContain("javascript:");
    expect(extracted.html).not.toContain("Subscribe to our newsletter");

    // Live page DOM must remain untouched
    expect(document.querySelectorAll("script").length).toBe(originalScripts);
    expect(document.querySelectorAll("img").length).toBe(originalImages);
    expect(document.querySelector("nav")?.textContent).toBe(originalNav);

    // Extracted result passes shared draft validation
    expect(() =>
      parseArticleDraft({
        type: "articleDraft",
        title: extracted.title!,
        url: window.location.href,
        byline: extracted.byline,
        html: extracted.html,
      }),
    ).not.toThrow();
  });

  it("falls back without html on non-article pages", () => {
    mountDocument("<!doctype html><html><head><title>Login</title></head><body><button>Sign in</button></body></html>");
    const extracted = extractReadableArticle(document, "https://app.example/login");
    expect(extracted.html).toBeUndefined();
  });

  it("wires Readability extraction into the content script message handler", async () => {
    mountDocument(sampleArticleHtml);
    let registered:
      | ((message: unknown, sender: unknown, sendResponse: (res: unknown) => void) => boolean | void)
      | undefined;
    vi.stubGlobal("browser", {
      runtime: {
        onMessage: {
          addListener: (listener: typeof registered) => {
            registered = listener;
          },
        },
      },
    });
    vi.resetModules();
    await import("../src/content");
    expect(registered).toBeDefined();

    let response: unknown;
    const handled = registered!({ type: "extractArticle" }, {}, (res) => {
      response = res;
    });
    expect(handled).toBe(true);
    const parsed = parseArticleDraft(response);
    expect(parsed.title).toContain("A Long Walk in Winter");
    expect(parsed.html).toContain("First paragraph of a thoughtful essay");
  });
});

describe("cleanAndBoundHtml", () => {
  it("deduplicates a leading h1 that matches the article title", () => {
    const cleaned = cleanAndBoundHtml(
      "<div><h1>  Winter   Walk </h1><p>Body text here.</p></div>",
      document,
      { title: "winter walk", maxLength: 10_000 },
    );
    expect(cleaned).not.toContain("<h1>");
    expect(cleaned).toContain("<p>Body text here.</p>");
  });

  it("bounds oversized multi-paragraph HTML cleanly within maxLength", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i}: ${"word ".repeat(20)}</p>`).join("");
    const cleaned = cleanAndBoundHtml(`<div>${paragraphs}</div>`, document, { maxLength: 500 });
    expect(cleaned).toBeDefined();
    expect(cleaned!.length).toBeLessThanOrEqual(500);
    expect(cleaned).toContain("Article truncated to fit the EPUB size limit.");
    expect(cleaned).toContain("Paragraph 0:");
  });

  it("bounds a single giant paragraph cleanly within maxLength", () => {
    const huge = `<p>${"x".repeat(limits.html + 5_000)}</p>`;
    const cleaned = cleanAndBoundHtml(huge, document, { maxLength: limits.html });
    expect(cleaned).toBeDefined();
    expect(cleaned!.length).toBeLessThanOrEqual(limits.html);
    expect(cleaned).toContain("Article truncated to fit the EPUB size limit.");
    expect(() =>
      parseArticleDraft({
        type: "articleDraft",
        title: "Large Article",
        url: "https://news.example/large",
        html: cleaned,
      }),
    ).not.toThrow();
  });
});
