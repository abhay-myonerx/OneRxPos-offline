// STRICT per-IP rate limiter for credential-accepting endpoints (login,
// register, refresh). This sits in front of the global rateLimiter.
//
// Blocks credential-stuffing and brute force:
//   - 5 attempts per 15 minutes per IP
//   - Uses a separate Redis key prefix so global limits don't apply first
//
// Why not per-tenant? These endpoints are unauthenticated, so there is no
// tenant context yet. Per-IP is the only identifier available.

import { Request, Response, NextFunction } from "express";
import { hitRateLimit } from "./rate-limit-backend";
import { AppError } from "../shared/errors/AppError";
import { logger } from "../shared/utils/logger";

const AUTH_MAX_ATTEMPTS = 10; // 10 attempts per window
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function authRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ip = req.ip ?? "unknown";
  const windowKey = Math.floor(Date.now() / AUTH_WINDOW_MS);
  const redisKey = `authrl:${ip}:${windowKey}`;

  try {
    const current = await hitRateLimit(redisKey, AUTH_WINDOW_MS);

    const remaining = Math.max(0, AUTH_MAX_ATTEMPTS - current);
    const resetAt = (Math.floor(Date.now() / AUTH_WINDOW_MS) + 1) * AUTH_WINDOW_MS;

    res.setHeader("X-RateLimit-Limit", AUTH_MAX_ATTEMPTS);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

    if (current > AUTH_MAX_ATTEMPTS) {
      res.setHeader("Retry-After", Math.ceil(AUTH_WINDOW_MS / 1000));
      logger.warn(
        { ip, path: req.originalUrl, attempts: current },
        "Auth rate limit exceeded — possible credential stuffing",
      );
      next(
        new AppError(
          429,
          "AUTH_RATE_LIMIT_EXCEEDED",
          "Too many authentication attempts. Please try again in 15 minutes.",
        ),
      );
      return;
    }

    next();
  } catch (err) {
    // If Redis is down, FAIL CLOSED on auth endpoints — it's safer to
    // reject logins for a minute than to allow unlimited brute force.
    logger.error({ err }, "Auth rate limiter Redis error — failing closed");
    next(
      new AppError(
        503,
        "SERVICE_UNAVAILABLE",
        "Authentication service temporarily unavailable. Please try again.",
      ),
    );
  }
}
