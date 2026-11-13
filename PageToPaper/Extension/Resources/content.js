/* Generated from src/ by esbuild. Do not edit. */
"use strict";
(() => {
  // src/messaging.ts
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
  function isExtractRequest(value) {
    if (!isRecord(value) || findForbiddenSecretKey(value)) return false;
    return value.type === messageTypes.extractArticle && Object.keys(value).length === 1;
  }

  // src/content.ts
  function readByline() {
    const selectors = ['meta[name="author"]', 'meta[property="article:author"]'];
    for (const selector of selectors) {
      const content = document.querySelector(selector)?.getAttribute("content")?.trim();
      if (content) return content;
    }
    return void 0;
  }
  function extractDraft() {
    const draft = {
      type: "articleDraft",
      title: document.title.trim() || "Untitled",
      url: location.href
    };
    const byline = readByline();
    if (byline) draft.byline = byline;
    return draft;
  }
  function installReader() {
    const scope = globalThis;
    if (scope.__pageToPaperReader) return;
    scope.__pageToPaperReader = true;
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtractRequest(message)) return;
      sendResponse(extractDraft());
      return true;
    });
  }
  installReader();
})();
