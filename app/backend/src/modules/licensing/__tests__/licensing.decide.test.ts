import { describe, it, expect } from "vitest";
import { decideActivation } from "../licensing.decide";

const F = "fp-A";
const active = (fp: string) => ({ deviceFingerprint: fp, revokedAt: null });

describe("decideActivation", () => {
  it("rejects when the license is not active", () => {
    expect(decideActivation({ licenseStatus: "suspended", seatCap: 5, fingerprint: F, activations: [] }).action)
      .toBe("reject-status");
  });
  it("reuses when this device already activated (idempotent)", () => {
    expect(decideActivation({ licenseStatus: "active", seatCap: 1, fingerprint: F, activations: [active(F)] }).action)
      .toBe("reuse");
  });
  it("creates when under the seat cap", () => {
    expect(decideActivation({ licenseStatus: "active", seatCap: 2, fingerprint: F, activations: [active("other")] }).action)
      .toBe("create");
  });
  it("rejects a new device once the seat cap is reached", () => {
    expect(decideActivation({ licenseStatus: "active", seatCap: 1, fingerprint: F, activations: [active("other")] }).action)
      .toBe("reject-cap");
  });
  it("ignores revoked activations when counting seats", () => {
    const acts = [{ deviceFingerprint: "other", revokedAt: 123 }];
    expect(decideActivation({ licenseStatus: "active", seatCap: 1, fingerprint: F, activations: acts }).action)
      .toBe("create");
  });
});
