import type { PairingDeepLinkReason } from "./appLink";
import {
  isRecord,
  messageTypes,
  uploadErrorKinds,
  type ArticleDraft,
  type UploadErrorKind,
} from "./messaging";

export const successDismissMs = 1200;
export const nativeCallTimeoutMs = 10_000;
/**
 * A send waits longer than the native transport timeout (UploadTiming.transportTimeout, 20 seconds)
 * so the app can return errorKind "timeout" before this round trip gives up.
 */
export const uploadRoundTripMs = 25_000;
export const unavailableDetail = "Sending to your reMarkable isn't implemented in this build.";
export const mockSuccessDetail = "Test mode: nothing was uploaded to your reMarkable.";

export function nativeTimeoutMs(message: unknown): number {
  if (isRecord(message) && message.type === messageTypes.uploadArticle) return uploadRoundTripMs;
  return nativeCallTimeoutMs;
}

export const errorKinds = uploadErrorKinds;

export type ErrorKind = UploadErrorKind;

export interface PagePreview {
  title: string;
  hostname: string;
  draft: ArticleDraft;
}

export type PopupPhase =
  | { name: "idle"; busy: false }
  | { name: "reading"; busy: true }
  | { name: "ready"; page: PagePreview; paired: boolean; offline: boolean; busy: false }
  | { name: "sending"; page: PagePreview; idempotencyKey: string; busy: true }
  | { name: "success"; page: PagePreview; busy: false }
  | { name: "mockSuccess"; page: PagePreview; busy: false }
  | { name: "unavailable"; page: PagePreview; busy: false }
  | { name: "error"; kind: ErrorKind; page?: PagePreview; afterSend?: boolean; idempotencyKey?: string; busy: false };

export type PopupEvent =
  | { type: "open" }
  | { type: "pageLoaded"; page: PagePreview; paired: boolean; offline: boolean }
  | { type: "pageUnread" }
  | { type: "pageUnsupported" }
  | { type: "send"; idempotencyKey: string }
  | { type: "uploadSucceeded" }
  | { type: "uploadMocked" }
  | { type: "uploadUnavailable" }
  | { type: "uploadFailed"; kind: ErrorKind }
  | { type: "nativeUnreachable"; page?: PagePreview }
  | { type: "retry"; idempotencyKey?: string }
  | { type: "acknowledge"; offline?: boolean }
  | { type: "done" }
  | { type: "connectivity"; offline: boolean }
  | { type: "busyTimeout" };

export type PopupAction = "send" | "retry-send" | "retry-read" | "open-app" | "dismiss" | "done";

export interface PopupView {
  previewTitle?: string;
  hostname?: string;
  showPreview: boolean;
  showMeta: boolean;
  status: string;
  detail: string;
  footnote: string;
  primaryLabel?: string;
  primaryAction?: PopupAction;
  primaryDisabled: boolean;
  secondaryLabel?: string;
  secondaryAction?: PopupAction;
  openReason?: PairingDeepLinkReason;
  /** Ask the app to delete the stored token before opening it. */
  clearPairing?: boolean;
  busy: boolean;
  announcement: string;
}

export function initialPopup(): PopupPhase {
  return { name: "idle", busy: false };
}

/** A page-less unsupported error has nothing to return to. OK should close the popup. */
export function dismissClosesPopup(state: PopupPhase): boolean {
  return state.name === "error" && state.kind === "unsupportedPage" && state.page === undefined;
}

export function previewFromDraft(draft: ArticleDraft): PagePreview {
  const hostname = new URL(draft.url).hostname;
  const trimmed = draft.title.trim();
  const title = !trimmed || trimmed === "Untitled" ? hostname || "Untitled page" : trimmed;
  return { title, hostname, draft };
}

