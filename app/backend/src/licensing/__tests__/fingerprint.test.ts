import { describe, it, expect } from "vitest";
import { resolveFingerprint, type FingerprintSources } from "../fingerprint";

const base: FingerprintSources = { cpu: "Intel-i7", disk: "DISK-123", mac: "AA:BB:CC", board: "BOARD-9" };

describe("resolveFingerprint", () => {
  it("is 64 lowercase hex chars", () => {
    expect(resolveFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("is stable across calls with the same inputs", () => {
    expect(resolveFingerprint(base)).toBe(resolveFingerprint({ ...base }));
  });
  it("differs when any input differs", () => {
    expect(resolveFingerprint(base)).not.toBe(resolveFingerprint({ ...base, disk: "DISK-999" }));
  });
  it("degrades gracefully when a source is missing (no throw)", () => {
    expect(resolveFingerprint({ ...base, board: "" })).toMatch(/^[0-9a-f]{64}$/);
  });
});
