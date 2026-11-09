export const limits = {
  title: 300,
  byline: 200,
  html: 500_000,
  url: 2_000,
  resultMessage: 500,
  documentId: 200,
} as const;

export const messageTypes = {
  extractArticle: "extractArticle",
  articleDraft: "articleDraft",
  uploadArticle: "uploadArticle",
  pairingStatus: "pairingStatus",
  clearPairing: "clearPairing",
} as const;

/**
 * Matched against a key after NFKC, trim, lowercase, and stripping non-alphanumerics.
 * A key is rejected when its normalized form contains one of these.
 * `token` also covers deviceToken and refreshToken. Keep in sync with MessageSecrets.
 */
export const forbiddenSecretKeys = [
  "token",
  "password",
  "secret",
  "apikey",
  "accesstoken",
  "authorization",
  "bearer",
] as const;

export function normalizeSecretKey(key: string): string {
  return key.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSecretKey(key: string): boolean {
  const normalized = normalizeSecretKey(key);
  if (!normalized) return false;
  return forbiddenSecretKeys.some((stem) => normalized.includes(stem));
}

/**
 * Safari delivers this string to the containing app's SafariWebExtensionHandler.
 * It is not a bundle id and it is not a credential.
 */
export const containingAppNativeId = "application";

export interface ArticleDraft {
  title: string;
  url: string;
  html?: string;
  byline?: string;
}

export interface UploadRequest {
  type: typeof messageTypes.uploadArticle;
  draft: ArticleDraft;
}

export interface UploadResult {
  ok: boolean;
  message: string;
  documentId?: string;
  /** True only when a real upload happened. The stub omits this or sets it false. */
  implemented?: boolean;
}

export class MessageShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageShapeError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findForbiddenSecretKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenSecretKey(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key)) return key;
    const found = findForbiddenSecretKey(child);
    if (found) return found;
  }
  return null;
}

function rejectSecrets(value: unknown): void {
  if (findForbiddenSecretKey(value)) {
    throw new MessageShapeError("Messages must not carry secrets.");
  }
}

function optionalText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new MessageShapeError(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new MessageShapeError(`${label} is too long.`);
  }
  return trimmed;
}

export function isExtractRequest(value: unknown): boolean {
  if (!isRecord(value) || findForbiddenSecretKey(value)) return false;
  return value.type === messageTypes.extractArticle && Object.keys(value).length === 1;
}

export function parseArticleDraft(value: unknown): ArticleDraft {
  rejectSecrets(value);
  if (!isRecord(value)) {
    throw new MessageShapeError("Article draft must be an object.");
  }
  if (value.type !== undefined && value.type !== messageTypes.articleDraft) {
    throw new MessageShapeError("Unexpected message type.");
  }
  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new MessageShapeError("Article title is missing.");
  }
  const title = value.title.trim();
  if (title.length > limits.title) {
    throw new MessageShapeError("Article title is too long.");
  }
  if (typeof value.url !== "string" || !value.url.trim()) {
    throw new MessageShapeError("Article URL is missing.");
  }
  const rawURL = value.url.trim();
  if (rawURL.length > limits.url) {
    throw new MessageShapeError("Article URL is too long.");
  }
  let url: URL;
  try {
    url = new URL(rawURL);
  } catch {
    throw new MessageShapeError("Article URL is invalid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MessageShapeError("Article URL must be http or https.");
  }
  if (url.username || url.password) {
    throw new MessageShapeError("Article URL must not include credentials.");
  }
  if (!url.hostname) {
    throw new MessageShapeError("Article URL is invalid.");
  }
  const draft: ArticleDraft = { title, url: url.toString() };
  const html = optionalText(value.html, limits.html, "Article HTML");
  const byline = optionalText(value.byline, limits.byline, "Byline");
  if (html) draft.html = html;
  if (byline) draft.byline = byline;
  return draft;
}

export function buildUploadRequest(draft: ArticleDraft): UploadRequest {
  const parsed = parseArticleDraft(draft);
  const request: UploadRequest = {
    type: messageTypes.uploadArticle,
    draft: { title: parsed.title, url: parsed.url },
  };
  if (parsed.html) request.draft.html = parsed.html;
  if (parsed.byline) request.draft.byline = parsed.byline;
  return request;
}

export function parseUploadResult(value: unknown): UploadResult {
  if (findForbiddenSecretKey(value)) {
    return { ok: false, message: "The app returned a message that carries secrets." };
  }
  if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.message !== "string") {
    return { ok: false, message: "The app returned an unreadable result." };
  }
  const message = value.message.trim();
  if (!message || message.length > limits.resultMessage) {
    return { ok: false, message: "The app returned an unreadable result." };
  }
  const result: UploadResult = { ok: value.ok, message };
  if (typeof value.implemented === "boolean") result.implemented = value.implemented;
  if (value.documentId !== undefined && value.documentId !== null) {
    if (typeof value.documentId !== "string") {
      return { ok: false, message: "The app returned an unreadable result." };
    }
    const documentId = value.documentId.trim();
    if (!documentId || documentId.length > limits.documentId) {
      return { ok: false, message: "The app returned an unreadable result." };
    }
    result.documentId = documentId;
  }
  return result;
}

export function parsePairingStatus(value: unknown): { paired: boolean } {
  if (findForbiddenSecretKey(value)) {
    throw new MessageShapeError("Messages must not carry secrets.");
  }
  if (!isRecord(value) || typeof value.paired !== "boolean") {
    throw new MessageShapeError("Pairing status is unreadable.");
  }
  return { paired: value.paired };
}

export function sendToContainingApp(
  message: unknown,
  sendNativeMessage: (application: string, body: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (findForbiddenSecretKey(message)) {
    return Promise.reject(new MessageShapeError("Messages must not carry secrets."));
  }
  return sendNativeMessage(containingAppNativeId, message);
}
