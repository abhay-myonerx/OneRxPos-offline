import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

// Override the sync secrets BEFORE importing sync-auth.middleware (which imports
// config transitively). Vitest isolates modules per file, so this file gets a
// fresh config parsed with these. The dynamic import is deferred to beforeAll
// (rather than a literal top-level `await import`) because this project's tsconfig
// has "module": "commonjs", under which `tsc --noEmit` rejects true top-level await;
// putting the await inside a function callback keeps identical runtime semantics
// while typechecking cleanly.
const CUR = "sync-current-secret-".padEnd(40, "a");
const PREV = "sync-previous-secret-".padEnd(40, "b");

let syncAuth: typeof import("../sync-auth.middleware").syncAuth;

beforeAll(async () => {
  process.env.SYNC_TOKEN_SECRET = CUR;
  process.env.SYNC_TOKEN_SECRET_PREVIOUS = PREV;
  ({ syncAuth } = await import("../sync-auth.middleware"));
});

function run(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` }, ip: "127.0.0.1", originalUrl: "/x" } as unknown as Request;
  let err: unknown;
  const next = (e?: unknown) => { err = e; };
  syncAuth(req, {} as Response, next as never);
  return { req, err };
}

const ctx = { tenantId: "t1", storeId: "s1", deviceId: "d1" };

describe("syncAuth rotation", () => {
  it("accepts a token signed with the previous secret (rotation)", () => {
    const token = jwt.sign({ ...ctx, typ: "store-node" }, PREV);
    const { req, err } = run(token);
    expect(err).toBeUndefined();
    expect((req as unknown as { syncContext: typeof ctx }).syncContext.tenantId).toBe("t1");
  });
  it("still rejects a wrong-typ token after rotation-aware verify", () => {
    const token = jwt.sign({ ...ctx, typ: "license-lease" }, PREV);
    const { err } = run(token);
    expect(err).toBeTruthy();
  });
  it("rejects a token signed with an unknown secret", () => {
    const token = jwt.sign({ ...ctx, typ: "store-node" }, "other-".padEnd(40, "z"));
    const { err } = run(token);
    expect(err).toBeTruthy();
  });
});
