export const limits = {
  title: 300,
  byline: 200,
  html: 500_000,
  url: 2_000,
  resultMessage: 500,
  documentId: 200,
} as const;

// Keep in sync with IdempotencyKey.minimumCount and maximumCount.
export const idempotencyKeyMin = 8;
export const idempotencyKeyMax = 80;

export const messageTypes = {
  extractArticle: "extractArticle",
  articleDraft: "articleDraft",
  uploadArticle: "uploadArticle",
  pairingStatus: "pairingStatus",
  clearPairing: "clearPairing",
} as const;

/**
 * Matched against a key after NFKC, trim, lowercase, and stripping non-alphanumerics.
 * Any key that is not ASCII is rejected. An ASCII key is rejected when its
 * normalized form contains one of these. `token` also covers deviceToken and refreshToken.
 * Keep in sync with MessageSecrets.
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
  if (/[^\u0000-\u007f]/.test(key)) return true;
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
  idempotencyKey: string;
  draft: ArticleDraft;
}

/** Kinds the app may set on a failed upload. The popup must not invent the token-clearing ones from message text. */
export const uploadErrorKinds = [
  "network",
  "timeout",
  "notPaired",
  "authExpired",
  "rateLimit",
  "unsupportedPage",
  "appUnreachable",
  "unknown",
  "pageUnread",
] as const;

export type UploadErrorKind = (typeof uploadErrorKinds)[number];

export interface UploadResult {
  ok: boolean;
  message: string;
  documentId?: string;
  /** True only when a real upload happened. A mock result sets this false. */
  implemented?: boolean;
  /** True when the app used the mock transport. Sent is not shown for that result. */
  mock?: boolean;
  /** Set by the app. Absent results fall back to a message heuristic that cannot clear pairing. */
  errorKind?: UploadErrorKind;
}

export type MessageShapeCode =
  | "urlTooLong"
  | "urlScheme"
  | "urlCredentials"
  | "urlInvalid"
  | "titleTooLong"
  | "bylineTooLong"
  | "htmlTooLong";

export class MessageShapeError extends Error {
  readonly code?: MessageShapeCode;

  constructor(message: string, code?: MessageShapeCode) {
    super(message);
    this.name = "MessageShapeError";
    this.code = code;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
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

function optionalText(value: unknown, max: number, label: string, code?: MessageShapeCode): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new MessageShapeError(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new MessageShapeError(`${label} is too long.`, code);
  }
  return trimmed;
}

export function isExtractRequest(value: unknown): boolean {
  if (!isRecord(value) || findForbiddenSecretKey(value)) return false;
  return value.type === messageTypes.extractArticle && Object.keys(value).length === 1;
}

/** WHATWG leaves these raw in the path and query. URL(string:) on iOS 15 and 16 rejects them. Host brackets stay, so IPv6 literals keep working. */
const bridgeReserved = /[[\]{}|^]/g;

function encodeBridgeReserved(value: string): string {
  return value.replace(bridgeReserved, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function bridgeURLString(url: URL): string {
  return `${url.origin}${encodeBridgeReserved(`${url.pathname}${url.search}${url.hash}`)}`;
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
    throw new MessageShapeError("Article title is too long.", "titleTooLong");
  }
  if (typeof value.url !== "string" || !value.url.trim()) {
    throw new MessageShapeError("Article URL is missing.");
  }
  const rawURL = value.url.trim();
  let url: URL;
  try {
    url = new URL(rawURL);
  } catch {
    throw new MessageShapeError("Article URL is invalid.", "urlInvalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MessageShapeError("Article URL must be http or https.", "urlScheme");
  }
  if (url.username || url.password) {
    throw new MessageShapeError("Article URL must not include credentials.", "urlCredentials");
  }
  if (!url.hostname) {
    throw new MessageShapeError("Article URL is invalid.", "urlInvalid");
  }
  const bridgedURL = bridgeURLString(url);
  if (bridgedURL.length > limits.url) {
    throw new MessageShapeError("Article URL is too long.", "urlTooLong");
  }
  const draft: ArticleDraft = { title, url: bridgedURL };
  const html = optionalText(value.html, limits.html, "Article HTML", "htmlTooLong");
  const byline = optionalText(value.byline, limits.byline, "Byline", "bylineTooLong");
  if (html) draft.html = html;
  if (byline) draft.byline = byline;
  return draft;
}

/** Letters, digits, and hyphens only. Same rule as IdempotencyKey.parse. */
export function isIdempotencyKey(value: string): boolean {
  if (value.length < idempotencyKeyMin || value.length > idempotencyKeyMax) return false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    const digit = code >= 48 && code <= 57;
    const upper = code >= 65 && code <= 90;
    const lower = code >= 97 && code <= 122;
    if (!digit && !upper && !lower && code !== 45) return false;
  }
  return true;
}

export function newIdempotencyKey(): string {
  const generated = readRandomUUID();
  if (generated && isIdempotencyKey(generated)) return generated;
  return fallbackIdempotencyKey();
}

function readRandomUUID(): string | undefined {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") return undefined;
  try {
    return randomUUID.call(globalThis.crypto);
  } catch {
    return undefined;
  }
}

function fallbackIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  const random = globalThis.crypto?.getRandomValues;
  if (typeof random === "function") {
    random.call(globalThis.crypto, bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildUploadRequest(draft: ArticleDraft, idempotencyKey: string): UploadRequest {
  const parsed = parseArticleDraft(draft);
  if (!isIdempotencyKey(idempotencyKey)) {
    throw new MessageShapeError("Idempotency key is invalid.");
  }
  const request: UploadRequest = {
    type: messageTypes.uploadArticle,
    idempotencyKey,
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
  if (typeof value.mock === "boolean") result.mock = value.mock;
  if (typeof value.errorKind === "string" && (uploadErrorKinds as readonly string[]).includes(value.errorKind)) {
    result.errorKind = value.errorKind as UploadErrorKind;
  }
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
