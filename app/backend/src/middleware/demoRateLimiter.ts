// Stricter rate limiter applied only when DEMO_MODE=true.
// 30 requests per minute per IP — prevents abuse of the shared demo server.
// Applied globally in app.ts BEFORE the regular per-tenant rate limiter.

import { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis";
import { config } from "../config";
import { AppError } from "../shared/errors/AppError";
import { logger } from "../shared/utils/logger";

const DEMO_RL_MAX = 30;
const DEMO_RL_WINDOW_MS = 60_000;

export function demoRateLimiter() {
  if (!config.DEMO_MODE) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.ip ?? "unknown";
    const windowKey = Math.floor(Date.now() / DEMO_RL_WINDOW_MS);
    const redisKey = `drl:${identifier}:${windowKey}`;

    try {
      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.pexpire(redisKey, DEMO_RL_WINDOW_MS);
      }

      const remaining = Math.max(0, DEMO_RL_MAX - current);
      const resetAt = (Math.floor(Date.now() / DEMO_RL_WINDOW_MS) + 1) * DEMO_RL_WINDOW_MS;

      res.setHeader("X-Demo-RateLimit-Limit", DEMO_RL_MAX);
      res.setHeader("X-Demo-RateLimit-Remaining", remaining);
      res.setHeader("X-Demo-RateLimit-Reset", Math.ceil(resetAt / 1000));

      if (current > DEMO_RL_MAX) {
        res.setHeader("Retry-After", Math.ceil(DEMO_RL_WINDOW_MS / 1000));
        logger.warn(
          { identifier, path: req.originalUrl, current, max: DEMO_RL_MAX },
          "Demo rate limit exceeded",
        );
        next(
          new AppError(429, "RATE_LIMIT_EXCEEDED", "Too many requests — demo server limit reached"),
        );
        return;
      }

      next();
    } catch (err) {
      logger.error({ err }, "Demo rate limiter Redis error — failing open");
      next();
    }
  };
}
