/* Generated from src/ by esbuild. Do not edit. */
"use strict";
(() => {
  // src/messaging.ts
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
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtractRequest(message)) return;
    sendResponse(extractDraft());
    return true;
  });
})();
