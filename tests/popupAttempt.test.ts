import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isCurrentAttempt, nextAttempt } from "../src/popupAttempt";

describe("send attempt", () => {
  it("ignores a result after a newer send or read has started", () => {
    let attempt = 0;
    const first = nextAttempt(attempt);
    attempt = first;
    const retry = nextAttempt(attempt);
    attempt = retry;
    expect(isCurrentAttempt(first, attempt)).toBe(false);
    expect(isCurrentAttempt(retry, attempt)).toBe(true);
    expect(readFileSync("src/popup.ts", "utf8")).toContain("isCurrentAttempt(started, attempt)");
  });
});
