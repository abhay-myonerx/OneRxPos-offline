// Unit tests for the `validate` Zod middleware factory.
//
// Regression guard: Express 5 made `req.query` an immutable getter on
// the request prototype. The previous implementation did
// `req[source] = result.data`, which threw a TypeError at runtime for
// `"query"` and surfaced to the client as a 500. The middleware now
// installs the parsed value via `Object.defineProperty` so it works
// uniformly across body / query / params.

import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { validate } from "../validate";

function makeNext(): NextFunction & { mock: { calls: unknown[][] } } {
  return vi.fn() as unknown as NextFunction & {
    mock: { calls: unknown[][] };
  };
}

describe("validate middleware", () => {
  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });

  it("replaces req.query without throwing when the property is a non-writable getter (Express 5)", () => {
    // Simulate Express 5's immutable `req.query` — a prototype getter
    // with no setter. Direct assignment would throw a TypeError.
    const queryGetter = { page: "2", limit: "50" };
    const req = {} as Request;
    Object.defineProperty(
      Object.getPrototypeOf(req) === Object.prototype ? req : Object.getPrototypeOf(req),
      "_unused",
      { value: undefined },
    );
    Object.defineProperty(req, "query", {
      get: () => queryGetter,
      configurable: true,
    });

    const next = makeNext();
    const res = {} as Response;

    const handler = validate(schema, "query");
    expect(() => handler(req, res, next)).not.toThrow();

    // After middleware, `req.query` should hold the parsed (coerced) data.
    expect((req.query as unknown as { page: number }).page).toBe(2);
    expect((req.query as unknown as { limit: number }).limit).toBe(50);

    // next() should have been called with no error.
    expect(next).toHaveBeenCalledTimes(1);
    const callArgs = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(callArgs.length).toBe(0);
  });

  it("replaces req.body and coerces values", () => {
    const req = { body: { page: "3", limit: "10" } } as Request;
    const next = makeNext();
    const res = {} as Response;

    validate(schema, "body")(req, res, next);

    expect(req.body).toEqual({ page: 3, limit: 10 });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("forwards a ValidationError to next() on schema failure", () => {
    const req = { body: { page: "not-a-number" } } as Request;
    const next = makeNext();
    const res = {} as Response;

    validate(schema, "body")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Error;
    expect(err).toBeDefined();
    expect(err.message).toContain("Validation failed");
  });
});
