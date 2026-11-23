import { beforeEach, describe, expect, it, vi } from "vitest";
import { limits, parseArticleDraft } from "../src/messaging";

const listeners: Array<unknown> = [];

beforeEach(() => {
  listeners.length = 0;
  delete (globalThis as { __pageToPaperReader?: boolean }).__pageToPaperReader;
  vi.stubGlobal("browser", {
    runtime: {
      onMessage: {
        addListener: (listener: unknown) => {
          listeners.push(listener);
        },
      },
    },
  });
  vi.resetModules();
});

describe("articleFields", () => {
  it("clips title and byline and leaves an over-long URL for the popup to reject", async () => {
    const { articleFields } = await import("../src/content");
    const fields = articleFields(`${"T".repeat(limits.title + 40)}`, `https://news.example/${"u".repeat(limits.url)}`, ` ${"B".repeat(limits.byline + 10)} `);
    expect(fields.title).toHaveLength(limits.title);
    expect(fields.byline).toHaveLength(limits.byline);
    expect(fields.url.length).toBeGreaterThan(limits.url);
    const emoji = "😀";
    const aroundEmoji = `${"a".repeat(limits.title - 1)}${emoji}`;
    const clipped = articleFields(aroundEmoji, "https://news.example/ok", emoji.repeat(limits.byline));
    expect(clipped.title.length).toBeLessThanOrEqual(limits.title);
    expect(clipped.byline!.length).toBeLessThanOrEqual(limits.byline);
    expect(parseArticleDraft({ type: "articleDraft", ...clipped }).title).toBe(clipped.title);
    const many = articleFields(emoji.repeat(200), "https://news.example/ok", emoji.repeat(200));
    expect(many.title.length).toBeLessThanOrEqual(limits.title);
    expect(many.byline!.length).toBeLessThanOrEqual(limits.byline);
    expect(() => parseArticleDraft({ type: "articleDraft", title: many.title, url: many.url, byline: many.byline })).not.toThrow();
    const family = "👨‍👩‍👧";
    const split = articleFields(`${"a".repeat(limits.title - 2)}${family}`, "https://news.example/ok");
    expect(split.title).toBe("a".repeat(limits.title - 2));
    expect(split.title).not.toContain("\u200d");

    const withHtml = articleFields("Title", "https://news.example/ok", undefined, "  <p>Body</p>  ");
    expect(withHtml.html).toBe("<p>Body</p>");
    const emptyHtml = articleFields("Title", "https://news.example/ok", undefined, "   ");
    expect("html" in emptyHtml).toBe(false);
    const overLongHtml = articleFields("Title", "https://news.example/ok", undefined, "x".repeat(limits.html + 1));
    expect("html" in overLongHtml).toBe(false);
  });
});

describe("installReader", () => {
  it("registers once when the popup injects the file again", async () => {
    const { installReader } = await import("../src/content");
    installReader();
    expect(listeners).toHaveLength(1);
  });
});
