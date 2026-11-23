import {
  buildUploadRequest,
  MessageShapeError,
  messageTypes,
  type MessageShapeCode,
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

export type PageRead =
  | { ok: true; draft: ArticleDraft }
  | { ok: false; reason: "unread" | "unsupported" };

export async function readActivePage(deps: ReadDependencies): Promise<PageRead> {
  const tab = await deps.queryActiveTab();
  if (tab?.id === undefined) return { ok: false, reason: "unread" };
  try {
    await deps.inject(tab.id);
    return { ok: true, draft: parseArticleDraft(await deps.extract(tab.id)) };
  } catch (error) {
    if (error instanceof MessageShapeError && isUnsupportedPage(error.code)) {
      return { ok: false, reason: "unsupported" };
    }
    return { ok: false, reason: "unread" };
  }
}

const unsupportedPageCodes: readonly MessageShapeCode[] = [
  "urlTooLong",
  "urlScheme",
  "urlCredentials",
  "urlInvalid",
  "titleTooLong",
  "bylineTooLong",
];

function isUnsupportedPage(code: MessageShapeCode | undefined): boolean {
  return code !== undefined && unsupportedPageCodes.includes(code);
}

export async function queryPaired(dispatch: NativeDispatch): Promise<PairingQuery> {
  try {
    const raw = await dispatch({ type: messageTypes.pairingStatus });
    return { status: "known", paired: parsePairingStatus(raw).paired };
  } catch {
    return { status: "unreachable" };
  }
}

export async function uploadDraft(
  draft: ArticleDraft,
  idempotencyKey: string,
  dispatch: NativeDispatch,
): Promise<UploadResult> {
  try {
    const raw = await dispatch(buildUploadRequest(draft, idempotencyKey));
    return parseUploadResult(raw);
  } catch (error) {
    if (error instanceof MessageShapeError) {
      return { ok: false, message: "The page could not be prepared as an EPUB." };
    }
    return { ok: false, message: "The Page to Paper app did not answer." };
  }
}

export async function clearStoredPairing(dispatch: NativeDispatch): Promise<void> {
  await dispatch({ type: messageTypes.clearPairing });
}
