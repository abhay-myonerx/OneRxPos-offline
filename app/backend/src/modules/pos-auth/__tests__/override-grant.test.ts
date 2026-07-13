import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { mintOverrideGrant, verifyOverrideGrant } from "../override-grant";
import { config } from "@/config";
const claims = { action: "sale:discount:override", authorizerUserId: "u1", contextHash: "abc", jti: "j1" };
describe("override grant", () => {
  it("round-trips claims", () => {
    expect(verifyOverrideGrant(mintOverrideGrant(claims))).toMatchObject(claims);
  });
  it("rejects a wrong-typ token", () => {
    const t = jwt.sign({ ...claims, typ: "store-node" }, config.POS_OVERRIDE_SECRET);
    expect(() => verifyOverrideGrant(t)).toThrow();
  });
  it("rejects a wrong-secret token", () => {
    const t = jwt.sign({ ...claims, typ: "pos-override" }, "other-".padEnd(32, "z"));
    expect(() => verifyOverrideGrant(t)).toThrow();
  });
});
