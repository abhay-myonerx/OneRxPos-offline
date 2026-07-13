import { Request, Response, NextFunction } from "express";
import { logger } from "../shared/utils/logger";

/**
 * Structured request/response logger.
 * Logs at request START (debug) and on response FINISH (info/warn/error).
 * Measures response time in milliseconds.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startAt = process.hrtime.bigint();

  // Log incoming request at debug level — avoids log spam in production
  logger.debug(
    {
      method: req.method,
      url: req.originalUrl,
      tenantId: req.tenantId,
      userId: req.user?.id,
    },
    "→ request",
  );

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startAt) / 1_000_000;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[level](
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        tenantId: req.tenantId,
        userId: req.user?.id,
      },
      "← response",
    );
  });

  next();
}
