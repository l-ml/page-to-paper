import { beforeEach, describe, expect, it, vi } from "vitest";
import { limits } from "../src/messaging";

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
  });
});

describe("installReader", () => {
  it("registers once when the popup injects the file again", async () => {
    const { installReader } = await import("../src/content");
    installReader();
    expect(listeners).toHaveLength(1);
  });
});
