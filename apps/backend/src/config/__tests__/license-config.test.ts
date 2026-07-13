import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-declare the same rules the config schema uses, so we can assert the
// fail-closed behaviour without mutating the real process.env / singleton.
const secret = z.string().min(32);

describe("LICENSE_TOKEN_SECRET rule", () => {
  it("rejects a short secret (fail-closed, no default)", () => {
    expect(secret.safeParse("too-short").success).toBe(false);
  });
  it("accepts a >=32 char secret", () => {
    expect(secret.safeParse("x".repeat(32)).success).toBe(true);
  });
});

describe("live config exposes license fields", () => {
  it("has parsed license defaults", async () => {
    const { config } = await import("../index");
    expect(config.LICENSE_DEGRADE_DAYS).toBe(7);
    expect(config.LICENSE_LOCKOUT_DAYS).toBe(30);
    expect(config.CLOUD_LICENSE_URL).toContain("/api/v2/license");
    expect(config.LICENSE_TOKEN_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
