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
    const inject = vi.fn(async () => {});
    const result = await readActivePage({
      queryActiveTab: async () => ({ id: 7 }),
      inject,
      extract: async () => extracted,
    });
    expect(inject).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      ok: true,
      draft: { title: "Dispatch", url: "https://news.example/dispatch", byline: "Sam" },
    });
  });

  it("fails closed when the page cannot be read", async () => {
    const extract = vi.fn(async () => extracted);
    const unread = await readActivePage({
      queryActiveTab: async () => ({ id: 3 }),
      inject: async () => {
        throw new Error("Cannot access a safari-internal page.");
      },
      extract,
    });
    const invalid = await readActivePage({
      queryActiveTab: async () => ({ id: 3 }),
      inject: async () => {},
      extract: async () => ({ type: "articleDraft", title: "Nope", url: "file:///tmp/a" }),
    });
    expect(extract).not.toHaveBeenCalled();
    expect(unread).toEqual({ ok: false });
    expect(invalid).toEqual({ ok: false });
  });
});

describe("native calls", () => {
  it("asks only for pairing status while preparing", async () => {
    const dispatch = vi.fn(async () => ({ paired: true }));
    await expect(queryPaired(dispatch)).resolves.toEqual({ status: "known", paired: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "pairingStatus" });
  });

  it("reports an unreachable app instead of not paired", async () => {
    await expect(queryPaired(async () => {
      throw new Error("disconnected");
    })).resolves.toEqual({ status: "unreachable" });
    await expect(queryPaired(async () => ({ paired: false }))).resolves.toEqual({ status: "known", paired: false });
  });

  it("uploads only when uploadDraft is called", async () => {
    const dispatch = vi.fn(async () => ({ ok: true, message: "Stub accepted. Nothing was uploaded.", implemented: false }));
    const result = await uploadDraft(
      { title: "Dispatch", url: "https://news.example/dispatch", byline: "Sam" },
      dispatch,
    );
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({
      type: "uploadArticle",
      draft: { title: "Dispatch", url: "https://news.example/dispatch", byline: "Sam" },
    });
    expect(result.implemented).toBe(false);
  });

  it("reports when the app does not answer", async () => {
    const result = await uploadDraft({ title: "Dispatch", url: "https://news.example/dispatch" }, async () => {
      throw new Error("disconnected");
    });
    expect(result).toEqual({ ok: false, message: "The Page to Paper app did not answer." });
  });
});
