import { describe, expect, it, vi } from "vitest";
import type { ArticleDraft } from "../src/messaging";
import { requestNative } from "../src/nativeCall";
import {
  errorKindForUploadFailure,
  errorKinds,
  eventForUploadResult,
  initialPopup,
  nativeCallTimeoutMs,
  popupCopy,
  previewFromDraft,
  reducePopup,
  successDismissMs,
  type ErrorKind,
  type PagePreview,
  type PopupPhase,
} from "../src/popupState";

const draft: ArticleDraft = {
  title: "Dispatch",
  url: "https://news.example/dispatch",
  byline: "Sam",
};

const page: PagePreview = previewFromDraft(draft);

function ready(overrides?: { paired?: boolean; offline?: boolean }): PopupPhase {
  return {
    name: "ready",
    page,
    paired: overrides?.paired ?? true,
    offline: overrides?.offline ?? false,
    busy: false,
  };
}

describe("previewFromDraft", () => {
  it("uses the hostname when the title is missing", () => {
    expect(previewFromDraft({ title: "Untitled", url: "https://blog.example.com/a" }).title).toBe("blog.example.com");
    expect(page).toMatchObject({ title: "Dispatch", hostname: "news.example" });
  });
});

describe("reducePopup", () => {
  it("reads the page without sending", () => {
    const reading = reducePopup(initialPopup(), { type: "open" });
    const loaded = reducePopup(reading, { type: "pageLoaded", page, paired: true, offline: false });
    expect(reading).toEqual({ name: "reading", busy: true });
    expect(loaded.name).toBe("ready");
    expect(reducePopup(loaded, { type: "uploadSucceeded" })).toEqual(loaded);
  });

  it("sends only from a paired online confirm screen", () => {
    expect(reducePopup(ready(), { type: "send" }).name).toBe("sending");
    expect(reducePopup(ready({ paired: false }), { type: "send" }).name).toBe("ready");
    expect(reducePopup(ready({ offline: true }), { type: "send" }).name).toBe("ready");
  });

  it("keeps success for a real upload and never treats a stub reply as sent", () => {
    const sending = reducePopup(ready(), { type: "send" });
    const stub = eventForUploadResult({
      ok: true,
      message: "Stub accepted. Nothing was uploaded; EPUB conversion and reMarkable Cloud are not implemented.",
      implemented: false,
    });
    expect(stub.type).toBe("uploadUnavailable");
    expect(reducePopup(sending, stub).name).toBe("unavailable");
    expect(reducePopup(sending, eventForUploadResult({ ok: true, message: "Saved." })).name).toBe("unavailable");
    const real = reducePopup(sending, eventForUploadResult({ ok: true, message: "Uploaded.", implemented: true }));
    expect(real.name).toBe("success");
    expect(popupCopy(real)).toMatchObject({ status: "Sent", detail: "Saved to Inbox as EPUB." });
    expect(popupCopy({ name: "unavailable", page, busy: false })).toMatchObject({
      status: "Not available yet",
      detail: "Sending to your reMarkable isn't implemented in this build.",
    });
    expect(
      reducePopup(sending, eventForUploadResult({ ok: false, message: "The article needs a title and an http(s) URL." })),
    ).toMatchObject({ name: "error", kind: "unsupportedPage" });
    expect(reducePopup(sending, { type: "uploadFailed", kind: "appUnreachable" })).toMatchObject({
      name: "error",
      kind: "appUnreachable",
    });
  });

  it("does not upload when Retry follows a pairingStatus timeout", async () => {
    vi.useFakeTimers();
    try {
      const calls: string[] = [];
      const pending = requestNative({ type: "pairingStatus" }, () => {
        calls.push("background");
        return new Promise(() => {});
      });
      const assertion = expect(pending).rejects.toThrow(/did not answer/);
      await vi.advanceTimersByTimeAsync(nativeCallTimeoutMs);
      await assertion;

      const failed = reducePopup({ name: "reading", busy: true }, { type: "nativeUnreachable", page });
      expect(popupCopy(failed).primaryAction).toBe("retry-read");
      expect(reducePopup(failed, { type: "retry" }).name).toBe("reading");
      expect(calls).toEqual(["background"]);

      const afterSend = reducePopup(reducePopup(ready(), { type: "send" }), {
        type: "uploadFailed",
        kind: "appUnreachable",
      });
      expect(popupCopy(afterSend).primaryAction).toBe("retry-send");
      expect(reducePopup(afterSend, { type: "retry" }).name).toBe("sending");
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries a send, rereads the page, or returns to confirm", () => {
    const sending = reducePopup(ready(), { type: "send" });
    const network = reducePopup(sending, { type: "uploadFailed", kind: "network" });
    expect(reducePopup(network, { type: "retry" }).name).toBe("sending");
    const unread = reducePopup({ name: "reading", busy: true }, { type: "pageUnread" });
    expect(reducePopup(unread, { type: "retry" }).name).toBe("reading");
    const limited = reducePopup(sending, { type: "uploadFailed", kind: "rateLimit" });
    expect(reducePopup(limited, { type: "acknowledge" }).name).toBe("ready");
    expect(reducePopup(limited, { type: "retry" })).toEqual(limited);
  });
});

describe("popupCopy", () => {
  it("shows confirm copy and does not offer Send until the page is ready and paired", () => {
    const reading = popupCopy({ name: "reading", busy: true });
    expect(reading.status).toBe("Reading this page…");
    expect(reading.primaryLabel).toBeUndefined();
    expect(reading.showMeta).toBe(false);
    expect(popupCopy(ready())).toMatchObject({
      previewTitle: "Dispatch",
      hostname: "news.example",
      showMeta: true,
      primaryLabel: "Send",
      primaryDisabled: false,
      footnote: "Saves an EPUB to your reMarkable Inbox.",
    });
    expect(popupCopy(ready({ paired: false }))).toMatchObject({
      primaryLabel: "Pair device",
      primaryAction: "open-app",
      openReason: "required",
      footnote: "Pair your reMarkable in the Page to Paper app to continue.",
    });
    expect(popupCopy(ready({ offline: true }))).toMatchObject({
      status: "You’re offline.",
      primaryLabel: "Send",
      primaryDisabled: true,
    });
  });

  it("shows sending and success copy", () => {
    const sending = reducePopup(ready(), { type: "send" });
    expect(popupCopy(sending)).toMatchObject({
      status: "Sending as EPUB…",
      detail: "Preparing EPUB…",
      busy: true,
      primaryDisabled: true,
      announcement: "Sending as EPUB to Inbox",
    });
    const success = reducePopup(sending, { type: "uploadSucceeded" });
    expect(popupCopy(success)).toMatchObject({
      status: "Sent",
      detail: "Saved to Inbox as EPUB.",
      primaryLabel: "Done",
      announcement: "Sent to reMarkable Inbox as EPUB.",
    });
    expect(successDismissMs).toBe(1200);
  });

  it("maps every error kind to its copy and deep link reason", () => {
    const expected: Record<ErrorKind, { status: string; detail: string; primaryLabel: string; openReason?: string }> = {
      network: { status: "Couldn’t send", detail: "Check your connection and try again.", primaryLabel: "Retry" },
      notPaired: {
        status: "Pairing required",
        detail: "Open Page to Paper and pair your reMarkable.",
        primaryLabel: "Re-pair",
        openReason: "required",
      },
      authExpired: {
        status: "Sign in again",
        detail: "Your reMarkable session expired.",
        primaryLabel: "Re-pair",
        openReason: "expired",
      },
      rateLimit: { status: "Too many sends", detail: "Please wait a moment and try again.", primaryLabel: "OK" },
      unsupportedPage: {
        status: "Can’t send this page",
        detail: "This page can’t be saved as an EPUB.",
        primaryLabel: "OK",
      },
      appUnreachable: {
        status: "Couldn’t reach the app",
        detail: "Open Page to Paper, then try again.",
        primaryLabel: "Retry",
        openReason: "unreachable",
      },
      unknown: {
        status: "Something went wrong",
        detail: "Please try again. If it keeps happening, try later.",
        primaryLabel: "Retry",
      },
      pageUnread: {
        status: "Could not read this page",
        detail: "Allow Page to Paper for the site in Safari, then try again.",
        primaryLabel: "Try again",
      },
    };

    for (const kind of Object.keys(expected) as ErrorKind[]) {
      expect(popupCopy({ name: "error", kind, page, busy: false })).toMatchObject(expected[kind]);
    }
    expect(popupCopy({ name: "error", kind: "appUnreachable", page, busy: false }).secondaryLabel).toBe("Open app");
    expect(popupCopy({ name: "error", kind: "notPaired", page, busy: false }).secondaryLabel).toBe("Retry");
    expect(popupCopy({ name: "error", kind: "authExpired", busy: false }).clearPairing).toBe(true);
    expect(popupCopy({ name: "error", kind: "notPaired", busy: false }).clearPairing).toBe(true);
    expect(popupCopy({ name: "error", kind: "appUnreachable", busy: false }).clearPairing).toBeUndefined();
    expect(popupCopy(ready({ paired: false })).clearPairing).toBeUndefined();
  });

  it("derives busy only from the phase field and leaves it false on every terminal phase", () => {
    const terminals: PopupPhase[] = [
      initialPopup(),
      ready(),
      ready({ paired: false }),
      { name: "success", page, busy: false },
      { name: "unavailable", page, busy: false },
      ...errorKinds.map((kind): PopupPhase => ({ name: "error", kind, page, busy: false })),
    ];
    for (const phase of terminals) {
      expect(phase.busy).toBe(false);
      expect(popupCopy(phase).busy).toBe(false);
    }
    const reading = reducePopup(initialPopup(), { type: "open" });
    const sending = reducePopup(ready(), { type: "send" });
    expect(popupCopy(reading).busy).toBe(reading.busy);
    expect(popupCopy(sending).busy).toBe(true);
    for (const phase of [reading, sending]) {
      const timedOut = reducePopup(phase, { type: "busyTimeout" });
      expect(timedOut.busy).toBe(false);
      expect(timedOut.name).toBe("error");
      expect(popupCopy(timedOut).busy).toBe(false);
    }
    const afterLateReply = reducePopup(reducePopup(reading, { type: "busyTimeout" }), {
      type: "pageLoaded",
      page,
      paired: false,
      offline: false,
    });
    expect(afterLateReply.busy).toBe(false);
    expect(afterLateReply.name).toBe("error");
  });
});

describe("errorKindForUploadFailure", () => {
  it("maps stub handler text onto the popup error kinds", () => {
    expect(errorKindForUploadFailure("The article needs a title and an http(s) URL.")).toBe("unsupportedPage");
    expect(errorKindForUploadFailure("The Page to Paper app did not answer.")).toBe("appUnreachable");
    expect(errorKindForUploadFailure("Empty message from the extension.")).toBe("appUnreachable");
    expect(errorKindForUploadFailure("Not paired.")).toBe("notPaired");
    expect(errorKindForUploadFailure("Session expired.")).toBe("authExpired");
    expect(errorKindForUploadFailure("Too many requests.")).toBe("rateLimit");
    expect(errorKindForUploadFailure("Network offline.")).toBe("network");
    expect(errorKindForUploadFailure("Refusing a message that carries secrets.")).toBe("unknown");
  });
});
