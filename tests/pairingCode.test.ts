import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidPairingCode, normalizePairingCode } from "../src/pairingCode";

describe("normalizePairingCode", () => {
  it("trims, lowercases, and strips spaces and hyphens", () => {
    expect(normalizePairingCode("  AB-CD 12EF  ")).toBe("abcd12ef");
    expect(normalizePairingCode("ab\ncd-12 ef")).toBe("abcd12ef");
  });
});

describe("isValidPairingCode", () => {
  it("accepts exactly 8 letters or digits after normalization", () => {
    expect(isValidPairingCode("abcd1234")).toBe(true);
    expect(isValidPairingCode("AB-CD 12EF")).toBe(true);
    expect(isValidPairingCode("abcd123")).toBe(false);
    expect(isValidPairingCode("abcd12345")).toBe(false);
    expect(isValidPairingCode("abcd123!")).toBe(false);
    expect(isValidPairingCode("")).toBe(false);
  });
});

describe("Swift mirror", () => {
  it("keeps the same pattern in PairingCode.swift", () => {
    const swift = fs.readFileSync("PageToPaper/Shared/PairingCode.swift", "utf8");
    expect(swift).toContain('static let pattern = "^[a-z0-9]{8}$"');
    expect(swift).toContain("trimmingCharacters");
    expect(swift).toContain("lowercased()");
    expect(swift).toContain('character != "-"');
  });
});
