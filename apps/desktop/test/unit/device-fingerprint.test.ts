// test/unit/device-fingerprint.test.ts
import { expect, it, describe } from "vitest";
import { computeFingerprint } from "../../src/security/device-fingerprint";

describe("device fingerprint", () => {
  it("is 64 hex, stable for equal inputs, differs on change", () => {
    const s = { hostname: "lane-1", mac: "AA:BB", platform: "win32", cpu: "i7" };
    expect(computeFingerprint(s)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeFingerprint(s)).toBe(computeFingerprint({ ...s }));
    expect(computeFingerprint(s)).not.toBe(computeFingerprint({ ...s, hostname: "lane-2" }));
  });
});
