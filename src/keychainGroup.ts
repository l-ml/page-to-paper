/** Mirrors KeychainSharing.isUsableSharedGroup in AppPreferences.swift. Swift tests are not run here. */
export const sharedKeychainSuffix = "com.example.pagetopaper.shared";

/**
 * A shared group is usable only when the build resolved a real team id and the
 * access group is exactly `TeamID.` + suffix. An empty DEVELOPMENT_TEAM expands
 * to "" or the bare suffix, which is not shared between the app and the extension.
 */
export function isUsableSharedGroup(group: string | null | undefined, developmentTeam: string | null | undefined): boolean {
  const team = (developmentTeam ?? "").trim();
  const raw = (group ?? "").trim();
  if (!team || team.includes("$(")) return false;
  if (!raw || raw.includes("$")) return false;
  if (raw === sharedKeychainSuffix) return false;
  const teamId = team.endsWith(".") ? team.slice(0, -1) : team;
  if (!teamId) return false;
  return raw === `${teamId}.${sharedKeychainSuffix}`;
}

/** Connected is true only when the bytes just written are read back unchanged. */
export function connectedAfterReadBack(written: string, readBack: string | null): boolean {
  return readBack !== null && readBack === written;
}
