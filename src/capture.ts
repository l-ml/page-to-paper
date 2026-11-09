import { sendToContainingApp, buildUploadRequest, parseArticleDraft, parsePairingStatus, parseUploadResult, type ArticleDraft, type UploadResult } from "./messaging";

export interface ReadDependencies {
  queryActiveTab: () => Promise<{ id?: number } | undefined>;
  extract: (tabId: number) => Promise<unknown>;
}

export async function readActivePage(deps: ReadDependencies): Promise<{ ok: true; draft: ArticleDraft } | { ok: false }> {
  const tab = await deps.queryActiveTab();
  if (tab?.id === undefined) return { ok: false };
  try {
    return { ok: true, draft: parseArticleDraft(await deps.extract(tab.id)) };
  } catch {
    return { ok: false };
  }
}

export async function queryPaired(sendNative: (application: string, body: unknown) => Promise<unknown>): Promise<boolean> {
  try {
    const raw = await sendToContainingApp({ type: "pairingStatus" }, sendNative);
    return parsePairingStatus(raw).paired;
  } catch {
    return false;
  }
}

export async function uploadDraft(
  draft: ArticleDraft,
  sendNative: (application: string, body: unknown) => Promise<unknown>,
): Promise<UploadResult> {
  try {
    const raw = await sendToContainingApp(buildUploadRequest(draft), sendNative);
    return parseUploadResult(raw);
  } catch {
    return { ok: false, message: "The Page to Paper app did not answer." };
  }
}
