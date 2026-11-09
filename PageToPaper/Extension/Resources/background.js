/* Generated from src/ by esbuild. Do not edit. */
"use strict";
(() => {
  // src/messaging.ts
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

  // src/background.ts
  browser.runtime.onInstalled.addListener(() => {
  });
  browser.runtime.onMessage.addListener((message) => {
    if (findForbiddenSecretKey(message)) {
      console.warn("Ignoring a message that carries secrets.");
    }
  });
})();
