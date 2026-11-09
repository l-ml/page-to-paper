import {
  buildUploadRequest,
  parseArticleDraft,
  parseUploadResult,
  type UploadResult,
} from "./messaging";

export interface CaptureDependencies {
  queryActiveTab: () => Promise<{ id?: number } | undefined>;
  extract: (tabId: number) => Promise<unknown>;
  sendNative: (message: unknown) => Promise<unknown>;
}

const pageUnread =
  "Could not read this page. Allow Page to Paper for the site in Safari, then try again.";

export async function captureActiveArticle(deps: CaptureDependencies): Promise<UploadResult> {
  const tab = await deps.queryActiveTab();
  if (tab?.id === undefined) {
    return { ok: false, message: "No active tab." };
  }

  let raw: unknown;
  try {
    raw = await deps.extract(tab.id);
  } catch {
    return { ok: false, message: pageUnread };
  }

  let request;
  try {
    request = buildUploadRequest(parseArticleDraft(raw));
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : pageUnread;
    return { ok: false, message };
  }

  try {
    return parseUploadResult(await deps.sendNative(request));
  } catch {
    return { ok: false, message: "The Page to Paper app did not answer." };
  }
}
