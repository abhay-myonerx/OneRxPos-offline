// 3H.7 — the canonical discount-cap decision, shared by the POS gate (frontend)
// and the checkout enforcement (backend) so the two can NEVER diverge (that
// divergence was the bug: the cap was UI-only and bypassable via the API).

export type DiscountCap = { percent: number | null; flat: number | null };
export type RoleCaps = Record<string, DiscountCap>;

export const DEFAULT_ROLE_CAPS: RoleCaps = {
  CASHIER: { percent: 10, flat: null },
  MANAGER: { percent: null, flat: null },
  ADMIN: { percent: null, flat: null },
  SUPER_ADMIN: { percent: null, flat: null },
};

export function exceedsCap(args: {
  role: string;
  mode: "percent" | "flat";
  value: number;
  lineOrCartBase: number;
  caps?: RoleCaps;
}): boolean {
  const caps = args.caps ?? DEFAULT_ROLE_CAPS;
  const cap = caps[args.role] ?? caps.CASHIER;
  const effectivePercent =
    args.mode === "percent"
      ? args.value
      : args.lineOrCartBase > 0
        ? (args.value / args.lineOrCartBase) * 100
        : args.value > 0
          ? Infinity
          : 0;
  const percentExceeded = cap.percent !== null && effectivePercent > cap.percent + 1e-9;
  const flatExceeded = cap.flat !== null && args.mode === "flat" && args.value > cap.flat + 1e-9;
  return percentExceeded || flatExceeded;
}
