import { describe, expect, it, vi } from "vitest";
import { queryPaired, readActivePage, uploadDraft } from "../src/capture";

const extracted = {
  type: "articleDraft",
  title: "Dispatch",
  url: "https://news.example/dispatch",
  byline: "Sam",
};

describe("readActivePage", () => {
  it("returns a draft and has no native upload", async () => {
    const result = await readActivePage({
      queryActiveTab: async () => ({ id: 7 }),
      extract: async () => extracted,
    });
    expect(result).toEqual({
      ok: true,
      draft: { title: "Dispatch", url: "https://news.example/dispatch", byline: "Sam" },
    });
  });

  it("fails closed when the page cannot be read", async () => {
    const unread = await readActivePage({
      queryActiveTab: async () => ({ id: 3 }),
      extract: async () => {
        throw new Error("Receiving end does not exist.");
      },
    });
    const invalid = await readActivePage({
      queryActiveTab: async () => ({ id: 3 }),
      extract: async () => ({ type: "articleDraft", title: "Nope", url: "file:///tmp/a" }),
    });
    expect(unread).toEqual({ ok: false });
    expect(invalid).toEqual({ ok: false });
  });
});

describe("native calls", () => {
  it("asks only for pairing status while preparing", async () => {
    const sendNative = vi.fn(async () => ({ paired: true }));
    await expect(queryPaired(sendNative)).resolves.toBe(true);
    expect(sendNative).toHaveBeenCalledWith("application", { type: "pairingStatus" });
  });

  it("uploads only when uploadDraft is called", async () => {
    const sendNative = vi.fn(async () => ({ ok: true, message: "Stub accepted. Nothing was uploaded." }));
    const result = await uploadDraft(
      { title: "Dispatch", url: "https://news.example/dispatch", byline: "Sam" },
      sendNative,
    );
    expect(sendNative).toHaveBeenCalledOnce();
    expect(sendNative).toHaveBeenCalledWith("application", {
      type: "uploadArticle",
      draft: { title: "Dispatch", url: "https://news.example/dispatch", byline: "Sam" },
    });
    expect(result.ok).toBe(true);
  });

  it("reports when the app does not answer", async () => {
    const result = await uploadDraft({ title: "Dispatch", url: "https://news.example/dispatch" }, async () => {
      throw new Error("disconnected");
    });
    expect(result).toEqual({ ok: false, message: "The Page to Paper app did not answer." });
  });
});
