import {
  buildUploadRequest,
  messageTypes,
  parseArticleDraft,
  parsePairingStatus,
  parseUploadResult,
  sendToContainingApp,
  type ArticleDraft,
  type UploadResult,
} from "./messaging";
import { nativeCallTimeoutMs } from "./popupState";

export interface ReadDependencies {
  queryActiveTab: () => Promise<{ id?: number } | undefined>;
  extract: (tabId: number) => Promise<unknown>;
}

export type PairingQuery = { status: "known"; paired: boolean } | { status: "unreachable" };

type NativeSend = (application: string, body: unknown) => Promise<unknown>;

export async function readActivePage(deps: ReadDependencies): Promise<{ ok: true; draft: ArticleDraft } | { ok: false }> {
  const tab = await deps.queryActiveTab();
  if (tab?.id === undefined) return { ok: false };
  try {
    return { ok: true, draft: parseArticleDraft(await deps.extract(tab.id)) };
  } catch {
    return { ok: false };
  }
}

export async function queryPaired(sendNative: NativeSend): Promise<PairingQuery> {
  try {
    const raw = await sendToContainingApp({ type: messageTypes.pairingStatus }, (application, body) =>
      withTimeout(sendNative(application, body)),
    );
    return { status: "known", paired: parsePairingStatus(raw).paired };
  } catch {
    return { status: "unreachable" };
  }
}

export async function uploadDraft(draft: ArticleDraft, sendNative: NativeSend): Promise<UploadResult> {
  try {
    const raw = await sendToContainingApp(buildUploadRequest(draft), (application, body) =>
      withTimeout(sendNative(application, body)),
    );
    return parseUploadResult(raw);
  } catch {
    return { ok: false, message: "The Page to Paper app did not answer." };
  }
}

export async function clearStoredPairing(sendNative: NativeSend): Promise<void> {
  await sendToContainingApp({ type: messageTypes.clearPairing }, (application, body) =>
    withTimeout(sendNative(application, body)),
  );
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("The Page to Paper app did not answer."));
    }, nativeCallTimeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
