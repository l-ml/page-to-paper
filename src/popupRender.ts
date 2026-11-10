import { popupCopy, type PopupPhase } from "./popupState";

function element<T extends Element>(doc: Document, selector: string, ctor: new () => T): T {
  const node = doc.querySelector(selector);
  if (!(node instanceof ctor)) {
    throw new Error(`Missing ${selector}`);
  }
  return node;
}

/** Paints the popup from `phase.busy` only. The spinner is not shown for any other reason. */
export function renderPopup(doc: Document, phase: PopupPhase): void {
  const view = popupCopy(phase);
  const preview = element(doc, "#preview", HTMLElement);
  const title = element(doc, "#page-title", HTMLElement);
  const host = element(doc, "#page-host", HTMLElement);
  const meta = element(doc, "#meta", HTMLElement);
  const status = element(doc, "#status", HTMLElement);
  const detail = element(doc, "#detail", HTMLElement);
  const footnote = element(doc, "#footnote", HTMLElement);
  const primary = element(doc, "#primary", HTMLButtonElement);
  const primaryLabel = element(doc, "#primary-label", HTMLElement);
  const spinner = element(doc, "#spinner", HTMLElement);
  const secondary = element(doc, "#secondary", HTMLButtonElement);

  preview.hidden = !view.showPreview;
  title.textContent = view.previewTitle ?? "";
  host.textContent = view.hostname ?? "";
  preview.setAttribute(
    "aria-label",
    view.showPreview
      ? `${view.previewTitle}. ${view.hostname}. Destination Inbox. Format EPUB.`
      : "",
  );
  meta.hidden = !view.showMeta;
  status.hidden = !view.status;
  status.textContent = view.status;
  status.dataset.state =
    phase.name === "success"
      ? "ok"
      : phase.name === "error" || phase.name === "unavailable" || (phase.name === "ready" && phase.offline)
        ? "bad"
        : "";
  detail.hidden = !view.detail;
  detail.textContent = view.detail;
  footnote.hidden = !view.footnote;
  footnote.textContent = view.footnote;
  primary.hidden = !view.primaryLabel;
  primary.disabled = view.primaryDisabled || view.busy;
  primary.setAttribute("aria-busy", view.busy ? "true" : "false");
  primaryLabel.textContent = view.primaryLabel ?? "";
  spinner.hidden = !view.busy;
  secondary.hidden = !view.secondaryLabel;
  secondary.textContent = view.secondaryLabel ?? "";
  status.setAttribute("aria-label", view.announcement);
}
