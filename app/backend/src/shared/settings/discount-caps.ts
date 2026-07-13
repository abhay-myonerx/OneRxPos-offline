// 3H.7 — the cap TYPES + decision (`exceedsCap`) + defaults now live in
// rx-pos-shared (single source of truth with the POS gate). This module keeps
// `getDiscountCaps` (reads a tenant's per-role cap overrides out of settings).

import { DEFAULT_ROLE_CAPS } from "rx-pos-shared";
import type { DiscountCap, RoleCaps } from "rx-pos-shared";

export type { DiscountCap, RoleCaps };
export { DEFAULT_ROLE_CAPS };

export function getDiscountCaps(tenantSettings: unknown): RoleCaps {
  const s = (tenantSettings ?? {}) as { discountCaps?: Partial<RoleCaps> };
  const override = s.discountCaps ?? {};
  const merged: RoleCaps = { ...DEFAULT_ROLE_CAPS };
  for (const role of Object.keys(override)) {
    merged[role] = { ...(merged[role] ?? { percent: null, flat: null }), ...override[role] };
  }
  return merged;
}
