// Unit tests for the `authenticate` middleware — verifies that protected
// requests are gated on a valid access token and that the resulting
// req.user / req.tenantId are populated from the JWT claims.

import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { authenticate } from "../authenticate";
import { signAccessToken, type TokenPayload } from "../../shared/utils/jwt";
import { config } from "../../config";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { Role } from "../../generated/prisma/enums";

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    ip: "127.0.0.1",
    originalUrl: "/api/v1/protected",
  } as unknown as Request;
}

function makeNext(): NextFunction & { calls: unknown[][] } {
  const fn = vi.fn() as unknown as NextFunction & { calls: unknown[][] };
  return fn;
}

const basePayload: TokenPayload = {
  sub: "user-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  storeIds: ["store-1"],
  role: Role.ADMIN,
  email: "user@example.com",
  firstName: "User",
  lastName: "One",
};

describe("authenticate middleware", () => {
  it("rejects requests with no Authorization header", () => {
    const req = makeReq();
    const next = makeNext();

    authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(req.user).toBeUndefined();
    expect(req.tenantId).toBeUndefined();
  });

  it("rejects malformed Authorization headers (no Bearer prefix)", () => {
    const req = makeReq("Token abc.def.ghi");
    const next = makeNext();

    authenticate(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("rejects invalid (unsigned/garbage) tokens", () => {
    const req = makeReq("Bearer not.a.real.jwt");
    const next = makeNext();

    authenticate(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("rejects tokens signed with the wrong secret", () => {
    const forged = jwt.sign(basePayload, "the-wrong-secret-which-is-32-chars-or-more", {
      expiresIn: "15m",
    });
    const req = makeReq(`Bearer ${forged}`);
    const next = makeNext();

    authenticate(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("rejects expired tokens", () => {
    // Sign directly with a negative expiry so the JWT is already expired.
    const expired = jwt.sign(basePayload, config.JWT_ACCESS_SECRET, {
      expiresIn: "-1s",
    });
    const req = makeReq(`Bearer ${expired}`);
    const next = makeNext();

    authenticate(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
  });

  it("never leaks the raw jsonwebtoken error message to clients", () => {
    const req = makeReq("Bearer garbage");
    const next = makeNext();

    authenticate(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0][0] as AuthenticationError;
    // The middleware deliberately collapses every JWT failure to a
    // single safe message — no `jwt malformed`, `invalid signature`, etc.
    expect(err.message).toBe("Invalid or expired token");
  });

  it("populates req.user and req.tenantId on a valid token", () => {
    const token = signAccessToken(basePayload);
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({
      id: basePayload.sub,
      tenantId: basePayload.tenantId,
      storeId: basePayload.storeId,
      storeIds: basePayload.storeIds,
      role: basePayload.role,
      email: basePayload.email,
      firstName: basePayload.firstName,
      lastName: basePayload.lastName,
    });
    expect(req.tenantId).toBe(basePayload.tenantId);
  });

  it("defaults storeIds to [] when the claim is absent", () => {
    // Build a payload that omits storeIds entirely, simulating a legacy
    // token issued before the multi-store claim was added.
    const legacy = { ...basePayload } as Partial<TokenPayload>;
    delete legacy.storeIds;
    const token = jwt.sign(legacy, config.JWT_ACCESS_SECRET, {
      expiresIn: "15m",
    });
    const req = makeReq(`Bearer ${token}`);
    const next = makeNext();

    authenticate(req, {} as Response, next);

    expect(req.user?.storeIds).toEqual([]);
  });
});
