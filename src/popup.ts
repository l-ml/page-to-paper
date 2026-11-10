import { assignPairingLink, pairingDeepLink, type PairingDeepLinkReason } from "./appLink";
import { clearStoredPairing, queryPaired, readActivePage, uploadDraft } from "./capture";
import { requestNative } from "./nativeCall";
import {
  eventForUploadResult,
  initialPopup,
  popupCopy,
  previewFromDraft,
  reducePopup,
  successDismissMs,
  type PopupAction,
  type PopupPhase,
} from "./popupState";

let phase: PopupPhase = initialPopup();
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

function render(): void {
  const view = popupCopy(phase);
  const preview = element("#preview", HTMLElement);
  const title = element("#page-title", HTMLElement);
  const host = element("#page-host", HTMLElement);
  const meta = element("#meta", HTMLElement);
  const status = element("#status", HTMLElement);
  const detail = element("#detail", HTMLElement);
  const footnote = element("#footnote", HTMLElement);
  const primary = element("#primary", HTMLButtonElement);
  const primaryLabel = element("#primary-label", HTMLElement);
  const spinner = element("#spinner", HTMLElement);
  const secondary = element("#secondary", HTMLButtonElement);

  preview.hidden = !view.showPreview;
  title.textContent = view.previewTitle ?? "";
  host.textContent = view.hostname ?? "";
  preview.setAttribute(
    "aria-label",
    view.showPreview
      ? `${view.previewTitle}. ${view.hostname}. Destination Inbox. Format EPUB.`
      : "",
  );
  meta.hidden = !view.showMeta;
  status.hidden = !view.status;
  status.textContent = view.status;
  status.dataset.state =
    phase.name === "success" ? "ok" : phase.name === "error" || phase.name === "unavailable" || (phase.name === "ready" && phase.offline) ? "bad" : "";
  detail.hidden = !view.detail;
  detail.textContent = view.detail;
  footnote.hidden = !view.footnote;
  footnote.textContent = view.footnote;
  primary.hidden = !view.primaryLabel;
  primary.disabled = view.primaryDisabled || view.busy;
  primaryLabel.textContent = view.primaryLabel ?? "";
  spinner.hidden = !view.busy;
  secondary.hidden = !view.secondaryLabel;
  secondary.textContent = view.secondaryLabel ?? "";
  status.setAttribute("aria-label", view.announcement);
}

function openApp(reason: PairingDeepLinkReason): void {
  assignPairingLink(window.location, reason);
}

async function clearPairingThenOpen(): Promise<void> {
  try {
    await clearStoredPairing(dispatch);
  } catch {
    // Still open the app. The token was already unusable.
  }
  window.location.href = pairingDeepLink("expired");
}

async function loadPage(): Promise<void> {
  clearTimeout(dismissTimer);
  phase = reducePopup(phase, { type: "open" });
  render();
  const read = await readActivePage({
    queryActiveTab: async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    },
    extract: (tabId) => browser.tabs.sendMessage(tabId, { type: "extractArticle" }),
  });
  if (!read.ok) {
    phase = reducePopup(phase, { type: "pageUnread" });
    render();
    return;
  }
  const page = previewFromDraft(read.draft);
  const pairing = await queryPaired(dispatch);
  if (pairing.status === "unreachable") {
    phase = reducePopup(phase, { type: "nativeUnreachable", page });
    render();
    return;
  }
  phase = reducePopup(phase, {
    type: "pageLoaded",
    page,
    paired: pairing.paired,
    offline: navigator.onLine === false,
  });
  render();
}

async function performUpload(): Promise<void> {
  if (phase.name !== "sending") return;
  const page = phase.page;
  console.info("[page-to-paper] popup send started");
  let event;
  try {
    event = eventForUploadResult(await uploadDraft(page.draft, dispatch));
  } catch {
    event = eventForUploadResult({ ok: false, message: "The Page to Paper app did not answer." });
  }
  if (phase.name !== "sending") return;
  phase = reducePopup(phase, event);
  console.info(`[page-to-paper] popup UI update ${phase.name}`);
  render();
  if (phase.name === "success") {
    dismissTimer = setTimeout(() => {
      finish();
    }, successDismissMs);
  }
}

function finish(): void {
  clearTimeout(dismissTimer);
  phase = reducePopup(phase, { type: "done" });
  render();
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
    const next = reducePopup(phase, { type: "send" });
    if (next.name !== "sending") return;
    phase = next;
    render();
    void performUpload();
    return;
  }
  if (action === "retry-send") {
    const next = reducePopup(phase, { type: "retry" });
    if (next.name !== "sending") return;
    phase = next;
    render();
    void performUpload();
    return;
  }
  if (action === "retry-read") {
    void loadPage();
    return;
  }
  if (action === "dismiss") {
    phase = reducePopup(phase, { type: "acknowledge" });
    render();
  }
}

element("#primary", HTMLButtonElement).addEventListener("click", () => {
  const view = popupCopy(phase);
  if (view.primaryDisabled) return;
  if (view.clearPairing) {
    void clearPairingThenOpen();
    return;
  }
  runAction(view.primaryAction, view.openReason);
});

element("#secondary", HTMLButtonElement).addEventListener("click", () => {
  const view = popupCopy(phase);
  runAction(view.secondaryAction, view.openReason);
});

window.addEventListener("online", () => {
  phase = reducePopup(phase, { type: "connectivity", offline: false });
  render();
});

window.addEventListener("offline", () => {
  phase = reducePopup(phase, { type: "connectivity", offline: true });
  render();
});

void loadPage();
