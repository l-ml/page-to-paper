import { captureActiveArticle } from "./capture";
import { sendToContainingApp } from "./messaging";

function element<T extends Element>(selector: string, ctor: new () => T): T {
  const node = document.querySelector(selector);
  if (!(node instanceof ctor)) {
    throw new Error(`Missing ${selector}`);
  }
  return node;
}

function render(result: { ok: boolean; message: string }): void {
  const status = element("#status", HTMLElement);
  const detail = element("#detail", HTMLElement);
  const retry = element("#retry", HTMLButtonElement);
  status.textContent = result.ok ? "Stub accepted" : "Not sent";
  status.dataset.state = result.ok ? "ok" : "bad";
  detail.textContent = result.message;
  retry.hidden = false;
}

async function run(): Promise<void> {
  const status = element("#status", HTMLElement);
  const detail = element("#detail", HTMLElement);
  const retry = element("#retry", HTMLButtonElement);
  retry.hidden = true;
  status.textContent = "Reading this page…";
  status.dataset.state = "";
  detail.textContent = "";

  const result = await captureActiveArticle({
    queryActiveTab: async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      return tabs[0];
    },
    extract: (tabId) => browser.tabs.sendMessage(tabId, { type: "extractArticle" }),
    sendNative: (message) =>
      sendToContainingApp(message, (application, body) =>
        browser.runtime.sendNativeMessage(application, body),
      ),
  });
  render(result);
}

element("#retry", HTMLButtonElement).addEventListener("click", () => {
  void run();
});

void run();
