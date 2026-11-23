import { isRecord } from "./messaging";
import { callNative } from "./nativeCall";
import { nativeTimeoutMs } from "./popupState";

// Manifest V3 service worker. Native messaging runs here so a stuck
// sendNativeMessage cannot freeze the popup's timeout.
browser.runtime.onInstalled.addListener(() => {
  console.info("[page-to-paper] background installed");
});

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isNativeRequest(message)) return;
  console.info("[page-to-paper] background received nativeRequest");
  void callNative(
    message.payload,
    (application, body, callback) => browser.runtime.sendNativeMessage(application, body, callback),
    nativeTimeoutMs(message.payload),
  ).then(
    (value) => {
      // The reply is already in this worker. Delivering it does not need the native process.
      console.info("[page-to-paper] background → popup ok");
      reply(sendResponse, { ok: true, value });
    },
    (error: unknown) => {
      const text = error instanceof Error ? error.message : "The Page to Paper app did not answer.";
      console.warn(`[page-to-paper] background → popup error ${text}`);
      reply(sendResponse, { ok: false, message: text });
    },
  );
  return true;
});

function reply(sendResponse: (response?: unknown) => void, body: unknown): void {
  try {
    sendResponse(body);
  } catch (error) {
    const text = error instanceof Error ? error.message : "unknown";
    console.warn(`[page-to-paper] background → popup reply failed ${text}`);
  }
}

function isNativeRequest(message: unknown): message is { type: "nativeRequest"; payload: unknown } {
  return isRecord(message) && message.type === "nativeRequest" && "payload" in message;
}
