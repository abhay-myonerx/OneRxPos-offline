import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

// Override the license secrets BEFORE importing license-lease (which imports config
// transitively). Vitest isolates modules per file, so this file gets a fresh config
// parsed with these. The dynamic import is deferred to beforeAll (rather than a
// literal top-level `await import`) because this project's tsconfig has
// "module": "commonjs", under which `tsc --noEmit` rejects true top-level await;
// putting the await inside a function callback keeps identical runtime semantics
// while typechecking cleanly.
const CUR = "license-current-secret-".padEnd(40, "a");
const PREV = "license-previous-secret-".padEnd(40, "b");

let verifyLicenseLease: typeof import("../license-lease").verifyLicenseLease;

beforeAll(async () => {
  process.env.LICENSE_TOKEN_SECRET = CUR;
  process.env.LICENSE_TOKEN_SECRET_PREVIOUS = PREV;
  ({ verifyLicenseLease } = await import("../license-lease"));
});

const claims = { licenseId: "l", tenantId: "t", deviceFingerprint: "f".repeat(64), plan: "standard", seat: 1 };

describe("verifyLicenseLease rotation", () => {
  it("accepts a lease signed with the previous secret (rotation)", () => {
    const lease = jwt.sign({ ...claims, typ: "license-lease" }, PREV);
    expect(verifyLicenseLease(lease).licenseId).toBe("l");
  });
  it("still enforces typ after rotation-aware verify", () => {
    const wrong = jwt.sign({ ...claims, typ: "store-node" }, PREV);
    expect(() => verifyLicenseLease(wrong)).toThrow();
  });
  it("rejects a lease signed with an unknown secret", () => {
    const bad = jwt.sign({ ...claims, typ: "license-lease" }, "other-".padEnd(40, "z"));
    expect(() => verifyLicenseLease(bad)).toThrow();
  });
});
