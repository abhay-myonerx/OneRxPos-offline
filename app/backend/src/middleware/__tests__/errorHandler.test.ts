// Regression coverage for the global error-handler middleware. Added
// alongside the API_CONTRACT_AUDIT pass (2026-05-23) to lock in the
// documented error dictionary in `docs/v2/6.RX-POS-v2-API-Reference.md`
// §0 (VALIDATION_ERROR / AUTHENTICATION_FAILED / AUTHORIZATION_FAILED
// / NOT_FOUND / CONFLICT / INSUFFICIENT_STOCK / RATE_LIMITED /
// MODULE_DISABLED / MAINTENANCE_MODE / INTERNAL_ERROR).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { errorHandler } from "../errorHandler";
import { AppError } from "../../shared/errors/AppError";
import { Prisma } from "../../generated/prisma/client";

function mockRes() {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnThis();
  return {
    res: { status, json } as unknown as Response,
    status,
    json,
  };
}

const baseReq = {
  method: "GET",
  originalUrl: "/api/x",
} as unknown as Request;

const noopNext: NextFunction = vi.fn();

describe("errorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders AppError with its declared statusCode + code + message", () => {
    const { res, status, json } = mockRes();
    const err = new AppError(404, "NOT_FOUND", "Customer not found");

    errorHandler(err, baseReq, res, noopNext);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "Customer not found" },
    });
  });

  it("maps Prisma P2002 (unique violation) to 409 CONFLICT — documented code", () => {
    // Regression for API_CONTRACT_AUDIT.md §5 (ACI-002): the handler
    // previously emitted `DUPLICATE_ENTRY`, which is not in the
    // documented error dictionary. CONFLICT is the canonical code.
    const { res, status, json } = mockRes();
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["email"] },
    });

    errorHandler(err, baseReq, res, noopNext);

    expect(status).toHaveBeenCalledWith(409);
    const body = json.mock.calls[0]![0] as {
      success: boolean;
      error: { code: string; message: string };
    };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("email");
  });

  it("maps Prisma P2025 (record not found) to 404 NOT_FOUND", () => {
    const { res, status, json } = mockRes();
    const err = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    });

    errorHandler(err, baseReq, res, noopNext);

    expect(status).toHaveBeenCalledWith(404);
    const body = json.mock.calls[0]![0] as {
      success: boolean;
      error: { code: string };
    };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