export function reducePopup(state: PopupPhase, event: PopupEvent): PopupPhase {
  switch (event.type) {
    case "open":
      return { name: "reading", busy: true };
    case "pageLoaded":
      if (state.name !== "reading") return state;
      return { name: "ready", page: event.page, paired: event.paired, offline: event.offline, busy: false };
    case "pageUnread":
      if (state.name !== "reading") return state;
      return { name: "error", kind: "pageUnread", busy: false };
    case "pageUnsupported":
      if (state.name !== "reading") return state;
      return { name: "error", kind: "unsupportedPage", busy: false };
    case "send":
      if (state.name !== "ready" || !state.paired || state.offline) return state;
      return { name: "sending", page: state.page, idempotencyKey: event.idempotencyKey, busy: true };
    case "uploadSucceeded":
      if (state.name !== "sending") return state;
      return { name: "success", page: state.page, busy: false };
    case "uploadMocked":
      if (state.name !== "sending") return state;
      return { name: "mockSuccess", page: state.page, busy: false };
    case "uploadUnavailable":
      if (state.name !== "sending") return state;
      return { name: "unavailable", page: state.page, busy: false };
    case "uploadFailed":
      if (state.name !== "sending") return state;
      return {
        name: "error",
        kind: event.kind,
        page: state.page,
        afterSend: true,
        idempotencyKey: state.idempotencyKey,
        busy: false,
      };
    case "nativeUnreachable":
      if (state.name !== "reading") return state;
      return { name: "error", kind: "appUnreachable", page: event.page, afterSend: false, busy: false };
    case "busyTimeout":
      if (!state.busy) return state;
      return {
        name: "error",
        kind: "appUnreachable",
        page: pageOf(state),
        afterSend: state.name === "sending",
        idempotencyKey: state.name === "sending" ? state.idempotencyKey : undefined,
        busy: false,
      };
    case "retry":
      if (state.name !== "error") return state;
      if (state.kind === "appUnreachable" && !state.afterSend) {
        return { name: "reading", busy: true };
      }
      if (state.kind === "pageUnread" || state.kind === "notPaired" || state.kind === "authExpired" || !state.page) {
        return { name: "reading", busy: true };
      }
      if (state.kind === "rateLimit" || state.kind === "unsupportedPage") return state;
      const idempotencyKey = state.idempotencyKey ?? event.idempotencyKey;
      if (!idempotencyKey) return state;
      return { name: "sending", page: state.page, idempotencyKey, busy: true };
    case "acknowledge": {
      const offline = event.offline === true;
      if (state.name === "unavailable") {
        return { name: "ready", page: state.page, paired: true, offline, busy: false };
      }
      if (state.name !== "error") return state;
      if (!state.page) return { name: "idle", busy: false };
      return {
        name: "ready",
        page: state.page,
        paired: state.kind !== "notPaired" && state.kind !== "authExpired",
        offline,
        busy: false,
      };
    }
    case "done":
      if (state.name !== "success" && state.name !== "mockSuccess") return state;
      return { name: "idle", busy: false };
    case "connectivity":
      if (state.name !== "ready") return state;
      return { ...state, offline: event.offline, busy: false };
    default:
      return state;
  }
}

const pairedFootnote = "Saves an EPUB to your reMarkable Inbox.";
const unpairedFootnote = "Pair your reMarkable in the Page to Paper app to continue.";

function pageOf(state: PopupPhase): PagePreview | undefined {
  if (state.name === "idle" || state.name === "reading") return undefined;
  return state.page;
}

export function popupCopy(state: PopupPhase): PopupView {
  return { ...copyFor(state), busy: state.busy };
}

function copyFor(state: PopupPhase): Omit<PopupView, "busy"> {
  switch (state.name) {
    case "idle":
      return empty("Reading this page…");
    case "reading":
      return {
        ...empty("Reading this page…"),
        announcement: "Reading this page…",
      };
    case "ready":
      return readyCopy(state);
    case "sending":
      return {
        ...preview(state.page),
        showMeta: true,
        status: "Sending as EPUB…",
        detail: "Preparing EPUB…",
        footnote: pairedFootnote,
        primaryLabel: "Sending as EPUB…",
        primaryAction: "send",
        primaryDisabled: true,
        announcement: "Sending as EPUB to Inbox",
      };
    case "success":
      return {
        ...preview(state.page),
        showMeta: false,
        status: "Sent",
        detail: "Saved to Inbox as EPUB.",
        footnote: "",
        primaryLabel: "Done",
        primaryAction: "done",
        primaryDisabled: false,
        announcement: "Sent to reMarkable Inbox as EPUB.",
      };
    case "mockSuccess":
      return {
        ...preview(state.page),
        showMeta: false,
        status: "Test mode",
        detail: mockSuccessDetail,
        footnote: "",
        primaryLabel: "Done",
        primaryAction: "done",
        primaryDisabled: false,
        announcement: mockSuccessDetail,
      };
    case "unavailable":
      return {
        ...preview(state.page),
        showMeta: true,
        status: "Not available yet",
        detail: unavailableDetail,
        footnote: "",
        primaryLabel: "OK",
        primaryAction: "dismiss",
        primaryDisabled: false,
        announcement: `Not available yet. ${unavailableDetail}`,
      };
    case "error":
      return errorCopy(state.kind, state.page, state.afterSend === true);
    default:
      return empty("");
  }
}

