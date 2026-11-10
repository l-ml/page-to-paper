import { afterEach, describe, expect, it, vi } from "vitest";
import { callNative, requestNative } from "../src/nativeCall";
import { nativeCallTimeoutMs } from "../src/popupState";

afterEach(() => {
  vi.useRealTimers();
});

describe("callNative", () => {
  it("ends in an error when sendNativeMessage never settles and never calls back", async () => {
    vi.useFakeTimers();
    const pending = callNative({ type: "uploadArticle" }, () => new Promise(() => {}));
    const assertion = expect(pending).rejects.toThrow(/did not answer/);
    await vi.advanceTimersByTimeAsync(nativeCallTimeoutMs);
    await assertion;
  });

  it("ends in an error when sendNativeMessage rejects", async () => {
    await expect(
      callNative({ type: "uploadArticle" }, () => Promise.reject(new Error("native down"))),
    ).rejects.toThrow(/native down/);
  });

  it("ends in an error when sendNativeMessage throws synchronously", async () => {
    await expect(
      callNative({ type: "uploadArticle" }, () => {
        throw new Error("bridge missing");
      }),
    ).rejects.toThrow(/bridge missing/);
  });

  it("resolves from the callback when no promise is returned", async () => {
    const value = await callNative({ type: "pairingStatus" }, (_application, _message, callback) => {
      callback({ paired: true });
    });
    expect(value).toEqual({ paired: true });
  });

  it("does not call native when the message carries a secret key", async () => {
    const messenger = vi.fn();
    await expect(callNative({ Token: "x" }, messenger)).rejects.toThrow(/secrets/);
    expect(messenger).not.toHaveBeenCalled();
  });
});

describe("requestNative", () => {
  it("times out when the background never replies, without sending uploadArticle", async () => {
    vi.useFakeTimers();
    const sent: unknown[] = [];
    const pending = requestNative({ type: "uploadArticle", draft: { title: "Note", url: "https://example.com" } }, (body) => {
      sent.push(body);
      return new Promise(() => {});
    });
    const assertion = expect(pending).rejects.toThrow(/did not answer/);
    await vi.advanceTimersByTimeAsync(nativeCallTimeoutMs);
    await assertion;
    expect(sent).toEqual([
      {
        type: "nativeRequest",
        payload: { type: "uploadArticle", draft: { title: "Note", url: "https://example.com" } },
      },
    ]);
  });
});
