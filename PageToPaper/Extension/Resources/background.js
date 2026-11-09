/* Generated from src/ by esbuild. Do not edit. */
"use strict";
(() => {
  // src/messaging.ts
  var forbiddenSecretKeys = [
    "token",
    "password",
    "secret",
    "accesstoken",
    "authorization",
    "bearer",
    "devicetoken",
    "refreshtoken"
  ];
  function normalizeSecretKey(key) {
    return key.toLowerCase().replace(/[_-]/g, "");
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
      if (forbiddenSecretKeys.includes(normalizeSecretKey(key))) return key;
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
