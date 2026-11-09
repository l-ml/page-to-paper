import { findForbiddenSecretKey } from "./messaging";

// Manifest V3 service worker. Safari does not keep it alive.
// Preferences live in the App Group. Secrets live in the Keychain. Neither is stored here.
browser.runtime.onInstalled.addListener(() => {
  // Nothing to migrate. Pairing is not implemented.
});

browser.runtime.onMessage.addListener((message) => {
  if (findForbiddenSecretKey(message)) {
    console.warn("Ignoring a message that carries secrets.");
  }
});
