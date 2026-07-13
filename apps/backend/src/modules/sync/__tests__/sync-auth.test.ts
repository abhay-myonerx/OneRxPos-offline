// Unit tests for the `syncAuth` middleware — verifies that store-node sync
// requests are gated on a valid bearer JWT minted by `mintSyncToken`, and
// that the resulting `req.syncContext` is populated from the token claims.
// Mirrors `src/middleware/__tests__/authenticate.test.ts` in shape.

import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { syncAuth } from "../sync-auth.middleware";
import { mintSyncToken } from "../sync-token";
import { config } from "../../../config";
import { AuthenticationError } from "../../../shared/errors";

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    ip: "127.0.0.1",
    originalUrl: "/api/v2/sync/push",
  } as unknown as Request;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

const basePayload = {
  tenantId: "tenant-1",
  storeId: "store-1",
  deviceId: "device-1",
};

describe("syncAuth middleware", () => {
  it("populates req.syncContext on a valid store-node token", () => {
    const token = mintSyncToken(basePayload);
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    syncAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.syncContext).toEqual(basePayload);
  });

  it("rejects requests with no Authorization header", () => {
    const req = makeReq();
    const next = makeNext();

    syncAuth(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(req.syncContext).toBeUndefined();
  });

  it("rejects expired tokens", () => {
    const expired = jwt.sign({ ...basePayload, typ: "store-node" }, config.SYNC_TOKEN_SECRET, {
      expiresIn: "-1s",
    });
    const req = makeReq(`Bearer ${expired}`);
    const next = makeNext();

    syncAuth(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("rejects tokens signed with the wrong secret", () => {
    const forged = jwt.sign(
      { ...basePayload, typ: "store-node" },
      "the-wrong-secret-which-is-not-the-sync-secret",
      { expiresIn: "30d" },
    );
    const req = makeReq(`Bearer ${forged}`);
    const next = makeNext();

    syncAuth(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("rejects tokens with the wrong typ claim", () => {
    const wrongTyp = jwt.sign({ ...basePayload, typ: "user" }, config.SYNC_TOKEN_SECRET, {
      expiresIn: "30d",
    });
    const req = makeReq(`Bearer ${wrongTyp}`);
    const next = makeNext();

    syncAuth(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(req.syncContext).toBeUndefined();
  });
});
