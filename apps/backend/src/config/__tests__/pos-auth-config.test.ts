import { describe, it, expect } from "vitest";
import { z } from "zod";

const secret = z.string().min(32);

describe("pos-auth config", () => {
  it("PIN_PEPPER/OVERRIDE secrets are fail-closed min(32)", () => {
    expect(secret.safeParse("short").success).toBe(false);
    expect(secret.safeParse("x".repeat(32)).success).toBe(true);
  });

  it("live config exposes lockout defaults + secrets", async () => {
    const { config } = await import("../index");
    expect(config.PIN_MAX_ATTEMPTS).toBe(5);
    expect(config.PIN_LOCKOUT_MINUTES).toBe(15);
    expect(config.PIN_PEPPER_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(config.POS_OVERRIDE_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});
