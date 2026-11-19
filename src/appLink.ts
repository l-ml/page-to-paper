/**
 * Custom scheme decided for opening the containing app on the Pairing screen.
 * Popup taps assign `window.location.href`. Do not open this with NSExtensionContext.
 */
export const pairingScheme = "pagetopaper";
export const pairingHost = "pair";
export const pairingBaseUrl = "pagetopaper://pair";

export type PairingDeepLinkReason = "expired" | "required" | "unreachable";

const reasons: readonly PairingDeepLinkReason[] = ["expired", "required", "unreachable"];

export function pairingDeepLink(reason?: PairingDeepLinkReason): string {
  if (!reason) return pairingBaseUrl;
  return `${pairingBaseUrl}?reason=${reason}`;
}

export function assignPairingLink(location: { href: string }, reason: PairingDeepLinkReason): void {
  location.href = pairingDeepLink(reason);
}

/** Ignores unknown query params and unknown reason values. Returns null for a different URL. */
export function parsePairingDeepLink(value: string): { reason?: PairingDeepLinkReason } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${pairingScheme}:` || url.hostname !== pairingHost) return null;
  const raw = url.searchParams.get("reason");
  if (raw && (reasons as readonly string[]).includes(raw)) {
    return { reason: raw as PairingDeepLinkReason };
  }
  return {};
}
