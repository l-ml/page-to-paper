import { assignPairingLink, pairingDeepLink, type PairingDeepLinkReason } from "./appLink";
import { clearStoredPairing, queryPaired, readActivePage, uploadDraft } from "./capture";
import { requestNative } from "./nativeCall";
import { renderPopup } from "./popupRender";
import { createPopupSession } from "./popupSession";
import {
  eventForUploadResult,
  popupCopy,
  previewFromDraft,
  successDismissMs,
  type PopupAction,
} from "./popupState";

const session = createPopupSession({
  render: (phase) => renderPopup(document, phase),
});

let dismissTimer: ReturnType<typeof setTimeout> | undefined;

function element<T extends Element>(selector: string, ctor: new () => T): T {
  const node = document.querySelector(selector);
  if (!(node instanceof ctor)) {
    throw new Error(`Missing ${selector}`);
  }
  return node;
}

function dispatch(message: unknown): Promise<unknown> {
  return requestNative(message, (body) => browser.runtime.sendMessage(body));
}

function openApp(reason: PairingDeepLinkReason): void {
  assignPairingLink(window.location, reason);
}

async function clearPairingThenOpen(reason: PairingDeepLinkReason): Promise<void> {
  try {
    await clearStoredPairing(dispatch);
  } catch {
    // Still open the app. The token was already unusable.
  }
  window.location.href = pairingDeepLink(reason);
}

async function loadPage(): Promise<void> {
  clearTimeout(dismissTimer);
  session.commit({ type: "open" });
  const read = await readActivePage({
    queryActiveTab: async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    },
    inject: async (tabId) => {
      await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    },
    extract: (tabId) => browser.tabs.sendMessage(tabId, { type: "extractArticle" }),
  });
  // A watchdog may already have left "reading". A late result must not set busy again.
  if (session.phase().name !== "reading") return;
  if (!read.ok) {
    session.commit(read.reason === "unsupported" ? { type: "pageUnsupported" } : { type: "pageUnread" });
    return;
  }
  const page = previewFromDraft(read.draft);
  const pairing = await queryPaired(dispatch);
  if (session.phase().name !== "reading") return;
  if (pairing.status === "unreachable") {
    session.commit({ type: "nativeUnreachable", page });
    return;
  }
  session.commit({
    type: "pageLoaded",
    page,
    paired: pairing.paired,
    offline: navigator.onLine === false,
  });
}

async function performUpload(): Promise<void> {
  const current = session.phase();
  if (current.name !== "sending") return;
  const page = current.page;
  console.info("[page-to-paper] popup send started");
  let event;
  try {
    event = eventForUploadResult(await uploadDraft(page.draft, dispatch));
  } catch {
    event = eventForUploadResult({ ok: false, message: "The Page to Paper app did not answer." });
  }
  if (session.phase().name !== "sending") return;
  session.commit(event);
  const updated = session.phase();
  console.info(`[page-to-paper] popup UI update ${updated.name}`);
  if (updated.name === "success") {
    dismissTimer = setTimeout(() => {
      finish();
    }, successDismissMs);
  }
}

function finish(): void {
  clearTimeout(dismissTimer);
  session.commit({ type: "done" });
  window.close();
}

function runAction(action: PopupAction | undefined, reason: PairingDeepLinkReason | undefined): void {
  if (!action) return;
  if (action === "open-app" && reason) {
    openApp(reason);
    return;
  }
  if (action === "done") {
    finish();
    return;
  }
  if (action === "send") {
    session.commit({ type: "send" });
    if (session.phase().name !== "sending") return;
    void performUpload();
    return;
  }
  if (action === "retry-send") {
    session.commit({ type: "retry" });
    if (session.phase().name === "reading") {
      void loadPage();
      return;
    }
    if (session.phase().name !== "sending") return;
    void performUpload();
    return;
  }
  if (action === "retry-read") {
    void loadPage();
    return;
  }
  if (action === "dismiss") {
    session.commit({ type: "acknowledge", offline: navigator.onLine === false });
  }
}

element("#primary", HTMLButtonElement).addEventListener("click", () => {
  const view = popupCopy(session.phase());
  if (view.primaryDisabled) return;
  if (view.clearPairing && view.openReason) {
    void clearPairingThenOpen(view.openReason);
    return;
  }
  runAction(view.primaryAction, view.openReason);
});

element("#secondary", HTMLButtonElement).addEventListener("click", () => {
  const view = popupCopy(session.phase());
  runAction(view.secondaryAction, view.openReason);
});

window.addEventListener("online", () => {
  session.commit({ type: "connectivity", offline: false });
});

window.addEventListener("offline", () => {
  session.commit({ type: "connectivity", offline: true });
});

void loadPage();
