import { describe, expect, it } from "vitest";
import type { ArticleDraft } from "../src/messaging";
import {
  errorKindForUploadFailure,
  eventForUploadResult,
  initialPopup,
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
    expect(reading).toEqual({ name: "reading" });
    expect(loaded.name).toBe("ready");
    expect(reducePopup(loaded, { type: "uploadSucceeded" })).toEqual(loaded);
  });

  it("sends only from a paired online confirm screen", () => {
    expect(reducePopup(ready(), { type: "send" }).name).toBe("sending");
    expect(reducePopup(ready({ paired: false }), { type: "send" }).name).toBe("ready");
    expect(reducePopup(ready({ offline: true }), { type: "send" }).name).toBe("ready");
  });

  it("maps a stub success only after sending, and a failure into an error", () => {
    const sending = reducePopup(ready(), { type: "send" });
    expect(reducePopup(sending, eventForUploadResult({ ok: true, message: "Stub accepted." }))).toMatchObject({
      name: "success",
    });
    expect(
      reducePopup(sending, eventForUploadResult({ ok: false, message: "The article needs a title and an http(s) URL." })),
    ).toMatchObject({ name: "error", kind: "unsupportedPage" });
    expect(reducePopup(sending, { type: "uploadFailed", kind: "appUnreachable" })).toMatchObject({
      name: "error",
      kind: "appUnreachable",
    });
  });

  it("retries a send, rereads the page, or returns to confirm", () => {
    const sending = reducePopup(ready(), { type: "send" });
    const network = reducePopup(sending, { type: "uploadFailed", kind: "network" });
    expect(reducePopup(network, { type: "retry" }).name).toBe("sending");
    const unread = reducePopup({ name: "reading" }, { type: "pageUnread" });
    expect(reducePopup(unread, { type: "retry" }).name).toBe("reading");
    const limited = reducePopup(sending, { type: "uploadFailed", kind: "rateLimit" });
    expect(reducePopup(limited, { type: "acknowledge" }).name).toBe("ready");
    expect(reducePopup(limited, { type: "retry" })).toEqual(limited);
  });
});

describe("popupCopy", () => {
  it("shows confirm copy and does not offer Send until the page is ready and paired", () => {
    const reading = popupCopy({ name: "reading" });
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
      expect(popupCopy({ name: "error", kind, page })).toMatchObject(expected[kind]);
    }
    expect(popupCopy({ name: "error", kind: "appUnreachable", page }).secondaryLabel).toBe("Open app");
    expect(popupCopy({ name: "error", kind: "notPaired", page }).secondaryLabel).toBe("Retry");
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