/** Sent is only for a real upload. A mock stays on its own screen, and a stub stays unavailable. */
export function eventForUploadResult(result: {
  ok: boolean;
  message: string;
  implemented?: boolean;
  mock?: boolean;
  errorKind?: ErrorKind;
}): PopupEvent {
  if (result.ok && result.mock === true) return { type: "uploadMocked" };
  if (result.ok && result.implemented === true) return { type: "uploadSucceeded" };
  if (result.ok) return { type: "uploadUnavailable" };
  if (result.errorKind) return { type: "uploadFailed", kind: result.errorKind };
  return { type: "uploadFailed", kind: errorKindForUploadFailure(result.message) };
}

/** A real success closes itself. Mock success stays up so the test-mode line can be read. */
export function autoDismisses(state: PopupPhase): boolean {
  return state.name === "success";
}

/** Fallback when the app omits `errorKind`. Never returns a kind that clears the stored token. */
export function errorKindForUploadFailure(message: string): ErrorKind {
  const text = message.toLowerCase();
  if (text.includes("timed out") || text.includes("timeout")) return "timeout";
  if (/\btoo many\b/.test(text) || /\brate\b/.test(text)) return "rateLimit";
  if (text.includes("offline") || text.includes("network") || text.includes("connection")) return "network";
  if (text.includes("did not answer") || text.includes("unreadable") || text.includes("empty message")) {
    return "appUnreachable";
  }
  if (text.includes("title") || text.includes("url") || text.includes("epub") || text.includes("unsupported")) {
    return "unsupportedPage";
  }
  return "unknown";
}

function readyCopy(state: Extract<PopupPhase, { name: "ready" }>): Omit<PopupView, "busy"> {
  const offline = state.offline;
  const paired = state.paired;
  return {
    ...preview(state.page),
    showMeta: true,
    status: offline ? "You’re offline." : "",
    detail: "",
    footnote: paired ? pairedFootnote : unpairedFootnote,
    primaryLabel: paired ? "Send" : "Pair device",
    primaryAction: paired ? "send" : "open-app",
    primaryDisabled: paired && offline,
    openReason: paired ? undefined : "required",
    announcement: offline ? "You’re offline." : state.page.title,
  };
}

function errorCopy(kind: ErrorKind, page?: PagePreview, afterSend = false): Omit<PopupView, "busy"> {
  const table: Record<ErrorKind, Omit<PopupView, "busy">> = {
    network: view("Couldn’t send", "Check your connection and try again.", "Retry", "retry-send"),
    timeout: view("Timed out", "The send took too long. Try again.", "Retry", "retry-send"),
    notPaired: {
      ...view("Pairing required", "Open Page to Paper and pair your reMarkable.", "Re-pair", "open-app"),
      secondaryLabel: "Retry",
      secondaryAction: "retry-read",
      openReason: "required",
      clearPairing: true,
    },
    authExpired: {
      ...view("Sign in again", "Your reMarkable session expired.", "Re-pair", "open-app"),
      openReason: "expired",
      clearPairing: true,
    },
    rateLimit: view("Too many sends", "Please wait a moment and try again.", "OK", "dismiss"),
    unsupportedPage: view("Can’t send this page", "This page can’t be saved as an EPUB.", "OK", "dismiss"),
    appUnreachable: {
      ...view("Couldn’t reach the app", "Open Page to Paper, then try again.", "Retry", "retry-send"),
      secondaryLabel: "Open app",
      secondaryAction: "open-app",
      openReason: "unreachable",
    },
    unknown: view("Something went wrong", "Please try again. If it keeps happening, try later.", "Retry", "retry-send"),
    pageUnread: view(
      "Could not read this page",
      "Allow Page to Paper for the site in Safari, then try again.",
      "Try again",
      "retry-read",
    ),
  };
  const copy: Omit<PopupView, "busy"> = {
    ...table[kind],
    showPreview: Boolean(page),
    previewTitle: page?.title,
    hostname: page?.hostname,
    showMeta: false,
  };
  if (kind === "appUnreachable" && !afterSend) {
    copy.primaryAction = "retry-read";
  }
  return copy;
}

function view(status: string, detail: string, primaryLabel: string, primaryAction: PopupAction): Omit<PopupView, "busy"> {
  return {
    showPreview: false,
    showMeta: false,
    status,
    detail,
    footnote: "",
    primaryLabel,
    primaryAction,
    primaryDisabled: false,
    announcement: `${status}. ${detail}`,
  };
}

function preview(page: PagePreview): Pick<PopupView, "previewTitle" | "hostname" | "showPreview"> {
  return { previewTitle: page.title, hostname: page.hostname, showPreview: true };
}

function empty(status: string): Omit<PopupView, "busy"> {
  return {
    showPreview: false,
    showMeta: false,
    status,
    detail: "",
    footnote: "",
    primaryDisabled: true,
    announcement: status,
  };
}
