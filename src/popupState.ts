import type { PairingDeepLinkReason } from "./appLink";
import type { ArticleDraft } from "./messaging";

export const successDismissMs = 1200;
export const nativeCallTimeoutMs = 10_000;
export const unavailableDetail = "Sending to your reMarkable isn't implemented in this build.";

export const errorKinds = [
  "network",
  "notPaired",
  "authExpired",
  "rateLimit",
  "unsupportedPage",
  "appUnreachable",
  "unknown",
  "pageUnread",
] as const;

export type ErrorKind = (typeof errorKinds)[number];

export interface PagePreview {
  title: string;
  hostname: string;
  draft: ArticleDraft;
}

export type PopupPhase =
  | { name: "idle" }
  | { name: "reading" }
  | { name: "ready"; page: PagePreview; paired: boolean; offline: boolean }
  | { name: "sending"; page: PagePreview }
  | { name: "success"; page: PagePreview }
  | { name: "unavailable"; page: PagePreview }
  | { name: "error"; kind: ErrorKind; page?: PagePreview; afterSend?: boolean };

export type PopupEvent =
  | { type: "open" }
  | { type: "pageLoaded"; page: PagePreview; paired: boolean; offline: boolean }
  | { type: "pageUnread" }
  | { type: "send" }
  | { type: "uploadSucceeded" }
  | { type: "uploadUnavailable" }
  | { type: "uploadFailed"; kind: ErrorKind }
  | { type: "nativeUnreachable"; page?: PagePreview }
  | { type: "retry" }
  | { type: "acknowledge" }
  | { type: "done" }
  | { type: "connectivity"; offline: boolean };

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
  return { name: "idle" };
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
      return { name: "reading" };
    case "pageLoaded":
      if (state.name !== "reading") return state;
      return { name: "ready", page: event.page, paired: event.paired, offline: event.offline };
    case "pageUnread":
      if (state.name !== "reading") return state;
      return { name: "error", kind: "pageUnread" };
    case "send":
      if (state.name !== "ready" || !state.paired || state.offline) return state;
      return { name: "sending", page: state.page };
    case "uploadSucceeded":
      if (state.name !== "sending") return state;
      return { name: "success", page: state.page };
    case "uploadUnavailable":
      if (state.name !== "sending") return state;
      return { name: "unavailable", page: state.page };
    case "uploadFailed":
      if (state.name !== "sending") return state;
      return { name: "error", kind: event.kind, page: state.page, afterSend: true };
    case "nativeUnreachable":
      if (state.name !== "reading") return state;
      return { name: "error", kind: "appUnreachable", page: event.page, afterSend: false };
    case "retry":
      if (state.name !== "error") return state;
      if (state.kind === "appUnreachable" && !state.afterSend) {
        return { name: "reading" };
      }
      if (state.kind === "pageUnread" || state.kind === "notPaired" || state.kind === "authExpired" || !state.page) {
        return { name: "reading" };
      }
      if (state.kind === "rateLimit" || state.kind === "unsupportedPage") return state;
      return { name: "sending", page: state.page };
    case "acknowledge":
      if (state.name === "unavailable") {
        return { name: "ready", page: state.page, paired: true, offline: false };
      }
      if (state.name !== "error") return state;
      if (!state.page) return { name: "idle" };
      return {
        name: "ready",
        page: state.page,
        paired: state.kind !== "notPaired" && state.kind !== "authExpired",
        offline: false,
      };
    case "done":
      if (state.name !== "success") return state;
      return { name: "idle" };
    case "connectivity":
      if (state.name !== "ready") return state;
      return { ...state, offline: event.offline };
    default:
      return state;
  }
}

const pairedFootnote = "Saves an EPUB to your reMarkable Inbox.";
const unpairedFootnote = "Pair your reMarkable in the Page to Paper app to continue.";

export function popupCopy(state: PopupPhase): PopupView {
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
        busy: true,
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
        busy: false,
        announcement: "Sent to reMarkable Inbox as EPUB.",
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
        busy: false,
        announcement: `Not available yet. ${unavailableDetail}`,
      };
    case "error":
      return errorCopy(state.kind, state.page, state.afterSend === true);
    default:
      return empty("");
  }
}

/** Success is only for a real upload. The stub sets `implemented` false or omits it. */
export function eventForUploadResult(result: {
  ok: boolean;
  message: string;
  implemented?: boolean;
}): PopupEvent {
  if (result.ok && result.implemented === true) return { type: "uploadSucceeded" };
  if (result.ok) return { type: "uploadUnavailable" };
  return { type: "uploadFailed", kind: errorKindForUploadFailure(result.message) };
}

export function errorKindForUploadFailure(message: string): ErrorKind {
  const text = message.toLowerCase();
  if (text.includes("expir") || text.includes("sign in")) return "authExpired";
  if (text.includes("not paired") || text.includes("pair")) return "notPaired";
  if (text.includes("too many") || text.includes("rate")) return "rateLimit";
  if (text.includes("offline") || text.includes("network") || text.includes("connection")) return "network";
  if (text.includes("did not answer") || text.includes("unreadable") || text.includes("empty message")) {
    return "appUnreachable";
  }
  if (text.includes("title") || text.includes("url") || text.includes("epub") || text.includes("unsupported")) {
    return "unsupportedPage";
  }
  return "unknown";
}

function readyCopy(state: Extract<PopupPhase, { name: "ready" }>): PopupView {
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
    busy: false,
    announcement: offline ? "You’re offline." : state.page.title,
  };
}

function errorCopy(kind: ErrorKind, page?: PagePreview, afterSend = false): PopupView {
  const table: Record<ErrorKind, PopupView> = {
    network: view("Couldn’t send", "Check your connection and try again.", "Retry", "retry-send"),
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
  const copy: PopupView = {
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

function view(status: string, detail: string, primaryLabel: string, primaryAction: PopupAction): PopupView {
  return {
    showPreview: false,
    showMeta: false,
    status,
    detail,
    footnote: "",
    primaryLabel,
    primaryAction,
    primaryDisabled: false,
    busy: false,
    announcement: `${status}. ${detail}`,
  };
}

function preview(page: PagePreview): Pick<PopupView, "previewTitle" | "hostname" | "showPreview"> {
  return { previewTitle: page.title, hostname: page.hostname, showPreview: true };
}

function empty(status: string): PopupView {
  return {
    showPreview: false,
    showMeta: false,
    status,
    detail: "",
    footnote: "",
    primaryDisabled: true,
    busy: false,
    announcement: status,
  };
}
