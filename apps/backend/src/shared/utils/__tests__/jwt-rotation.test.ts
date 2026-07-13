import { describe, it, expect, beforeAll } from "vitest";
import jwtLib from "jsonwebtoken";

// Override the JWT secrets BEFORE importing config (imported transitively by ../jwt).
// Vitest isolates modules per file, so this file gets a fresh config parsed with these.
// The dynamic import is deferred to beforeAll (rather than a literal top-level
// `await import`) because this project's tsconfig has "module": "commonjs", under
// which `tsc --noEmit` rejects true top-level await; putting the await inside a
// function callback keeps identical runtime semantics while typechecking cleanly.
const CUR = "jwt-access-current-".padEnd(40, "a");
const PREV = "jwt-access-previous-".padEnd(40, "b");

let verifyAccessToken: typeof import("../jwt").verifyAccessToken;

beforeAll(async () => {
  process.env.JWT_ACCESS_SECRET = CUR;
  process.env.JWT_ACCESS_SECRET_PREVIOUS = PREV;
  ({ verifyAccessToken } = await import("../jwt"));
});

const payload = {
  sub: "u1", tenantId: "t", storeId: null, storeIds: [],
  role: "ADMIN", email: "e@x.co", firstName: "F", lastName: "L",
};

describe("verifyAccessToken rotation", () => {
  it("accepts a token signed with the current secret", () => {
    expect(verifyAccessToken(jwtLib.sign(payload, CUR)).sub).toBe("u1");
  });
  it("accepts a token signed with the previous secret (rotation)", () => {
    expect(verifyAccessToken(jwtLib.sign(payload, PREV)).sub).toBe("u1");
  });
  it("rejects a token signed with an unknown secret", () => {
    expect(() => verifyAccessToken(jwtLib.sign(payload, "other-".padEnd(40, "z")))).toThrow();
  });
});
