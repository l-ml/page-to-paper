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
  var idempotencyKeyMin = 8;
  var idempotencyKeyMax = 80;
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
  var uploadErrorKinds = [
    "network",
    "timeout",
    "notPaired",
    "authExpired",
    "rateLimit",
    "unsupportedPage",
    "appUnreachable",
    "unknown",
    "pageUnread"
  ];
  var MessageShapeError = class extends Error {
    constructor(message, code) {
      super(message);
      this.name = "MessageShapeError";
      this.code = code;
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
  function optionalText(value, max, label, code) {
    if (value === void 0 || value === null) return void 0;
    if (typeof value !== "string") {
      throw new MessageShapeError(`${label} must be a string.`);
    }
    const trimmed = value.trim();
    if (!trimmed) return void 0;
    if (trimmed.length > max) {
      throw new MessageShapeError(`${label} is too long.`, code);
    }
    return trimmed;
  }
  var bridgeReserved = /[[\]{}|^]/g;
  function encodeBridgeReserved(value) {
    return value.replace(bridgeReserved, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  function bridgeURLString(url) {
    return `${url.origin}${encodeBridgeReserved(`${url.pathname}${url.search}${url.hash}`)}`;
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
      throw new MessageShapeError("Article title is too long.", "titleTooLong");
    }
    if (typeof value.url !== "string" || !value.url.trim()) {
      throw new MessageShapeError("Article URL is missing.");
    }
    const rawURL = value.url.trim();
    let url;
    try {
      url = new URL(rawURL);
    } catch {
      throw new MessageShapeError("Article URL is invalid.", "urlInvalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new MessageShapeError("Article URL must be http or https.", "urlScheme");
    }
    if (url.username || url.password) {
      throw new MessageShapeError("Article URL must not include credentials.", "urlCredentials");
    }
    if (!url.hostname) {
      throw new MessageShapeError("Article URL is invalid.", "urlInvalid");
    }
    const bridgedURL = bridgeURLString(url);
    if (bridgedURL.length > limits.url) {
      throw new MessageShapeError("Article URL is too long.", "urlTooLong");
    }
    const draft = { title, url: bridgedURL };
    const html = optionalText(value.html, limits.html, "Article HTML");
    const byline = optionalText(value.byline, limits.byline, "Byline", "bylineTooLong");
    if (html) draft.html = html;
    if (byline) draft.byline = byline;
    return draft;
  }
  function isIdempotencyKey(value) {
    if (value.length < idempotencyKeyMin || value.length > idempotencyKeyMax) return false;
    for (const char of value) {
      const code = char.charCodeAt(0);
      const digit = code >= 48 && code <= 57;
      const upper = code >= 65 && code <= 90;
      const lower = code >= 97 && code <= 122;
      if (!digit && !upper && !lower && code !== 45) return false;
    }
    return true;
  }
  function newIdempotencyKey() {
    const generated = readRandomUUID();
    if (generated && isIdempotencyKey(generated)) return generated;
    return fallbackIdempotencyKey();
  }
  function readRandomUUID() {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID !== "function") return void 0;
    try {
      return randomUUID.call(globalThis.crypto);
    } catch {
      return void 0;
    }
  }
  function fallbackIdempotencyKey() {
    const bytes = new Uint8Array(16);
    const random = globalThis.crypto?.getRandomValues;
    if (typeof random === "function") {
      random.call(globalThis.crypto, bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = bytes[6] & 15 | 64;
    bytes[8] = bytes[8] & 63 | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function buildUploadRequest(draft, idempotencyKey) {
    const parsed = parseArticleDraft(draft);
    if (!isIdempotencyKey(idempotencyKey)) {
      throw new MessageShapeError("Idempotency key is invalid.");
    }
    const request = {
      type: messageTypes.uploadArticle,
      idempotencyKey,
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
    if (typeof value.mock === "boolean") result.mock = value.mock;
    if (typeof value.errorKind === "string" && uploadErrorKinds.includes(value.errorKind)) {
      result.errorKind = value.errorKind;
    }
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
    if (tab?.id === void 0) return { ok: false, reason: "unread" };
    try {
      await deps.inject(tab.id);
      return { ok: true, draft: parseArticleDraft(await deps.extract(tab.id)) };
    } catch (error) {
      if (error instanceof MessageShapeError && isUnsupportedPage(error.code)) {
        return { ok: false, reason: "unsupported" };
      }
      return { ok: false, reason: "unread" };
    }
  }
  var unsupportedPageCodes = [
    "urlTooLong",
    "urlScheme",
    "urlCredentials",
    "urlInvalid",
    "titleTooLong",
    "bylineTooLong"
  ];
  function isUnsupportedPage(code) {
    return code !== void 0 && unsupportedPageCodes.includes(code);
  }
  async function queryPaired(dispatch2) {
    try {
      const raw = await dispatch2({ type: messageTypes.pairingStatus });
      return { status: "known", paired: parsePairingStatus(raw).paired };
    } catch {
      return { status: "unreachable" };
    }
  }
  async function uploadDraft(draft, idempotencyKey, dispatch2) {
    try {
      const raw = await dispatch2(buildUploadRequest(draft, idempotencyKey));
      return parseUploadResult(raw);
    } catch (error) {
      if (error instanceof MessageShapeError) {
        return { ok: false, message: "The page could not be prepared as an EPUB." };
      }
      return { ok: false, message: "The Page to Paper app did not answer." };
    }
  }
  async function clearStoredPairing(dispatch2) {
    await dispatch2({ type: messageTypes.clearPairing });
  }

  // src/popupState.ts
  var successDismissMs = 1200;
  var nativeCallTimeoutMs = 1e4;
  var uploadRoundTripMs = 25e3;
  var unavailableDetail = "Sending to your reMarkable isn't implemented in this build.";
  var mockSuccessDetail = "Test mode: nothing was uploaded to your reMarkable.";
  function nativeTimeoutMs(message) {
    if (isRecord(message) && message.type === messageTypes.uploadArticle) return uploadRoundTripMs;
    return nativeCallTimeoutMs;
  }
  function initialPopup() {
    return { name: "idle", busy: false };
  }
  function dismissClosesPopup(state) {
    return state.name === "error" && state.kind === "unsupportedPage" && state.page === void 0;
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
          busy: false
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
          idempotencyKey: state.name === "sending" ? state.idempotencyKey : void 0,
          busy: false
        };
      case "retry": {
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
      }
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
          busy: false
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
  var pairedFootnote = "Saves an EPUB to your reMarkable Inbox.";
  var unpairedFootnote = "Pair your reMarkable in the Page to Paper app to continue.";
  function pageOf(state) {
    if (state.name === "idle" || state.name === "reading") return void 0;
    return state.page;
  }
  function popupCopy(state) {
    return { ...copyFor(state), busy: state.busy };
  }
  function copyFor(state) {
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
          announcement: "Sent to reMarkable Inbox as EPUB."
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
          announcement: mockSuccessDetail
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
          announcement: `Not available yet. ${unavailableDetail}`
        };
      case "error":
        return errorCopy(state.kind, state.page, state.afterSend === true);
      default:
        return empty("");
    }
  }
  function eventForUploadResult(result) {
    if (result.ok && result.mock === true) return { type: "uploadMocked" };
    if (result.ok && result.implemented === true) return { type: "uploadSucceeded" };
    if (result.ok) return { type: "uploadUnavailable" };
    if (result.errorKind) return { type: "uploadFailed", kind: result.errorKind };
    return { type: "uploadFailed", kind: errorKindForUploadFailure(result.message) };
  }
  function autoDismisses(state) {
    return state.name === "success";
  }
  function errorKindForUploadFailure(message) {
    const text = message.toLowerCase();
    if (text.includes("timed out") || text.includes("timeout")) return "timeout";
    if (/\btoo many\b/.test(text) || /\brate\b/.test(text) || /\b429\b/.test(text) || text.includes("throttl")) {
      return "rateLimit";
    }
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
      announcement: offline ? "You\u2019re offline." : state.page.title
    };
  }
  function errorCopy(kind, page, afterSend = false) {
    const table = {
      network: view("Couldn\u2019t send", "Check your connection and try again.", "Retry", "retry-send"),
      timeout: view("Timed out", "The send took too long. Try again.", "Retry", "retry-send"),
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
      rateLimit: {
        ...view("Too many sends", "Please wait a moment and try again.", "OK", "dismiss"),
        footnote: "Wait a moment before sending another page."
      },
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
      announcement: status
    };
  }

  // src/nativeCall.ts
  var timeoutMessage = "The Page to Paper app did not answer.";
  function requestNative(message, sendMessage, timeoutMs = nativeCallTimeoutMs) {
    const type = messageType(message);
    console.info(`[page-to-paper] popup \u2192 background ${type}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        console.warn(`[page-to-paper] popup timeout ${type}`);
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      sendMessage({ type: "nativeRequest", payload: message }).then(
        (response) => {
          clearTimeout(timer);
          console.info(`[page-to-paper] popup \u2190 background ${type}`);
          if (isRecord(response) && response.ok === true && "value" in response) {
            resolve(response.value);
            return;
          }
          const detail = isRecord(response) && typeof response.message === "string" ? response.message : timeoutMessage;
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
    if (isRecord(message) && typeof message.type === "string") return message.type;
    return "unknown";
  }

  // src/popupAttempt.ts
  function nextAttempt(current) {
    return current + 1;
  }
  function isCurrentAttempt(started, current) {
    return started === current;
  }

  // src/popupRender.ts
  function element(doc, selector, ctor) {
    const node = doc.querySelector(selector);
    if (!(node instanceof ctor)) {
      throw new Error(`Missing ${selector}`);
    }
    return node;
  }
  function renderPopup(doc, phase) {
    const view2 = popupCopy(phase);
    const preview2 = element(doc, "#preview", HTMLElement);
    const title = element(doc, "#page-title", HTMLElement);
    const host = element(doc, "#page-host", HTMLElement);
    const meta = element(doc, "#meta", HTMLElement);
    const status = element(doc, "#status", HTMLElement);
    const detail = element(doc, "#detail", HTMLElement);
    const footnote = element(doc, "#footnote", HTMLElement);
    const primary = element(doc, "#primary", HTMLButtonElement);
    const primaryLabel = element(doc, "#primary-label", HTMLElement);
    const spinner = element(doc, "#spinner", HTMLElement);
    const secondary = element(doc, "#secondary", HTMLButtonElement);
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
    primary.setAttribute("aria-busy", view2.busy ? "true" : "false");
    primaryLabel.textContent = view2.primaryLabel ?? "";
    spinner.hidden = !view2.busy;
    secondary.hidden = !view2.secondaryLabel;
    secondary.textContent = view2.secondaryLabel ?? "";
    status.setAttribute("aria-label", view2.announcement);
  }

  // src/popupSession.ts
  function createPopupSession(options) {
    const clock = options.clock ?? globalThis;
    const timeoutMs = options.timeoutMs ?? nativeCallTimeoutMs;
    const log = options.log ?? ((line) => {
      if (line.includes("watchdog")) console.warn(line);
      else console.info(line);
    });
    let phase = initialPopup();
    let watchdog;
    function disarm() {
      if (watchdog === void 0) return;
      clock.clearTimeout(watchdog);
      watchdog = void 0;
    }
    function arm() {
      disarm();
      const budget = phase.name === "sending" ? uploadRoundTripMs : timeoutMs;
      watchdog = clock.setTimeout(() => {
        watchdog = void 0;
        if (!phase.busy) return;
        log(`[page-to-paper] popup watchdog timeout ${phase.name}`);
        commit({ type: "busyTimeout" });
      }, budget);
    }
    function commit(event) {
      const from = phase;
      phase = reducePopup(phase, event);
      log(`[page-to-paper] popup ${from.name} -> ${phase.name} busy=${phase.busy}`);
      options.render(phase);
      const sameBusyWork = from.busy && phase.busy && from.name === phase.name;
      if (phase.busy && !sameBusyWork) arm();
      else if (!phase.busy) disarm();
    }
    return {
      phase: () => phase,
      commit
    };
  }

  // src/popup.ts
  var session = createPopupSession({
    render: (phase) => renderPopup(document, phase)
  });
  var dismissTimer;
  var attempt = 0;
  function dispatch(message) {
    return requestNative(message, (body) => browser.runtime.sendMessage(body), nativeTimeoutMs(message));
  }
  function openApp(reason) {
    assignPairingLink(window.location, reason);
  }
  async function clearPairingThenOpen(reason) {
    try {
      await clearStoredPairing(dispatch);
    } catch {
    }
    window.location.href = pairingDeepLink(reason);
  }
  async function loadPage() {
    clearTimeout(dismissTimer);
    const started = nextAttempt(attempt);
    attempt = started;
    session.commit({ type: "open" });
    const read = await readActivePage({
      queryActiveTab: async () => {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
      },
      inject: async (tabId) => {
        await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      },
      extract: (tabId) => browser.tabs.sendMessage(tabId, { type: "extractArticle" })
    });
    if (!isCurrentAttempt(started, attempt) || session.phase().name !== "reading") return;
    if (!read.ok) {
      session.commit(read.reason === "unsupported" ? { type: "pageUnsupported" } : { type: "pageUnread" });
      return;
    }
    const page = previewFromDraft(read.draft);
    const pairing = await queryPaired(dispatch);
    if (!isCurrentAttempt(started, attempt) || session.phase().name !== "reading") return;
    if (pairing.status === "unreachable") {
      session.commit({ type: "nativeUnreachable", page });
      return;
    }
    session.commit({
      type: "pageLoaded",
      page,
      paired: pairing.paired,
      offline: navigator.onLine === false
    });
  }
  async function performUpload() {
    const current = session.phase();
    if (current.name !== "sending") return;
    const started = nextAttempt(attempt);
    attempt = started;
    const page = current.page;
    const idempotencyKey = current.idempotencyKey;
    console.info("[page-to-paper] popup send started");
    let event;
    try {
      event = eventForUploadResult(await uploadDraft(page.draft, idempotencyKey, dispatch));
    } catch {
      event = eventForUploadResult({ ok: false, message: "The Page to Paper app did not answer." });
    }
    if (!isCurrentAttempt(started, attempt) || session.phase().name !== "sending") return;
    session.commit(event);
    const updated = session.phase();
    console.info(`[page-to-paper] popup UI update ${updated.name}`);
    if (autoDismisses(updated)) {
      dismissTimer = setTimeout(() => {
        finish();
      }, successDismissMs);
    }
  }
  function finish() {
    clearTimeout(dismissTimer);
    session.commit({ type: "done" });
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
      session.commit({ type: "send", idempotencyKey: newIdempotencyKey() });
      if (session.phase().name !== "sending") return;
      void performUpload();
      return;
    }
    if (action === "retry-send") {
      const phase = session.phase();
      const carried = phase.name === "error" ? phase.idempotencyKey : void 0;
      session.commit({ type: "retry", idempotencyKey: carried ?? newIdempotencyKey() });
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
      if (dismissClosesPopup(session.phase())) {
        window.close();
        return;
      }
      session.commit({ type: "acknowledge", offline: navigator.onLine === false });
    }
  }
  element(document, "#primary", HTMLButtonElement).addEventListener("click", () => {
    const view2 = popupCopy(session.phase());
    if (view2.primaryDisabled) return;
    if (view2.clearPairing && view2.openReason) {
      void clearPairingThenOpen(view2.openReason);
      return;
    }
    runAction(view2.primaryAction, view2.openReason);
  });
  element(document, "#secondary", HTMLButtonElement).addEventListener("click", () => {
    const view2 = popupCopy(session.phase());
    runAction(view2.secondaryAction, view2.openReason);
  });
  window.addEventListener("online", () => {
    session.commit({ type: "connectivity", offline: false });
  });
  window.addEventListener("offline", () => {
    session.commit({ type: "connectivity", offline: true });
  });
  void loadPage();
})();
