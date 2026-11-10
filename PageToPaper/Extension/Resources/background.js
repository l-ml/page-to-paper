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
      if (isSecretKey(key)) return key;
      const found = findForbiddenSecretKey(child);
      if (found) return found;
    }
    return null;
  }

  // src/popupState.ts
  var nativeCallTimeoutMs = 1e4;

  // src/nativeCall.ts
  var timeoutMessage = "The Page to Paper app did not answer.";
  function callNative(message, messenger) {
    if (findForbiddenSecretKey(message)) {
      return Promise.reject(new MessageShapeError("Messages must not carry secrets."));
    }
    const type = messageType(message);
    console.info(`[page-to-paper] background \u2192 native ${type}`);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) resolve(value);
        else reject(value instanceof Error ? value : new Error(timeoutMessage));
      };
      const timer = setTimeout(() => {
        console.warn(`[page-to-paper] background native timeout ${type}`);
        finish(false, new Error(timeoutMessage));
      }, nativeCallTimeoutMs);
      try {
        const maybe = messenger(containingAppNativeId, message, (response) => {
          console.info(`[page-to-paper] background native callback ${type}`);
          finish(true, response);
        });
        if (isPromise(maybe)) {
          maybe.then(
            (value) => {
              console.info(`[page-to-paper] background native promise ${type}`);
              finish(true, value);
            },
            (error) => {
              console.warn(`[page-to-paper] background native rejected ${type}`);
              finish(false, error);
            }
          );
        }
      } catch (error) {
        console.warn(`[page-to-paper] background native threw ${type}`);
        finish(false, error);
      }
    });
  }
  function messageType(message) {
    if (isRecord2(message) && typeof message.type === "string") return message.type;
    return "unknown";
  }
  function isRecord2(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function isPromise(value) {
    return isRecord2(value) && typeof value.then === "function";
  }

  // src/background.ts
  browser.runtime.onInstalled.addListener(() => {
    console.info("[page-to-paper] background installed");
  });
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isNativeRequest(message)) return;
    console.info("[page-to-paper] background received nativeRequest");
    void callNative(
      message.payload,
      (application, body, callback) => browser.runtime.sendNativeMessage(application, body, callback)
    ).then(
      (value) => {
        console.info("[page-to-paper] background \u2192 popup ok");
        sendResponse({ ok: true, value });
      },
      (error) => {
        const text = error instanceof Error ? error.message : "The Page to Paper app did not answer.";
        console.warn(`[page-to-paper] background \u2192 popup error ${text}`);
        sendResponse({ ok: false, message: text });
      }
    );
    return true;
  });
  function isNativeRequest(message) {
    return typeof message === "object" && message !== null && !Array.isArray(message) && message.type === "nativeRequest" && "payload" in message;
  }
})();
