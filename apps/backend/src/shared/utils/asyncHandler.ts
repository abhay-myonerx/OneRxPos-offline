import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

/**
 * Wraps an async route handler so thrown/rejected errors are forwarded to
 * Express's error pipeline (and ultimately `errorHandler`).
 *
 * Express 5 already forwards rejected promises automatically, but
 * `asyncHandler` removes the need for `try/catch + next(err)` boilerplate
 * in new v2 controllers and keeps behaviour stable if the framework ever
 * changes.
 */
export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    // `Promise.resolve().then(...)` catches both async rejections and
    // synchronous throws inside `fn` and forwards them to `next`.
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
}
