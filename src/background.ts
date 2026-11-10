import { callNative } from "./nativeCall";

// Manifest V3 service worker. Native messaging runs here so a stuck
// sendNativeMessage cannot freeze the popup's timeout.
browser.runtime.onInstalled.addListener(() => {
  console.info("[page-to-paper] background installed");
});

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isNativeRequest(message)) return;
  console.info("[page-to-paper] background received nativeRequest");
  void callNative(message.payload, (application, body, callback) =>
    browser.runtime.sendNativeMessage(application, body, callback),
  ).then(
    (value) => {
      console.info("[page-to-paper] background → popup ok");
      sendResponse({ ok: true, value });
    },
    (error: unknown) => {
      const text = error instanceof Error ? error.message : "The Page to Paper app did not answer.";
      console.warn(`[page-to-paper] background → popup error ${text}`);
      sendResponse({ ok: false, message: text });
    },
  );
  return true;
});

function isNativeRequest(message: unknown): message is { type: "nativeRequest"; payload: unknown } {
  return (
    typeof message === "object" &&
    message !== null &&
    !Array.isArray(message) &&
    (message as { type?: unknown }).type === "nativeRequest" &&
    "payload" in message
  );
}
