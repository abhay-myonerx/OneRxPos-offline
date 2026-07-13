import { describe, it, expect } from "vitest";
import { freshnessFromLastSync } from "../freshness";

describe("freshnessFromLastSync", () => {
  const H = 60 * 60 * 1000; // milliseconds per hour
  const now = 1_000_000_000_000;

  it("returns 'green' when sync happened just now (0h)", () => {
    expect(freshnessFromLastSync(now, now)).toBe("green");
  });

  it("returns 'green' when sync happened 23h ago", () => {
    expect(freshnessFromLastSync(now - 23 * H, now)).toBe("green");
  });

  it("returns 'yellow' when sync happened 25h ago", () => {
    expect(freshnessFromLastSync(now - 25 * H, now)).toBe("yellow");
  });

  it("returns 'yellow' when sync happened 71h ago", () => {
    expect(freshnessFromLastSync(now - 71 * H, now)).toBe("yellow");
  });

  it("returns 'red' when sync happened 73h ago", () => {
    expect(freshnessFromLastSync(now - 73 * H, now)).toBe("red");
  });

  it("returns 'red' when lastSyncAt is null", () => {
    expect(freshnessFromLastSync(null, now)).toBe("red");
  });
});
