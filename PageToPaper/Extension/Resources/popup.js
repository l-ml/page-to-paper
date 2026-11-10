/* Generated from src/ by esbuild. Do not edit. */
"use strict";
(() => {
  // src/appLink.ts
  var pairingBaseUrl = "pagetopaper://pair";
  function pairingDeepLink(reason) {
    if (!reason) return pairingBaseUrl;
    return `${pairingBaseUrl}?reason=${reason}`;
  }
  function assignPairingLink(location, reason) {
    location.href = pairingDeepLink(reason);
  }

  // src/messaging.ts
  var limits = {
    title: 300,
    byline: 200,
    html: 5e5,
    url: 2e3,
    resultMessage: 500,
    documentId: 200
  };
  var messageTypes = {
    extractArticle: "extractArticle",
    articleDraft: "articleDraft",
    uploadArticle: "uploadArticle",
    pairingStatus: "pairingStatus",
    clearPairing: "clearPairing"
  };
  var forbiddenSecretKeys = [
    "token",
    "password",
    "secret",
    "apikey",
    "accesstoken",
    "authorization",
    "bearer"
  ];
  function normalizeSecretKey(key) {
    return key.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function isSecretKey(key) {
    if (/[^\u0000-\u007f]/.test(key)) return true;
    const normalized = normalizeSecretKey(key);
    if (!normalized) return false;
    return forbiddenSecretKeys.some((stem) => normalized.includes(stem));
  }
  var MessageShapeError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "MessageShapeError";
    }
  };
  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function findForbiddenSecretKey(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findForbiddenSecretKey(item);
        if (found) return found;
      }
      return null;
    }
    if (!isRecord(value)) return null;
    for (const [key, child] of Object.entries(value)) {
      if (isSecretKey(key)) return key;
      const found = findForbiddenSecretKey(child);
      if (found) return found;
    }
    return null;
  }
  function rejectSecrets(value) {
    if (findForbiddenSecretKey(value)) {
      throw new MessageShapeError("Messages must not carry secrets.");
    }
  }
  function optionalText(value, max, label) {
    if (value === void 0 || value === null) return void 0;
    if (typeof value !== "string") {
      throw new MessageShapeError(`${label} must be a string.`);
    }
    const trimmed = value.trim();
    if (!trimmed) return void 0;
    if (trimmed.length > max) {
      throw new MessageShapeError(`${label} is too long.`);
    }
    return trimmed;
  }
  function parseArticleDraft(value) {
    rejectSecrets(value);
    if (!isRecord(value)) {
      throw new MessageShapeError("Article draft must be an object.");
    }
    if (value.type !== void 0 && value.type !== messageTypes.articleDraft) {
      throw new MessageShapeError("Unexpected message type.");
    }
    if (typeof value.title !== "string" || !value.title.trim()) {
      throw new MessageShapeError("Article title is missing.");
    }
    const title = value.title.trim();
    if (title.length > limits.title) {
      throw new MessageShapeError("Article title is too long.");
    }
    if (typeof value.url !== "string" || !value.url.trim()) {
      throw new MessageShapeError("Article URL is missing.");
    }
    const rawURL = value.url.trim();
    if (rawURL.length > limits.url) {
      throw new MessageShapeError("Article URL is too long.");
    }
    let url;
    try {
      url = new URL(rawURL);
    } catch {
      throw new MessageShapeError("Article URL is invalid.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new MessageShapeError("Article URL must be http or https.");
    }
    if (url.username || url.password) {
      throw new MessageShapeError("Article URL must not include credentials.");
    }
    if (!url.hostname) {
      throw new MessageShapeError("Article URL is invalid.");
    }
    const draft = { title, url: url.toString() };
    const html = optionalText(value.html, limits.html, "Article HTML");
    const byline = optionalText(value.byline, limits.byline, "Byline");
    if (html) draft.html = html;
    if (byline) draft.byline = byline;
    return draft;
  }
  function buildUploadRequest(draft) {
    const parsed = parseArticleDraft(draft);
    const request = {
      type: messageTypes.uploadArticle,
      draft: { title: parsed.title, url: parsed.url }
    };
    if (parsed.html) request.draft.html = parsed.html;
    if (parsed.byline) request.draft.byline = parsed.byline;
    return request;
  }
  function parseUploadResult(value) {
    if (findForbiddenSecretKey(value)) {
      return { ok: false, message: "The app returned a message that carries secrets." };
    }
    if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.message !== "string") {
      return { ok: false, message: "The app returned an unreadable result." };
    }
    const message = value.message.trim();
    if (!message || message.length > limits.resultMessage) {
      return { ok: false, message: "The app returned an unreadable result." };
    }
    const result = { ok: value.ok, message };
    if (typeof value.implemented === "boolean") result.implemented = value.implemented;
    if (value.documentId !== void 0 && value.documentId !== null) {
      if (typeof value.documentId !== "string") {
        return { ok: false, message: "The app returned an unreadable result." };
      }
      const documentId = value.documentId.trim();
      if (!documentId || documentId.length > limits.documentId) {
        return { ok: false, message: "The app returned an unreadable result." };
      }
      result.documentId = documentId;
    }
    return result;
  }
  function parsePairingStatus(value) {
    if (findForbiddenSecretKey(value)) {
      throw new MessageShapeError("Messages must not carry secrets.");
    }
    if (!isRecord(value) || typeof value.paired !== "boolean") {
      throw new MessageShapeError("Pairing status is unreadable.");
    }
    return { paired: value.paired };
  }

  // src/capture.ts
  async function readActivePage(deps) {
    const tab = await deps.queryActiveTab();
    if (tab?.id === void 0) return { ok: false };
    try {
      return { ok: true, draft: parseArticleDraft(await deps.extract(tab.id)) };
    } catch {
      return { ok: false };
    }
  }
  async function queryPaired(dispatch2) {
    try {
      const raw = await dispatch2({ type: messageTypes.pairingStatus });
      return { status: "known", paired: parsePairingStatus(raw).paired };
    } catch {
      return { status: "unreachable" };
    }
  }
  async function uploadDraft(draft, dispatch2) {
    try {
      const raw = await dispatch2(buildUploadRequest(draft));
      return parseUploadResult(raw);
    } catch {
      return { ok: false, message: "The Page to Paper app did not answer." };
    }
  }
  async function clearStoredPairing(dispatch2) {
    await dispatch2({ type: messageTypes.clearPairing });
  }

  // src/popupState.ts
  var successDismissMs = 1200;
  var nativeCallTimeoutMs = 1e4;
  var unavailableDetail = "Sending to your reMarkable isn't implemented in this build.";
  function initialPopup() {
    return { name: "idle" };
  }
  function previewFromDraft(draft) {
    const hostname = new URL(draft.url).hostname;
    const trimmed = draft.title.trim();
    const title = !trimmed || trimmed === "Untitled" ? hostname || "Untitled page" : trimmed;
    return { title, hostname, draft };
  }
  function reducePopup(state, event) {
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
          offline: false
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
  var pairedFootnote = "Saves an EPUB to your reMarkable Inbox.";
  var unpairedFootnote = "Pair your reMarkable in the Page to Paper app to continue.";
  function popupCopy(state) {
    switch (state.name) {
      case "idle":
        return empty("Reading this page\u2026");
      case "reading":
        return {
          ...empty("Reading this page\u2026"),
          announcement: "Reading this page\u2026"
        };
      case "ready":
        return readyCopy(state);
      case "sending":
        return {
          ...preview(state.page),
          showMeta: true,
          status: "Sending as EPUB\u2026",
          detail: "Preparing EPUB\u2026",
          footnote: pairedFootnote,
          primaryLabel: "Sending as EPUB\u2026",
          primaryAction: "send",
          primaryDisabled: true,
          busy: true,
          announcement: "Sending as EPUB to Inbox"
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
          announcement: "Sent to reMarkable Inbox as EPUB."
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
          announcement: `Not available yet. ${unavailableDetail}`
        };
      case "error":
        return errorCopy(state.kind, state.page, state.afterSend === true);
      default:
        return empty("");
    }
  }
  function eventForUploadResult(result) {
    if (result.ok && result.implemented === true) return { type: "uploadSucceeded" };
    if (result.ok) return { type: "uploadUnavailable" };
    return { type: "uploadFailed", kind: errorKindForUploadFailure(result.message) };
  }
  function errorKindForUploadFailure(message) {
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
  function readyCopy(state) {
    const offline = state.offline;
    const paired = state.paired;
    return {
      ...preview(state.page),
      showMeta: true,
      status: offline ? "You\u2019re offline." : "",
      detail: "",
      footnote: paired ? pairedFootnote : unpairedFootnote,
      primaryLabel: paired ? "Send" : "Pair device",
      primaryAction: paired ? "send" : "open-app",
      primaryDisabled: paired && offline,
      openReason: paired ? void 0 : "required",
      busy: false,
      announcement: offline ? "You\u2019re offline." : state.page.title
    };
  }
  function errorCopy(kind, page, afterSend = false) {
    const table = {
      network: view("Couldn\u2019t send", "Check your connection and try again.", "Retry", "retry-send"),
      notPaired: {
        ...view("Pairing required", "Open Page to Paper and pair your reMarkable.", "Re-pair", "open-app"),
        secondaryLabel: "Retry",
        secondaryAction: "retry-read",
        openReason: "required",
        clearPairing: true
      },
      authExpired: {
        ...view("Sign in again", "Your reMarkable session expired.", "Re-pair", "open-app"),
        openReason: "expired",
        clearPairing: true
      },
      rateLimit: view("Too many sends", "Please wait a moment and try again.", "OK", "dismiss"),
      unsupportedPage: view("Can\u2019t send this page", "This page can\u2019t be saved as an EPUB.", "OK", "dismiss"),
      appUnreachable: {
        ...view("Couldn\u2019t reach the app", "Open Page to Paper, then try again.", "Retry", "retry-send"),
        secondaryLabel: "Open app",
        secondaryAction: "open-app",
        openReason: "unreachable"
      },
      unknown: view("Something went wrong", "Please try again. If it keeps happening, try later.", "Retry", "retry-send"),
      pageUnread: view(
        "Could not read this page",
        "Allow Page to Paper for the site in Safari, then try again.",
        "Try again",
        "retry-read"
      )
    };
    const copy = {
      ...table[kind],
      showPreview: Boolean(page),
      previewTitle: page?.title,
      hostname: page?.hostname,
      showMeta: false
    };
    if (kind === "appUnreachable" && !afterSend) {
      copy.primaryAction = "retry-read";
    }
    return copy;
  }
  function view(status, detail, primaryLabel, primaryAction) {
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
      announcement: `${status}. ${detail}`
    };
  }
  function preview(page) {
    return { previewTitle: page.title, hostname: page.hostname, showPreview: true };
  }
  function empty(status) {
    return {
      showPreview: false,
      showMeta: false,
      status,
      detail: "",
      footnote: "",
      primaryDisabled: true,
      busy: false,
      announcement: status
    };
  }

  // src/nativeCall.ts
  var timeoutMessage = "The Page to Paper app did not answer.";
  function requestNative(message, sendMessage) {
    const type = messageType(message);
    console.info(`[page-to-paper] popup \u2192 background ${type}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        console.warn(`[page-to-paper] popup timeout ${type}`);
        reject(new Error(timeoutMessage));
      }, nativeCallTimeoutMs);
      sendMessage({ type: "nativeRequest", payload: message }).then(
        (response) => {
          clearTimeout(timer);
          console.info(`[page-to-paper] popup \u2190 background ${type}`);
          if (isRecord2(response) && response.ok === true && "value" in response) {
            resolve(response.value);
            return;
          }
          const detail = isRecord2(response) && typeof response.message === "string" ? response.message : timeoutMessage;
          reject(new Error(detail));
        },
        (error) => {
          clearTimeout(timer);
          console.warn(`[page-to-paper] popup background error ${type}`);
          reject(error instanceof Error ? error : new Error(timeoutMessage));
        }
      );
    });
  }
  function messageType(message) {
    if (isRecord2(message) && typeof message.type === "string") return message.type;
    return "unknown";
  }
  function isRecord2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // src/popup.ts
  var phase = initialPopup();
  var dismissTimer;
  function element(selector, ctor) {
    const node = document.querySelector(selector);
    if (!(node instanceof ctor)) {
      throw new Error(`Missing ${selector}`);
    }
    return node;
  }
  function dispatch(message) {
    return requestNative(message, (body) => browser.runtime.sendMessage(body));
  }
  function render() {
    const view2 = popupCopy(phase);
    const preview2 = element("#preview", HTMLElement);
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
    preview2.hidden = !view2.showPreview;
    title.textContent = view2.previewTitle ?? "";
    host.textContent = view2.hostname ?? "";
    preview2.setAttribute(
      "aria-label",
      view2.showPreview ? `${view2.previewTitle}. ${view2.hostname}. Destination Inbox. Format EPUB.` : ""
    );
    meta.hidden = !view2.showMeta;
    status.hidden = !view2.status;
    status.textContent = view2.status;
    status.dataset.state = phase.name === "success" ? "ok" : phase.name === "error" || phase.name === "unavailable" || phase.name === "ready" && phase.offline ? "bad" : "";
    detail.hidden = !view2.detail;
    detail.textContent = view2.detail;
    footnote.hidden = !view2.footnote;
    footnote.textContent = view2.footnote;
    primary.hidden = !view2.primaryLabel;
    primary.disabled = view2.primaryDisabled || view2.busy;
    primaryLabel.textContent = view2.primaryLabel ?? "";
    spinner.hidden = !view2.busy;
    secondary.hidden = !view2.secondaryLabel;
    secondary.textContent = view2.secondaryLabel ?? "";
    status.setAttribute("aria-label", view2.announcement);
  }
  function openApp(reason) {
    assignPairingLink(window.location, reason);
  }
  async function clearPairingThenOpen() {
    try {
      await clearStoredPairing(dispatch);
    } catch {
    }
    window.location.href = pairingDeepLink("expired");
  }
  async function loadPage() {
    clearTimeout(dismissTimer);
    phase = reducePopup(phase, { type: "open" });
    render();
    const read = await readActivePage({
      queryActiveTab: async () => {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
      },
      extract: (tabId) => browser.tabs.sendMessage(tabId, { type: "extractArticle" })
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
      offline: navigator.onLine === false
    });
    render();
  }
  async function performUpload() {
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
  function finish() {
    clearTimeout(dismissTimer);
    phase = reducePopup(phase, { type: "done" });
    render();
    window.close();
  }
  function runAction(action, reason) {
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
    const view2 = popupCopy(phase);
    if (view2.primaryDisabled) return;
    if (view2.clearPairing) {
      void clearPairingThenOpen();
      return;
    }
    runAction(view2.primaryAction, view2.openReason);
  });
  element("#secondary", HTMLButtonElement).addEventListener("click", () => {
    const view2 = popupCopy(phase);
    runAction(view2.secondaryAction, view2.openReason);
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
})();
