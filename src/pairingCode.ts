/** Keep in sync with PageToPaper/Shared/PairingCode.swift. Swift tests are not run here. */
export const pairingCodePattern = /^[a-z0-9]{8}$/;

/** Trim, lowercase, then strip spaces and hyphens. */
export function normalizePairingCode(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]/g, "");
}

export function isValidPairingCode(input: string): boolean {
  return pairingCodePattern.test(normalizePairingCode(input));
}
