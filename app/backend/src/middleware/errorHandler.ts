import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors/AppError";
import { Prisma } from "../generated/prisma/client";
import { logger } from "../shared/utils/logger";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  // Structured error log — includes request context for tracing
  logger.error({
    err,
    method: req.method,
    url: req.originalUrl,
    tenantId: req.tenantId,
    userId: req.user?.id,
  });

  // ── Known application errors ───────────────────────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  // ── Zod validation errors ──────────────────────────────────────────────
  // Controllers that call `schema.parse(req.body)` directly (rather than
  // going through the `validate` middleware) throw a raw ZodError on
  // failure — translate it the same way `validate` does.
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: err.issues.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    });
    return;
  }

  // ── Prisma client errors ───────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": {
        // Unique constraint violation
        // CONFLICT is the documented dictionary code (API Reference §0).
        const fields = (err.meta?.target as string[] | undefined)?.join(", ");
        res.status(409).json({
          success: false,
          error: {
            code: "CONFLICT",
            message: fields ? `A record with this ${fields} already exists` : "Duplicate entry",
          },
        });
        return;
      }
      case "P2025": // Record not found (update/delete on missing row)
        res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Record not found" },
        });
        return;

      case "P2003": // Foreign key constraint failed
        res.status(409).json({
          success: false,
          error: { code: "FOREIGN_KEY_VIOLATION", message: "Referenced record does not exist" },
        });
        return;

      case "P2034": // Transaction conflict / serialization failure
        res.status(409).json({
          success: false,
          error: { code: "TRANSACTION_CONFLICT", message: "Transaction conflict — please retry" },
        });
        return;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_QUERY", message: "Invalid database query" },
    });
    return;
  }

  // ── Unknown errors — never leak internals in production ────────────────
  const isProd = process.env.NODE_ENV === "production";
  const message = isProd ? "An unexpected error occurred" : err.message;

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message,
      ...(!isProd && { stack: err.stack }),
    },
  });
}
