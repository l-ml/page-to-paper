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
  it("extracts article HTML, cleans media/attrs, resolves links, unwraps fragments, and leaves the live DOM untouched", () => {
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
    expect(extracted.html).not.toContain('href="#summary"');
    expect(extracted.html).toContain("the summary");
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
  it("parses inside an inert document rather than creating elements in the live document", () => {
    mountDocument("<!doctype html><html><body><p>Live</p></body></html>");
    const createElementSpy = vi.spyOn(document, "createElement");
    const createInertSpy = vi.spyOn(document.implementation, "createHTMLDocument");

    const cleaned = cleanAndBoundHtml(
      '<div><!-- comment --><img src="https://tracker.example/p.png" alt="Chart"><p>Safe text.</p></div>',
      document,
      { maxLength: 10_000 },
    );

    expect(createElementSpy).not.toHaveBeenCalled();
    expect(createInertSpy).toHaveBeenCalledTimes(1);
    expect(cleaned).toContain('<img alt="Chart">');
    expect(cleaned).not.toContain("tracker.example");
    expect(cleaned).not.toContain("<!--");

    createElementSpy.mockRestore();
    createInertSpy.mockRestore();
  });

  it("deduplicates leading h1 or Readability-rewritten h2 matching the title, keeping non-matching h2", () => {
    const dedupH1 = cleanAndBoundHtml(
      "<div><h1>  Winter   Walk </h1><p>Body text here.</p></div>",
      document,
      { title: "winter walk", maxLength: 10_000 },
    );
    expect(dedupH1).not.toContain("<h1>");
    expect(dedupH1).toContain("<p>Body text here.</p>");

    const dedupH2 = cleanAndBoundHtml(
      "<div><h2>Winter Walk</h2><h2>Section One</h2><p>Body text here.</p></div>",
      document,
      { title: "Winter Walk", maxLength: 10_000 },
    );
    expect(dedupH2).not.toContain("Winter Walk");
    expect(dedupH2).toContain("<h2>Section One</h2>");
    expect(dedupH2).toContain("<p>Body text here.</p>");
  });

  it("unwraps dead fragment and javascript links while keeping their text", () => {
    const cleaned = cleanAndBoundHtml(
      '<p>Jump to <a href="#top"><em>top</em></a> or <a href="javascript:void(0)">skip</a> or <a href="/ok">read more</a>.</p>',
      document,
      { maxLength: 10_000, baseUrl: "https://news.example/article" },
    );
    expect(cleaned).toBe('<p>Jump to <em>top</em> or skip or <a href="https://news.example/ok">read more</a>.</p>');
  });

  it("bounds oversized multi-paragraph HTML cleanly within maxLength", () => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i}: ${"word ".repeat(20)}</p>`).join("");
    const cleaned = cleanAndBoundHtml(`<div>${paragraphs}</div>`, document, { maxLength: 500 });
    expect(cleaned).toBeDefined();
    expect(cleaned!.length).toBeLessThanOrEqual(500);
    expect(cleaned).toContain("Article truncated to fit the EPUB size limit.");
    expect(cleaned).toContain("Paragraph 0:");
  });

  it("truncates 10,000 paragraphs (>1.5 MB) in linear time well under the page-read budget", () => {
    const paragraphs = Array.from(
      { length: 10_000 },
      (_, i) => `<p>Paragraph ${i}: ${"word ".repeat(26)}</p>`,
    ).join("");
    expect(paragraphs.length).toBeGreaterThan(1_500_000);

    const started = performance.now();
    const cleaned = cleanAndBoundHtml(`<div>${paragraphs}</div>`, document, { maxLength: limits.html });
    const elapsedMs = performance.now() - started;

    expect(cleaned).toBeDefined();
    expect(cleaned!.length).toBeLessThanOrEqual(limits.html);
    expect(cleaned).toContain("Article truncated to fit the EPUB size limit.");
    expect(cleaned).toContain("Paragraph 0:");
    expect(elapsedMs).toBeLessThan(2_000);
  });

  it("never returns notice-only HTML without article body text across tight maxLength bounds", () => {
    const notice = "<p><em>[Article truncated to fit the EPUB size limit.]</em></p>";
    const inputs = [
      "<p>&amp; leading entity and body text that exceeds the limit</p>",
      "<div><p>Alpha</p><p>Beta</p><p>Gamma</p></div>",
      "<div><p>One</p><p>A</p><p>B</p><p>C</p><p>D</p></div>",
    ];
    for (const html of inputs) {
      for (let maxLength = 50; maxLength <= 160; maxLength += 1) {
        const cleaned = cleanAndBoundHtml(html, document, { maxLength });
        if (!cleaned) continue;
        expect(cleaned.length).toBeLessThanOrEqual(maxLength);
        const bodyText = cleaned
          .replace(notice, "")
          .replace(/<[^>]+>/g, "")
          .trim();
        expect(bodyText.length).toBeGreaterThan(0);
      }
    }
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
