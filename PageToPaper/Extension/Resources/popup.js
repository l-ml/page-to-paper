/* Generated from src/ by esbuild. Do not edit. */
"use strict";
(() => {
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
    uploadArticle: "uploadArticle"
  };
  var forbiddenSecretKeys = [
    "token",
    "accessToken",
    "deviceToken",
    "refreshToken",
    "password",
    "secret"
  ];
  var containingAppNativeId = "application";
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
      if (forbiddenSecretKeys.includes(key)) return key;
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
  function sendToContainingApp(message, sendNativeMessage) {
    return sendNativeMessage(containingAppNativeId, message);
  }

  // src/capture.ts
  var pageUnread = "Could not read this page. Allow Page to Paper for the site in Safari, then try again.";
  async function captureActiveArticle(deps) {
    const tab = await deps.queryActiveTab();
    if (tab?.id === void 0) {
      return { ok: false, message: "No active tab." };
    }
    let raw;
    try {
      raw = await deps.extract(tab.id);
    } catch {
      return { ok: false, message: pageUnread };
    }
    let request;
    try {
      request = buildUploadRequest(parseArticleDraft(raw));
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : pageUnread;
      return { ok: false, message };
    }
    try {
      return parseUploadResult(await deps.sendNative(request));
    } catch {
      return { ok: false, message: "The Page to Paper app did not answer." };
    }
  }

  // src/popup.ts
  function element(selector, ctor) {
    const node = document.querySelector(selector);
    if (!(node instanceof ctor)) {
      throw new Error(`Missing ${selector}`);
    }
    return node;
  }
  function render(result) {
    const status = element("#status", HTMLElement);
    const detail = element("#detail", HTMLElement);
    const retry = element("#retry", HTMLButtonElement);
    status.textContent = result.ok ? "Stub accepted" : "Not sent";
    status.dataset.state = result.ok ? "ok" : "bad";
    detail.textContent = result.message;
    retry.hidden = false;
  }
  async function run() {
    const status = element("#status", HTMLElement);
    const detail = element("#detail", HTMLElement);
    const retry = element("#retry", HTMLButtonElement);
    retry.hidden = true;
    status.textContent = "Reading this page\u2026";
    status.dataset.state = "";
    detail.textContent = "";
    const result = await captureActiveArticle({
      queryActiveTab: async () => {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        return tabs[0];
      },
      extract: (tabId) => browser.tabs.sendMessage(tabId, { type: "extractArticle" }),
      sendNative: (message) => sendToContainingApp(
        message,
        (application, body) => browser.runtime.sendNativeMessage(application, body)
      )
    });
    render(result);
  }
  element("#retry", HTMLButtonElement).addEventListener("click", () => {
    void run();
  });
  void run();
})();
