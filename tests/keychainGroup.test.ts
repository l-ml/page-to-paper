import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { connectedAfterReadBack, isUsableSharedGroup } from "../src/keychainGroup";

const suffix = "com.example.pagetopaper.shared";

describe("isUsableSharedGroup", () => {
  it("rejects the expanded empty-team placeholder the simulator will still write", () => {
    expect(isUsableSharedGroup(suffix, "")).toBe(false);
    expect(isUsableSharedGroup(suffix, null)).toBe(false);
    expect(isUsableSharedGroup("", "")).toBe(false);
    expect(isUsableSharedGroup("$(AppIdentifierPrefix)" + suffix, "$(DEVELOPMENT_TEAM)")).toBe(false);
    expect(isUsableSharedGroup("." + suffix, "")).toBe(false);
  });

  it("accepts only TeamID plus the shared suffix", () => {
    expect(isUsableSharedGroup(`ABCDE12345.${suffix}`, "ABCDE12345")).toBe(true);
    expect(isUsableSharedGroup(`ABCDE12345.${suffix}`, "OTHERTEAM1")).toBe(false);
  });
});

describe("connectedAfterReadBack", () => {
  it("is connected only when the written bytes come back", () => {
    expect(connectedAfterReadBack("abcd1234", "abcd1234")).toBe(true);
    expect(connectedAfterReadBack("abcd1234", null)).toBe(false);
    expect(connectedAfterReadBack("abcd1234", "other")).toBe(false);
  });

  it("matches the Swift read-back check", () => {
    const swift = fs.readFileSync("PageToPaper/Shared/RemarkableAuth.swift", "utf8");
    expect(swift).toContain("stored == data");
    const rules = fs.readFileSync("PageToPaper/Shared/AppPreferences.swift", "utf8");
    expect(rules).toContain("raw == teamID + \".\" + sharedSuffix");
  });
});
