// Fifth auth-chain layer.
// Stack order on protected v2 routes:
//
//   authenticate → tenantContext → requirePermission → storeGuard
//   → moduleEnabled
//
// Per Master Locked §3.1 #3 — defaults-open. A module is "enabled"
// unless the tenant explicitly sets the slug to `false` in
// `Tenant.settings.enabledModules`. Missing tenant / missing
// settings / missing slug → pass through.
//
// On disabled, throws `ModuleDisabledError` → 503 MODULE_DISABLED
// (per API Reference §0 + §38.7).
//
// Why this lives after `tenantContext` rather than before it: the
// tenant id is required to look up the per-tenant toggle. Putting
// it after requirePermission keeps the failure surface ordered
// auth-failure → permission-failure → module-disabled, which is
// what the API doc promises.

import { Request, Response, NextFunction } from "express";

import { prisma } from "../config/database";
import { ModuleDisabledError } from "../shared/errors/ModuleDisabledError";
import { readEnabledModules, type ModuleSlug } from "../shared/settings";
import { logger } from "../shared/utils/logger";

// Tiny per-tenant cache so we don't re-hit Postgres on every request.
// 30 s TTL — long enough to absorb burst traffic, short enough that
// an operator's module-toggle change propagates in under a minute.
// Cleared on demand via `clearModuleCache(tenantId)` after writes.
interface CacheEntry {
  enabled: Record<ModuleSlug, boolean>;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export function clearModuleCache(tenantId?: string): void {
  if (tenantId) {
    cache.delete(tenantId);
  } else {
    cache.clear();
  }
}

async function loadEnabledModules(tenantId: string): Promise<Record<ModuleSlug, boolean>> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > now) return hit.enabled;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  // Tenant missing or settings null → use defaults (all true).
  // We still cache the result so a 404'd tenant doesn't hammer the
  // DB on every retry.
  const enabled = readEnabledModules({
    settings: tenant?.settings ?? null,
  });
  cache.set(tenantId, { enabled, expiresAt: now + CACHE_TTL_MS });
  return enabled;
}

/**
 * Builds an Express middleware that 503s with `MODULE_DISABLED` when
 * the named module is disabled for the calling tenant. Mount as the
 * last layer of the v2 router (after `requirePermission`).
 *
 *     router.use(authenticate, tenantContext, moduleEnabled("hr"));
 *     router.get("/employees", requirePermission(...), controller.list);
 *
 * Or per-route:
 *     router.post("/checkout",
 *       requirePermission(...), storeGuard,
 *       moduleEnabled("hr.payroll"),
 *       controller.checkout);
 */
export function moduleEnabled(slug: ModuleSlug) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        // No tenant context — let `tenantContext` produce the
        // canonical error rather than masking it here.
        next();
        return;
      }
      const enabled = await loadEnabledModules(tenantId);
      if (enabled[slug] === false) {
        next(new ModuleDisabledError(slug));
        return;
      }
      next();
    } catch (err) {
      // Fail-closed on infra errors? No — fail-open. The
      // alternative is a single failing Postgres causing the
      // entire v2 surface to 503. Log and pass through.
      logger.warn(
        { err, slug, tenantId: req.tenantId },
        "moduleEnabled middleware errored — failing open",
      );
      next();
    }
  };
}
