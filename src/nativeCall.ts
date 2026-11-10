import { containingAppNativeId, findForbiddenSecretKey, MessageShapeError } from "./messaging";
import { nativeCallTimeoutMs } from "./popupState";

/** Callback form plus an optional promise. Safari invokes the callback; the promise can hang. */
export type NativeMessenger = (
  application: string,
  message: unknown,
  callback: (response: unknown) => void,
) => unknown;

const timeoutMessage = "The Page to Paper app did not answer.";

export function callNative(message: unknown, messenger: NativeMessenger): Promise<unknown> {
  if (findForbiddenSecretKey(message)) {
    return Promise.reject(new MessageShapeError("Messages must not carry secrets."));
  }
  const type = messageType(message);
  console.info(`[page-to-paper] background → native ${type}`);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean, value: unknown) => {
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
          (error: unknown) => {
            console.warn(`[page-to-paper] background native rejected ${type}`);
            finish(false, error);
          },
        );
      }
    } catch (error) {
      console.warn(`[page-to-paper] background native threw ${type}`);
      finish(false, error);
    }
  });
}

export function requestNative(
  message: unknown,
  sendMessage: (body: unknown) => Promise<unknown>,
): Promise<unknown> {
  const type = messageType(message);
  console.info(`[page-to-paper] popup → background ${type}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[page-to-paper] popup timeout ${type}`);
      reject(new Error(timeoutMessage));
    }, nativeCallTimeoutMs);
    sendMessage({ type: "nativeRequest", payload: message }).then(
      (response) => {
        clearTimeout(timer);
        console.info(`[page-to-paper] popup ← background ${type}`);
        if (isRecord(response) && response.ok === true && "value" in response) {
          resolve(response.value);
          return;
        }
        const detail =
          isRecord(response) && typeof response.message === "string"
            ? response.message
            : timeoutMessage;
        reject(new Error(detail));
      },
      (error: unknown) => {
        clearTimeout(timer);
        console.warn(`[page-to-paper] popup background error ${type}`);
        reject(error instanceof Error ? error : new Error(timeoutMessage));
      },
    );
  });
}

function messageType(message: unknown): string {
  if (isRecord(message) && typeof message.type === "string") return message.type;
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPromise(value: unknown): value is Promise<unknown> {
  return isRecord(value) && typeof value.then === "function";
}
