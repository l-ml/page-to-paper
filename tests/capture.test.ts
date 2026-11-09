import { describe, expect, it, vi } from "vitest";
import { captureActiveArticle } from "../src/capture";

const extracted = {
  type: "articleDraft",
  title: "Dispatch",
  url: "https://news.example/dispatch",
  byline: "Sam",
};

describe("captureActiveArticle", () => {
  it("sends the extracted draft to the app and returns the stub result", async () => {
    const sendNative = vi.fn(async () => ({
      ok: true,
      message: "Stub accepted. Nothing was uploaded.",
    }));
    const result = await captureActiveArticle({
      queryActiveTab: async () => ({ id: 7 }),
      extract: async () => extracted,
      sendNative,
    });

    expect(sendNative).toHaveBeenCalledOnce();
    expect(sendNative).toHaveBeenCalledWith({
      type: "uploadArticle",
      draft: {
        title: "Dispatch",
        url: "https://news.example/dispatch",
        byline: "Sam",
      },
    });
    expect(result).toEqual({ ok: true, message: "Stub accepted. Nothing was uploaded." });
  });

  it("does not call the app when the page cannot be read or the draft is invalid", async () => {
    const sendNative = vi.fn();
    const unread = await captureActiveArticle({
      queryActiveTab: async () => ({ id: 3 }),
      extract: async () => {
        throw new Error("Receiving end does not exist.");
      },
      sendNative,
    });
    const invalid = await captureActiveArticle({
      queryActiveTab: async () => ({ id: 3 }),
      extract: async () => ({ type: "articleDraft", title: "Nope", url: "file:///tmp/a" }),
      sendNative,
    });
    const noTab = await captureActiveArticle({
      queryActiveTab: async () => undefined,
      extract: async () => extracted,
      sendNative,
    });

    expect(sendNative).not.toHaveBeenCalled();
    expect(unread.ok).toBe(false);
    expect(invalid.ok).toBe(false);
    expect(invalid.message).toMatch(/http or https/);
    expect(noTab).toEqual({ ok: false, message: "No active tab." });
  });

  it("reports a failure when the native call does not answer", async () => {
    const result = await captureActiveArticle({
      queryActiveTab: async () => ({ id: 1 }),
      extract: async () => extracted,
      sendNative: async () => {
        throw new Error("disconnected");
      },
    });
    expect(result).toEqual({ ok: false, message: "The Page to Paper app did not answer." });
  });
});
