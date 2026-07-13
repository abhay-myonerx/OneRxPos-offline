import { ValidationError } from "@/shared/errors";
import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

type RequestSource = "body" | "query" | "params";

/**
 * Zod validation middleware factory.
 * Parses and coerces the request source, replacing it with the cleaned data.
 *
 * @example
 *   router.post("/", validate(checkoutSchema), handler)
 *   router.get("/", validate(paginationSchema, "query"), handler)
 */
export function validate(schema: ZodSchema, source: RequestSource = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      next(new ValidationError("Validation failed", details));
      return;
    }

    // Express 5 exposes `req.query` via an immutable getter on the
    // prototype, so `req.query = ...` throws. Replace the property as
    // a writable own property on the request instance instead.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}
