import { Request, Response, NextFunction } from "express";
import { hitRateLimit } from "./rate-limit-backend";
import { config } from "../config";
import { AppError } from "../shared/errors/AppError";
import { logger } from "../shared/utils/logger";

export function rateLimiter(
  max: number = config.RATE_LIMIT_MAX,
  windowMs: number = config.RATE_LIMIT_WINDOW_MS,
  keyPrefix: string = "rl",
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Identify by tenantId (authenticated) or IP (public routes)
    const identifier = req.tenantId ?? req.ip ?? "unknown";
    const windowKey = Math.floor(Date.now() / windowMs);
    const redisKey = `${keyPrefix}:${identifier}:${windowKey}`;

    try {
      const current = await hitRateLimit(redisKey, windowMs);

      const remaining = Math.max(0, max - current);
      const resetAt = (Math.floor(Date.now() / windowMs) + 1) * windowMs;

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

      if (current > max) {
        res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
        logger.warn({ identifier, path: req.originalUrl, current, max }, "Rate limit exceeded");
        next(new AppError(429, "RATE_LIMIT_EXCEEDED", "Too many requests — please slow down"));
        return;
      }

      next();
    } catch (err) {
      logger.error({ err }, "Rate limiter Redis error — failing open");
      next();
    }
  };
}
