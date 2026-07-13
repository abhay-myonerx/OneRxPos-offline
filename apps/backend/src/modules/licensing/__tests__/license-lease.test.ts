import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { mintLicenseLease, verifyLicenseLease, type LeaseClaims } from "../license-lease";
import { config } from "@/config";

const claims: LeaseClaims = {
  licenseId: "lic-1", tenantId: "t-1", deviceFingerprint: "f".repeat(64), plan: "standard", seat: 1,
};

describe("license lease", () => {
  it("round-trips claims", () => {
    const c = verifyLicenseLease(mintLicenseLease(claims));
    expect(c).toMatchObject(claims);
  });
  it("rejects a token signed with the wrong secret", () => {
    const forged = jwt.sign({ ...claims, typ: "license-lease" }, "wrong-secret-".padEnd(32, "z"));
    expect(() => verifyLicenseLease(forged)).toThrow();
  });
  it("rejects a token with the wrong typ", () => {
    const wrong = jwt.sign({ ...claims, typ: "store-node" }, config.LICENSE_TOKEN_SECRET);
    expect(() => verifyLicenseLease(wrong)).toThrow();
  });
});
