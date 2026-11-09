import { describe, expect, it, vi } from "vitest";
import {
  buildUploadRequest,
  containingAppNativeId,
  findForbiddenSecretKey,
  isExtractRequest,
  limits,
  messageTypes,
  parseArticleDraft,
  parsePairingStatus,
  parseUploadResult,
  sendToContainingApp,
  MessageShapeError,
} from "../src/messaging";

const draft = {
  type: messageTypes.articleDraft,
  title: "  A paper  ",
  url: "https://example.com/story",
  byline: "  Ada  ",
  html: "<p>Hello</p>",
};

describe("parseArticleDraft", () => {
  it("accepts a content-script draft and trims text fields", () => {
    expect(parseArticleDraft(draft)).toEqual({
      title: "A paper",
      url: "https://example.com/story",
      byline: "Ada",
      html: "<p>Hello</p>",
    });
  });

  it("drops empty optional fields", () => {
    expect(parseArticleDraft({ title: "Note", url: "http://example.com", html: "  ", byline: "" })).toEqual({
      title: "Note",
      url: "http://example.com/",
    });
  });

  it("rejects a missing title, a bad URL, and credentials", () => {
    expect(() => parseArticleDraft({ url: "https://example.com" })).toThrow(MessageShapeError);
    expect(() => parseArticleDraft({ title: "Note", url: "javascript:alert(1)" })).toThrow(/http or https/);
    expect(() => parseArticleDraft({ title: "Note", url: "https://user:secret@example.com/a" })).toThrow(
      /credentials/,
    );
    expect(() => parseArticleDraft({ title: "Note", url: "not a url" })).toThrow(MessageShapeError);
  });

  it("rejects over-long fields", () => {
    expect(() => parseArticleDraft({ title: "a".repeat(limits.title + 1), url: "https://example.com" })).toThrow(
      /too long/,
    );
    expect(() =>
      parseArticleDraft({ title: "Note", url: "https://example.com", html: "h".repeat(limits.html + 1) }),
    ).toThrow(/too long/);
  });

  it("rejects secret keys anywhere in the object", () => {
    expect(findForbiddenSecretKey({ draft: { deviceToken: "abc" } })).toBe("deviceToken");
    expect(() => parseArticleDraft({ ...draft, token: "nope" })).toThrow(/secrets/);
    expect(() => parseArticleDraft({ title: "Note", url: "https://example.com", nested: { password: "x" } })).toThrow(
      /secrets/,
    );
  });

  it("rejects secret aliases in any casing", () => {
    const aliases = ["Token", "PASSWORD", "Secret", "access_token", "Access-Token", "AUTHORIZATION", "Bearer"];
    for (const key of aliases) {
      expect(findForbiddenSecretKey({ [key]: "x" })).toBe(key);
      expect(() => parseArticleDraft({ title: "Note", url: "https://example.com", [key]: "x" })).toThrow(/secrets/);
      expect(parseUploadResult({ ok: true, message: "Hi", [key]: "x" })).toEqual({
        ok: false,
        message: "The app returned a message that carries secrets.",
      });
    }
    expect(findForbiddenSecretKey({ title: "Note", paired: true })).toBeNull();
  });

  it("rejects trailing spaces, NFKC lookalikes, and api key aliases", () => {
    const fullwidthToken = "\uFF34\uFF4F\uFF4B\uFF45\uFF4E";
    for (const key of ["token ", " Token", fullwidthToken, "apiKey", "api_key", "Token"]) {
      expect(findForbiddenSecretKey({ [key]: "x" }), key).toBe(key);
      expect(parseUploadResult({ ok: true, message: "Hi", [key]: "x" }).ok).toBe(false);
    }
    expect(findForbiddenSecretKey({ deviceToken: "x" })).toBe("deviceToken");
    expect(findForbiddenSecretKey({ refresh_token: "x" })).toBe("refresh_token");
    const cyrillicToken = "t\u043Eken";
    expect(findForbiddenSecretKey({ [cyrillicToken]: "x" })).toBe(cyrillicToken);
    expect(() => parseArticleDraft({ title: "Note", url: "https://example.com", [cyrillicToken]: "x" })).toThrow(
      /secrets/,
    );
  });

  it("rejects a non-draft message type", () => {
    expect(() => parseArticleDraft({ type: "uploadArticle", title: "Note", url: "https://example.com" })).toThrow(
      /Unexpected message type/,
    );
  });
});

describe("buildUploadRequest", () => {
  it("builds the native uploadArticle shape without optional empties", () => {
    expect(buildUploadRequest({ title: "Note", url: "https://example.com/a" })).toEqual({
      type: "uploadArticle",
      draft: { title: "Note", url: "https://example.com/a" },
    });
  });

  it("keeps html and byline when they are present", () => {
    const request = buildUploadRequest({
      title: "Note",
      url: "https://example.com/a",
      html: "<p>Hi</p>",
      byline: "Ada",
    });
    expect(request.draft).toEqual({
      title: "Note",
      url: "https://example.com/a",
      html: "<p>Hi</p>",
      byline: "Ada",
    });
  });
});

describe("parseUploadResult", () => {
  it("accepts a stub success and a failure", () => {
    expect(parseUploadResult({ ok: true, message: "Stub accepted." })).toEqual({
      ok: true,
      message: "Stub accepted.",
    });
    expect(parseUploadResult({ ok: false, message: "Not sent", documentId: "  doc-1  " })).toEqual({
      ok: false,
      message: "Not sent",
      documentId: "doc-1",
    });
  });

  it("turns an unreadable or secret-bearing payload into a failure", () => {
    expect(parseUploadResult(null).ok).toBe(false);
    expect(parseUploadResult({ ok: true }).ok).toBe(false);
    expect(parseUploadResult({ ok: true, message: "Hi", token: "secret" })).toEqual({
      ok: false,
      message: "The app returned a message that carries secrets.",
    });
  });
});

describe("parsePairingStatus", () => {
  it("accepts a boolean and rejects secrets", () => {
    expect(parsePairingStatus({ paired: false })).toEqual({ paired: false });
    expect(() => parsePairingStatus({ paired: true, token: "x" })).toThrow(/secrets/);
    expect(() => parsePairingStatus({ ok: true })).toThrow(MessageShapeError);
  });
});

describe("extract and native addressing", () => {
  it("accepts only a bare extractArticle request", () => {
    expect(isExtractRequest({ type: "extractArticle" })).toBe(true);
    expect(isExtractRequest({ type: "extractArticle", url: "https://example.com" })).toBe(false);
    expect(isExtractRequest({ type: "extractArticle", token: "x" })).toBe(false);
    expect(isExtractRequest("extractArticle")).toBe(false);
  });

  it("sends the native message to the containing app id and not a bundle id", async () => {
    const calls: unknown[][] = [];
    const response = await sendToContainingApp({ type: "uploadArticle" }, async (application, body) => {
      calls.push([application, body]);
      return { ok: true, message: "Stub accepted." };
    });
    expect(containingAppNativeId).toBe("application");
    expect(calls).toEqual([["application", { type: "uploadArticle" }]]);
    expect(response).toEqual({ ok: true, message: "Stub accepted." });
  });

  it("does not forward a message that carries a Token key", async () => {
    const send = vi.fn();
    await expect(sendToContainingApp({ type: "uploadArticle", Token: "x" }, send)).rejects.toThrow(/secrets/);
    expect(send).not.toHaveBeenCalled();
  });
});
