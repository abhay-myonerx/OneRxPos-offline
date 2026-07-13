// Typed accessors for `Tenant.settings` JSON namespaces (Phase 19c /
// OI-075). The settings column is a single JSONB; every v2 module
// reads/writes through its own typed namespace so we don't sprinkle
// `tenant.settings.foo?.bar ?? "default"` across the codebase.
//
// Design rules:
//   1. Every namespace has a strict Zod schema with safe defaults.
//   2. Reads are tolerant — if the namespace is missing or malformed
//      the schema's defaults apply. We DO NOT throw on read because a
//      fresh tenant has an empty `{}` settings object.
//   3. Writes are strict — invalid input throws a ValidationError
//      surfaced as 400 to the caller.
//   4. Helpers return a fully-typed object; no `as never` at the call
//      site.

import type { Prisma } from "../../generated/prisma/client";

import {
  enabledModulesSchema,
  DEFAULT_ENABLED_MODULES,
  type EnabledModules,
  type ModuleSlug,
} from "./enabledModules";
import {
  enabledSectorsSchema,
  DEFAULT_ENABLED_SECTORS,
  type EnabledSectors,
  type SectorSlug,
} from "./enabledSectors";
import { hrSchema, type HrSettings } from "./hr";
import { aiSchema, type AiSettings } from "./ai";
import { notificationsSchema, type NotificationsSettings } from "./notifications";
import { webhooksSchema, type WebhooksSettings } from "./webhooks";
import { kdsSchema, type KdsSettings } from "./kds";
import { billingSchema, type BillingSettings } from "./billing";
import { currencySchema, type CurrencySettings } from "./currency";
import { reorderSchema, type ReorderSettings } from "./reorder";

// ── Public types re-export ──────────────────────────────────────────

export type {
  EnabledModules,
  ModuleSlug,
  EnabledSectors,
  SectorSlug,
  HrSettings,
  AiSettings,
  NotificationsSettings,
  WebhooksSettings,
  KdsSettings,
  BillingSettings,
  CurrencySettings,
  ReorderSettings,
};

export { DEFAULT_ENABLED_MODULES };
export { DEFAULT_ENABLED_SECTORS };

// ── Read helpers (tolerant) ─────────────────────────────────────────

interface TenantLike {
  settings: Prisma.JsonValue | null;
}

function bag(tenant: TenantLike): Record<string, unknown> {
  if (!tenant.settings || typeof tenant.settings !== "object") return {};
  return tenant.settings as Record<string, unknown>;
}

export function readEnabledModules(tenant: TenantLike): EnabledModules {
  return enabledModulesSchema.parse(bag(tenant).enabledModules ?? {});
}

export function readEnabledSectors(tenant: TenantLike): EnabledSectors {
  return enabledSectorsSchema.parse(bag(tenant).enabledSectors ?? {});
}

export function readHrSettings(tenant: TenantLike): HrSettings {
  return hrSchema.parse(bag(tenant).hr ?? {});
}

export function readAiSettings(tenant: TenantLike): AiSettings {
  return aiSchema.parse(bag(tenant).ai ?? {});
}

export function readNotificationsSettings(tenant: TenantLike): NotificationsSettings {
  return notificationsSchema.parse(bag(tenant).notifications ?? {});
}

export function readWebhooksSettings(tenant: TenantLike): WebhooksSettings {
  return webhooksSchema.parse(bag(tenant).webhooks ?? {});
}

export function readKdsSettings(tenant: TenantLike): KdsSettings {
  return kdsSchema.parse(bag(tenant).kds ?? {});
}

export function readBillingSettings(tenant: TenantLike): BillingSettings {
  return billingSchema.parse(bag(tenant).billing ?? {});
}

export function readCurrencySettings(tenant: TenantLike): CurrencySettings {
  return currencySchema.parse(bag(tenant).currency ?? {});
}

export function readReorderSettings(tenant: TenantLike): ReorderSettings {
  return reorderSchema.parse(bag(tenant).reorder ?? {});
}

// ── Write helper (strict) ───────────────────────────────────────────
//
// Returns the merged settings JSON to write back via
// `prisma.tenant.update({ data: { settings: ... } })`. The caller is
// responsible for the actual write (transaction discipline + audit).
//
// `patch` is shallow per top-level namespace — passing
// `{ enabledModules: { kds: false } }` replaces the whole
// enabledModules namespace with the merged Zod-validated result,
// preserving every other namespace untouched.

export type SettingsPatch = Partial<{
  enabledModules: Partial<EnabledModules>;
  enabledSectors: Partial<EnabledSectors>;
  hr: Partial<HrSettings>;
  ai: Partial<AiSettings>;
  notifications: Partial<NotificationsSettings>;
  webhooks: Partial<WebhooksSettings>;
  kds: Partial<KdsSettings>;
  billing: Partial<BillingSettings>;
  currency: Partial<CurrencySettings>;
  reorder: Partial<ReorderSettings>;
}>;

export function mergeSettings(
  current: Prisma.JsonValue | null,
  patch: SettingsPatch,
): Record<string, unknown> {
  const fakeTenant: TenantLike = { settings: current };
  const next: Record<string, unknown> = {
    ...bag(fakeTenant),
  };
  if (patch.enabledModules) {
    next.enabledModules = enabledModulesSchema.parse({
      ...readEnabledModules(fakeTenant),
      ...patch.enabledModules,
    });
  }
  if (patch.enabledSectors) {
    next.enabledSectors = enabledSectorsSchema.parse({
      ...readEnabledSectors(fakeTenant),
      ...patch.enabledSectors,
    });
  }
  if (patch.hr) {
    next.hr = hrSchema.parse({
      ...readHrSettings(fakeTenant),
      ...patch.hr,
    });
  }
  if (patch.ai) {
    next.ai = aiSchema.parse({
      ...readAiSettings(fakeTenant),
      ...patch.ai,
    });
  }
  if (patch.notifications) {
    next.notifications = notificationsSchema.parse({
      ...readNotificationsSettings(fakeTenant),
      ...patch.notifications,
    });
  }
  if (patch.webhooks) {
    next.webhooks = webhooksSchema.parse({
      ...readWebhooksSettings(fakeTenant),
      ...patch.webhooks,
    });
  }
  if (patch.kds) {
    next.kds = kdsSchema.parse({
      ...readKdsSettings(fakeTenant),
      ...patch.kds,
    });
  }
  if (patch.billing) {
    next.billing = billingSchema.parse({
      ...readBillingSettings(fakeTenant),
      ...patch.billing,
    });
  }
  if (patch.currency) {
    next.currency = currencySchema.parse({
      ...readCurrencySettings(fakeTenant),
      ...patch.currency,
    });
  }
  if (patch.reorder) {
    next.reorder = reorderSchema.parse({
      ...readReorderSettings(fakeTenant),
      ...patch.reorder,
    });
  }
  return next;
}
