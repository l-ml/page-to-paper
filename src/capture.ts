import {
  buildUploadRequest,
  messageTypes,
  parseArticleDraft,
  parsePairingStatus,
  parseUploadResult,
  type ArticleDraft,
  type UploadResult,
} from "./messaging";

export interface ReadDependencies {
  queryActiveTab: () => Promise<{ id?: number } | undefined>;
  /** Inject the reader into the active tab. Throws when the page refuses injection. */
  inject: (tabId: number) => Promise<void>;
  extract: (tabId: number) => Promise<unknown>;
}

export type PairingQuery = { status: "known"; paired: boolean } | { status: "unreachable" };

export type NativeDispatch = (message: unknown) => Promise<unknown>;

export async function readActivePage(deps: ReadDependencies): Promise<{ ok: true; draft: ArticleDraft } | { ok: false }> {
  const tab = await deps.queryActiveTab();
  if (tab?.id === undefined) return { ok: false };
  try {
    await deps.inject(tab.id);
    return { ok: true, draft: parseArticleDraft(await deps.extract(tab.id)) };
  } catch {
    return { ok: false };
  }
}

export async function queryPaired(dispatch: NativeDispatch): Promise<PairingQuery> {
  try {
    const raw = await dispatch({ type: messageTypes.pairingStatus });
    return { status: "known", paired: parsePairingStatus(raw).paired };
  } catch {
    return { status: "unreachable" };
  }
}

export async function uploadDraft(draft: ArticleDraft, dispatch: NativeDispatch): Promise<UploadResult> {
  try {
    const raw = await dispatch(buildUploadRequest(draft));
    return parseUploadResult(raw);
  } catch {
    return { ok: false, message: "The Page to Paper app did not answer." };
  }
}

export async function clearStoredPairing(dispatch: NativeDispatch): Promise<void> {
  await dispatch({ type: messageTypes.clearPairing });
}
