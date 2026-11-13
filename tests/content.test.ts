import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("installReader", () => {
  it("registers once when the popup injects the file again", async () => {
    const { installReader } = await import("../src/content");
    installReader();
    expect(listeners).toHaveLength(1);
  });
});
