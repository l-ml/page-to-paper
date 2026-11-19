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
  autoDismisses,
  dismissClosesPopup,
  mockSuccessDetail,
  nativeTimeoutMs,
  reducePopup,
  successDismissMs,
  uploadRoundTripMs,
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
    const mocked = eventForUploadResult({
      ok: true,
      message: mockSuccessDetail,
      implemented: true,
      mock: true,
    });
    expect(mocked.type).toBe("uploadMocked");
    expect(reducePopup(sending, mocked).name).toBe("mockSuccess");
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
    const noPage = reducePopup({ name: "error", kind: "network", busy: false }, { type: "retry" });
    expect(noPage).toEqual({ name: "reading", busy: true });
    expect(popupCopy(noPage).busy).toBe(true);
    const unread = reducePopup({ name: "reading", busy: true }, { type: "pageUnread" });
    expect(reducePopup(unread, { type: "retry" }).name).toBe("reading");
    const tooLong = reducePopup({ name: "reading", busy: true }, { type: "pageUnsupported" });
    expect(tooLong).toMatchObject({ name: "error", kind: "unsupportedPage", busy: false });
    expect(popupCopy(tooLong).primaryAction).toBe("dismiss");
    expect(dismissClosesPopup(tooLong)).toBe(true);
    expect(reducePopup(tooLong, { type: "acknowledge" }).name).toBe("idle");
    const limited = reducePopup(sending, { type: "uploadFailed", kind: "rateLimit" });
    expect(reducePopup(limited, { type: "acknowledge" }).name).toBe("ready");
    expect(reducePopup(limited, { type: "retry" })).toEqual(limited);
  });

  it("keeps Send disabled when OK is tapped while offline", () => {
    const sending = reducePopup(ready(), { type: "send" });
    const limited = reducePopup(sending, { type: "uploadFailed", kind: "rateLimit" });
    const back = reducePopup(limited, { type: "acknowledge", offline: true });
    expect(back).toMatchObject({ name: "ready", offline: true, paired: true });
    expect(popupCopy(back).primaryDisabled).toBe(true);
    expect(popupCopy(ready({ offline: true })).primaryDisabled).toBe(true);

    const stub = reducePopup(sending, { type: "uploadUnavailable" });
    const dismissed = reducePopup(stub, { type: "acknowledge", offline: true });
    expect(dismissed).toMatchObject({ name: "ready", offline: true });
    expect(popupCopy(dismissed).primaryDisabled).toBe(true);
    expect(popupCopy(reducePopup(limited, { type: "acknowledge", offline: false })).primaryDisabled).toBe(false);
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
    expect(autoDismisses(success)).toBe(true);
  });

  it("shows test mode for a mock success and keeps it distinct from Sent", () => {
    const sending = reducePopup(ready(), { type: "send" });
    const mocked = reducePopup(sending, {
      type: "uploadMocked",
    });
    expect(popupCopy(mocked)).toMatchObject({
      status: "Test mode",
      detail: mockSuccessDetail,
      primaryLabel: "Done",
      announcement: mockSuccessDetail,
    });
    expect(popupCopy(mocked).detail).not.toBe("Saved to Inbox as EPUB.");
    expect(autoDismisses(mocked)).toBe(false);
    const timeout = reducePopup(sending, eventForUploadResult({ ok: false, message: "The send timed out.", errorKind: "timeout" }));
    expect(popupCopy(timeout)).toMatchObject({
      status: "Timed out",
      detail: "The send took too long. Try again.",
      primaryLabel: "Retry",
      primaryAction: "retry-send",
    });
    const badPayload = reducePopup(
      sending,
      eventForUploadResult({ ok: false, message: "The page could not be prepared as an EPUB.", errorKind: "unsupportedPage" }),
    );
    expect(popupCopy(badPayload)).toMatchObject({
      status: "Can’t send this page",
      detail: "This page can’t be saved as an EPUB.",
      primaryAction: "dismiss",
    });
    const unpaired = reducePopup(
      sending,
      eventForUploadResult({ ok: false, message: "Pair your reMarkable in the Page to Paper app.", errorKind: "notPaired" }),
    );
    expect(popupCopy(unpaired)).toMatchObject({
      status: "Pairing required",
      primaryLabel: "Re-pair",
      primaryAction: "open-app",
    });
  });

  it("uses a new idempotency key per send, the same key on Retry, and a new key after success", () => {
    const first = reducePopup(ready(), { type: "send" });
    const secondPage = reducePopup(ready(), { type: "send" });
    if (first.name !== "sending" || secondPage.name !== "sending") throw new Error("expected sending");
    expect(first.idempotencyKey).not.toBe(secondPage.idempotencyKey);

    const timedOut = reducePopup(first, { type: "uploadFailed", kind: "timeout" });
    const retried = reducePopup(timedOut, { type: "retry" });
    expect(retried).toMatchObject({ name: "sending", idempotencyKey: first.idempotencyKey });
    const unknown = reducePopup(first, { type: "uploadFailed", kind: "unknown" });
    expect(reducePopup(unknown, { type: "retry" })).toMatchObject({ idempotencyKey: first.idempotencyKey });
    const watchdog = reducePopup(first, { type: "busyTimeout" });
    expect(reducePopup(watchdog, { type: "retry" })).toMatchObject({ idempotencyKey: first.idempotencyKey });

    const succeeded = reducePopup(first, { type: "uploadSucceeded" });
    const afterReal = reducePopup(ready(), { type: "send" });
    if (afterReal.name !== "sending") throw new Error("expected sending");
    expect(succeeded.name).toBe("success");
    expect(afterReal.idempotencyKey).not.toBe(first.idempotencyKey);

    const mocked = reducePopup(first, { type: "uploadMocked" });
    const afterMock = reducePopup(ready(), { type: "send" });
    if (afterMock.name !== "sending") throw new Error("expected sending");
    expect(mocked.name).toBe("mockSuccess");
    expect(afterMock.idempotencyKey).not.toBe(first.idempotencyKey);

    const dismissed = reducePopup(timedOut, { type: "acknowledge", offline: false });
    const resent = reducePopup(dismissed, { type: "send" });
    if (resent.name !== "sending") throw new Error("expected sending");
    expect(resent.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("maps every error kind to its copy and deep link reason", () => {
    const expected: Record<ErrorKind, { status: string; detail: string; primaryLabel: string; openReason?: string }> = {
      network: { status: "Couldn’t send", detail: "Check your connection and try again.", primaryLabel: "Retry" },
      timeout: { status: "Timed out", detail: "The send took too long. Try again.", primaryLabel: "Retry" },
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
      { name: "mockSuccess", page, busy: false },
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
    expect(errorKindForUploadFailure("Not paired.")).toBe("unknown");
    expect(errorKindForUploadFailure("Session expired.")).toBe("unknown");
    expect(errorKindForUploadFailure("Couldn't generate the EPUB.")).toBe("unsupportedPage");
    expect(errorKindForUploadFailure("please separate files")).toBe("unknown");
    expect(errorKindForUploadFailure("Device impaired")).toBe("unknown");
    expect(errorKindForUploadFailure("The send timed out.")).toBe("timeout");
    expect(errorKindForUploadFailure("Too many requests.")).toBe("rateLimit");
    expect(errorKindForUploadFailure("Network offline.")).toBe("network");
    expect(errorKindForUploadFailure("Refusing a message that carries secrets.")).toBe("unknown");
  });

  it("uses an explicit errorKind and does not clear pairing from message text", () => {
    const sending = reducePopup(ready(), { type: "send" });
    const explicit = reducePopup(sending, eventForUploadResult({ ok: false, message: "Device impaired", errorKind: "notPaired" }));
    expect(explicit).toMatchObject({ name: "error", kind: "notPaired" });
    expect(popupCopy(explicit).clearPairing).toBe(true);
    const guessed = reducePopup(sending, eventForUploadResult({ ok: false, message: "Not paired." }));
    expect(guessed).toMatchObject({ name: "error", kind: "unknown" });
    expect(popupCopy(guessed).clearPairing).toBeUndefined();
  });

  it("gives an upload a longer round trip than a pairing check", () => {
    expect(uploadRoundTripMs).toBeGreaterThan(nativeCallTimeoutMs);
    expect(nativeTimeoutMs({ type: "pairingStatus" })).toBe(nativeCallTimeoutMs);
    expect(nativeTimeoutMs({ type: "uploadArticle" })).toBe(uploadRoundTripMs);
  });
});
