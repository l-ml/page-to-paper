import { describe, expect, it } from "vitest";
import { assignPairingLink, pairingDeepLink, parsePairingDeepLink } from "../src/appLink";

describe("pairingDeepLink", () => {
  it("builds pagetopaper://pair and the three reasons", () => {
    expect(pairingDeepLink()).toBe("pagetopaper://pair");
    expect(pairingDeepLink("expired")).toBe("pagetopaper://pair?reason=expired");
    expect(pairingDeepLink("required")).toBe("pagetopaper://pair?reason=required");
    expect(pairingDeepLink("unreachable")).toBe("pagetopaper://pair?reason=unreachable");
  });

  it("assigns the URL on a tap target", () => {
    const location = { href: "about:blank" };
    assignPairingLink(location, "required");
    expect(location.href).toBe("pagetopaper://pair?reason=required");
  });
});

describe("parsePairingDeepLink", () => {
  it("reads a known reason and ignores unknown params and reasons", () => {
    expect(parsePairingDeepLink("pagetopaper://pair")).toEqual({});
    expect(parsePairingDeepLink("pagetopaper://pair?reason=expired&extra=1")).toEqual({ reason: "expired" });
    expect(parsePairingDeepLink("pagetopaper://pair?reason=nope")).toEqual({});
    expect(parsePairingDeepLink("pagetopaper://other")).toBeNull();
    expect(parsePairingDeepLink("https://example.com/pair")).toBeNull();
  });
});
