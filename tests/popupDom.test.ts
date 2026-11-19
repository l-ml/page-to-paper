/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPopup } from "../src/popupRender";
import { createPopupSession } from "../src/popupSession";
import {
  errorKinds,
  initialPopup,
  mockSuccessDetail,
  nativeCallTimeoutMs,
  previewFromDraft,
  reducePopup,
  uploadRoundTripMs,
  type ErrorKind,
  type PagePreview,
  type PopupPhase,
} from "../src/popupState";

const page: PagePreview = previewFromDraft({
  title: "Dispatch",
  url: "https://news.example/dispatch",
  byline: "Sam",
});

const html = readFileSync("PageToPaper/Extension/Resources/popup.html", "utf8");
const css = readFileSync("PageToPaper/Extension/Resources/popup.css", "utf8");

function mount(): void {
  const page = html
    .replace(/<link rel="stylesheet"[^>]*>/, "")
    .replace(/<script src="popup\.js"><\/script>/, "");
  document.open();
  document.write(page);
  document.close();
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
}

function spinner(): HTMLElement {
  const node = document.querySelector("#spinner");
  if (!(node instanceof HTMLElement)) throw new Error("missing spinner");
  return node;
}

function primary(): HTMLButtonElement {
  const node = document.querySelector("#primary");
  if (!(node instanceof HTMLButtonElement)) throw new Error("missing primary");
  return node;
}

/** Painted display from popup.css. The hidden attribute is not consulted. */
function spinnerVisible(): boolean {
  return getComputedStyle(spinner()).display !== "none";
}

function errorPhase(kind: ErrorKind): PopupPhase {
  return { name: "error", kind, page, busy: false };
}

beforeEach(() => {
  mount();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("popup spinner", () => {
  const terminals: Array<[string, PopupPhase]> = [
    ["idle", initialPopup()],
    ["paired confirm", { name: "ready", page, paired: true, offline: false, busy: false }],
    ["pairing-required", { name: "ready", page, paired: false, offline: false, busy: false }],
    ["success", { name: "success", page, busy: false }],
    ["mock success", { name: "mockSuccess", page, busy: false }],
    ["stub", { name: "unavailable", page, busy: false }],
    ...errorKinds.map((kind): [string, PopupPhase] => [kind, errorPhase(kind)]),
  ];

  it.each(terminals)("hides the spinner in %s", (_label, phase) => {
    renderPopup(document, phase);
    expect(phase.busy).toBe(false);
    expect(primary().getAttribute("aria-busy")).toBe("false");
    expect(spinnerVisible()).toBe(false);
  });

  it("keeps the pairing-required spinner hidden even if the hidden attribute is ignored", () => {
    const phase = reducePopup(reducePopup(initialPopup(), { type: "open" }), {
      type: "pageLoaded",
      page,
      paired: false,
      offline: false,
    });
    renderPopup(document, phase);
    expect(document.querySelector("#primary-label")?.textContent).toBe("Pair device");
    expect(document.querySelector("#footnote")?.textContent).toContain("Pair your reMarkable");
    spinner().hidden = false;
    expect(primary().getAttribute("aria-busy")).toBe("false");
    expect(getComputedStyle(spinner()).display).toBe("none");
    expect(spinnerVisible()).toBe(false);
  });

  it("renders an error instead of a spinner when injection is not allowed", () => {
    const phase = reducePopup({ name: "reading", busy: true }, { type: "pageUnread" });
    renderPopup(document, phase);
    expect(phase).toMatchObject({ name: "error", kind: "pageUnread", busy: false });
    expect(document.querySelector("#status")?.textContent).toBe("Could not read this page");
    expect(primary().getAttribute("aria-busy")).toBe("false");
    expect(spinnerVisible()).toBe(false);
  });

  it("shows the spinner only while sending", () => {
    const sending = reducePopup(
      { name: "ready", page, paired: true, offline: false, busy: false },
      { type: "send" },
    );
    renderPopup(document, sending);
    expect(primary().getAttribute("aria-busy")).toBe("true");
    expect(spinnerVisible()).toBe(true);
    renderPopup(document, { name: "unavailable", page, busy: false });
    expect(spinnerVisible()).toBe(false);
  });

  it("paints mock success in a different state from a real send", () => {
    renderPopup(document, { name: "mockSuccess", page, busy: false });
    const status = document.querySelector("#status");
    expect(status?.textContent).toBe("Test mode");
    expect(document.querySelector("#detail")?.textContent).toBe(mockSuccessDetail);
    expect(status?.getAttribute("data-state")).toBe("");
    expect(document.querySelector("#primary-label")?.textContent).toBe("Done");
    renderPopup(document, { name: "success", page, busy: false });
    expect(document.querySelector("#status")?.textContent).toBe("Sent");
    expect(document.querySelector("#status")?.getAttribute("data-state")).toBe("ok");
    expect(document.querySelector("#detail")?.textContent).toBe("Saved to Inbox as EPUB.");
  });
});

describe("busy watchdog", () => {
  it("forces an error and hides the spinner when busy is still true after the timeout", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const session = createPopupSession({
      render: (phase) => renderPopup(document, phase),
      log: (line) => lines.push(line),
    });
    session.commit({ type: "open" });
    expect(session.phase()).toEqual({ name: "reading", busy: true });
    expect(lines.at(-1)).toBe("[page-to-paper] popup idle -> reading busy=true");

    vi.advanceTimersByTime(nativeCallTimeoutMs - 1);
    expect(session.phase().busy).toBe(true);

    vi.advanceTimersByTime(1);
    expect(session.phase()).toMatchObject({ name: "error", kind: "appUnreachable", busy: false });
    expect(session.phase().busy).toBe(false);
    expect(spinnerVisible()).toBe(false);
    expect(lines.some((line) => line.startsWith("[page-to-paper] popup watchdog timeout"))).toBe(true);
    expect(lines.at(-1)).toBe("[page-to-paper] popup reading -> error busy=false");
  });

  it("does not abandon a send at the shorter read timeout", () => {
    vi.useFakeTimers();
    const session = createPopupSession({
      render: (phase) => renderPopup(document, phase),
      log: () => {},
    });
    session.commit({ type: "open" });
    session.commit({ type: "pageLoaded", page, paired: true, offline: false });
    session.commit({ type: "send" });
    vi.advanceTimersByTime(nativeCallTimeoutMs);
    expect(session.phase().name).toBe("sending");
    vi.advanceTimersByTime(uploadRoundTripMs - nativeCallTimeoutMs);
    expect(session.phase()).toMatchObject({ name: "error", kind: "appUnreachable", afterSend: true });
  });

  it("does not leave busy true when pairing-required resolves, and a late reply cannot set it again", () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const session = createPopupSession({
      render: (phase) => renderPopup(document, phase),
      log: (line) => lines.push(line),
    });
    session.commit({ type: "open" });
    session.commit({ type: "pageLoaded", page, paired: false, offline: false });
    expect(session.phase()).toMatchObject({ name: "ready", paired: false, busy: false });
    expect(document.querySelector("#primary-label")?.textContent).toBe("Pair device");
    expect(spinnerVisible()).toBe(false);
    expect(lines.at(-1)).toBe("[page-to-paper] popup reading -> ready busy=false");

    vi.advanceTimersByTime(nativeCallTimeoutMs);
    expect(session.phase().name).toBe("ready");
    expect(session.phase().busy).toBe(false);

    session.commit({ type: "pageLoaded", page, paired: false, offline: false });
    expect(session.phase().busy).toBe(false);
    expect(spinnerVisible()).toBe(false);
  });
});
