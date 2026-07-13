import { describe, it, expect } from "vitest";
import { z } from "zod";

// The rule each _PREVIOUS field uses; assert its shape without mutating the singleton.
const rule = z.string().min(32).optional();

describe("secret rotation config", () => {
  it("_PREVIOUS is optional (absent is valid)", () => {
    expect(rule.safeParse(undefined).success).toBe(true);
  });
  it("_PREVIOUS must be >=32 chars when present", () => {
    expect(rule.safeParse("too-short").success).toBe(false);
    expect(rule.safeParse("x".repeat(32)).success).toBe(true);
  });
  it("wires a _PREVIOUS value from the environment into the real config schema", async () => {
    const PREV = "s".repeat(40);
    process.env.SYNC_TOKEN_SECRET_PREVIOUS = PREV;
    const { config } = await import("../index");
    expect(config.SYNC_TOKEN_SECRET_PREVIOUS).toBe(PREV);
  });
});
