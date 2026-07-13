// Per-tenant module on/off toggles (Phase 19c / OI-074-075).
//
// Defaults: every module is ON. The `moduleEnabled` middleware
// fails-open — only an explicit `false` blocks. This matches Master
// Locked §3.1 #3 ("defaults-open per tenant").

import { z } from "zod";

// Module slugs that the v2 surface recognises. New modules add a
// slug here AND get a default value in `DEFAULT_ENABLED_MODULES`.
// The middleware uses these strings; routers reference them via the
// `MODULE` constant to avoid stringly-typed mounts.
export const MODULE_SLUGS = [
  "hr",
  "hr.attendance",
  "hr.shifts",
  "hr.leave",
  "hr.payroll",
  "hr.ess",
  "brands",
  "reports.v2",
  "notifications",
  "webhooks",
  "ai",
  "kds",
  "billing",
  "currency",
  "integrations",
] as const;

export type ModuleSlug = (typeof MODULE_SLUGS)[number];

export const MODULE: Readonly<Record<string, ModuleSlug>> = {
  HR: "hr",
  HR_ATTENDANCE: "hr.attendance",
  HR_SHIFTS: "hr.shifts",
  HR_LEAVE: "hr.leave",
  HR_PAYROLL: "hr.payroll",
  HR_ESS: "hr.ess",
  BRANDS: "brands",
  REPORTS_V2: "reports.v2",
  NOTIFICATIONS: "notifications",
  WEBHOOKS: "webhooks",
  AI: "ai",
  KDS: "kds",
  BILLING: "billing",
  CURRENCY: "currency",
  INTEGRATIONS: "integrations",
} as const;

// Defaults — all `true` (fail-open). A tenant explicitly toggling
// to `false` overrides this on a per-slug basis.
export const DEFAULT_ENABLED_MODULES: Record<ModuleSlug, boolean> = Object.fromEntries(
  MODULE_SLUGS.map((s) => [s, true]),
) as Record<ModuleSlug, boolean>;

// Zod schema: every slug optional, defaults to true on parse.
// `.catchall(z.boolean())` lets unknown slugs pass through harmlessly
// (forward-compat with new modules added in v2.1+).
export const enabledModulesSchema = z
  .object(
    Object.fromEntries(MODULE_SLUGS.map((s) => [s, z.boolean().default(true)])) as Record<
      ModuleSlug,
      z.ZodDefault<z.ZodBoolean>
    >,
  )
  .catchall(z.boolean())
  .transform((parsed) => {
    // Ensure every documented slug is present in the output.
    const out: Record<string, boolean> = { ...parsed };
    for (const s of MODULE_SLUGS) {
      if (out[s] === undefined) out[s] = true;
    }
    return out as Record<ModuleSlug, boolean>;
  });

export type EnabledModules = Record<ModuleSlug, boolean>;
