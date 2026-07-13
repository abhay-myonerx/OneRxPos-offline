// 3H.7 — the discount-cap decision now lives in rx-pos-shared so the POS gate
// and the server-side checkout enforcement use the IDENTICAL function (the
// client/server divergence was the bypass bug). Re-exported here so existing
// `@/features/pos/helpers/discount-cap` imports keep working unchanged.

export { exceedsCap, DEFAULT_ROLE_CAPS } from "rx-pos-shared";
export type { DiscountCap, RoleCaps } from "rx-pos-shared";
