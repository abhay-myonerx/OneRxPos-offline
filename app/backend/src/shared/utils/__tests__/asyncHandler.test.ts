import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { asyncHandler } from "../asyncHandler";

function mockReqRes() {
  const req = {} as Request;
  const res = {} as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe("asyncHandler", () => {
  it("invokes the wrapped handler with req/res/next", async () => {
    const { req, res, next } = mockReqRes();
    const handler = vi.fn(async () => undefined);

    asyncHandler(handler)(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("forwards rejected promises to next()", async () => {
    const { req, res, next } = mockReqRes();
    const err = new Error("boom");
    const handler = async () => {
      throw err;
    };

    asyncHandler(handler)(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(next).toHaveBeenCalledWith(err);
  });

  it("forwards synchronously thrown errors to next()", async () => {
    const { req, res, next } = mockReqRes();
    const err = new Error("sync boom");
    const handler = () => {
      throw err;
    };

    asyncHandler(handler)(req, res, next);
    await new Promise((r) => setImmediate(r));

    expect(next).toHaveBeenCalledWith(err);
  });
});
