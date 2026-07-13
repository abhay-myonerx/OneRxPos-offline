import { Request, Response, NextFunction } from "express";
import { config } from "../config";

const DEMO_RESPONSE = {
  message: "This action is disabled in demo mode",
  code: "DEMO_RESTRICTED",
};

// Fields in PATCH /api/v1/tenants/* that are locked in demo mode
const TENANT_BLOCKED_FIELDS = new Set(["name", "email", "logo", "currency", "timezone"]);

// Fields in PATCH /api/v1/receipts/:id that are locked in demo mode
const RECEIPT_BLOCKED_FIELDS = new Set(["businessName", "logo"]);

function bodyHasAny(body: unknown, fields: Set<string>): boolean {
  if (!body || typeof body !== "object") return false;
  return Object.keys(body as Record<string, unknown>).some((k) => fields.has(k));
}

export function demoGuard(req: Request, res: Response, next: NextFunction): void {
  if (!config.DEMO_MODE) {
    next();
    return;
  }

  const { method } = req;
  const path = req.path;

  // Block ALL delete requests across every module
  if (method === "DELETE") {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block POST /api/v1/auth/change-password
  if (method === "POST" && path === "/api/v1/auth/change-password") {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block POST /api/v1/users/:id/reset-password
  if (method === "POST" && /^\/api\/v1\/users\/[^/]+\/reset-password$/.test(path)) {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block POST /api/v1/users (create user) — exact path only, not sub-routes
  if (method === "POST" && path === "/api/v1/users") {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block tenant setup / new-tenant registration in demo mode
  // Prevents someone from bootstrapping a second tenant on the shared demo server
  if (method === "POST" && /^\/api\/v1\/setup/.test(path)) {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block PATCH /api/v1/tenants/* only when sensitive identity fields are in the body
  // Allows other tenant PATCH operations (plan, status changes by super-admin)
  if (
    method === "PATCH" &&
    /^\/api\/v1\/tenants(\/[^/]*)?$/.test(path) &&
    bodyHasAny(req.body, TENANT_BLOCKED_FIELDS)
  ) {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block PATCH /api/v1/receipts/:id only when branding fields are in the body
  if (
    method === "PATCH" &&
    /^\/api\/v1\/receipts\/[^/]+$/.test(path) &&
    bodyHasAny(req.body, RECEIPT_BLOCKED_FIELDS)
  ) {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block all export / download endpoints (any module)
  if (/\/(export|download)(\/|$)/.test(path)) {
    res.status(403).json(DEMO_RESPONSE);
    return;
  }

  // Block image/file upload endpoints — return a mock Cloudinary URL instead
  // so the UI doesn't break while preventing real storage consumption
  if (method === "POST" && /\/(upload|image)(s)?(\/|$)/.test(path)) {
    res.status(200).json({
      success: true,
      data: {
        url: "https://res.cloudinary.com/demo/image/upload/v1/rxpos-demo-placeholder.jpg",
        publicId: "rxpos-demo-placeholder",
        message: "Image upload is disabled in demo mode — using placeholder",
      },
    });
    return;
  }

  next();
}
