// 3H.4 promotion engine — PURE + deterministic. Computes per-line + cart discount
// deltas that the caller merges into `priceCart`'s existing lineDiscount/cartDiscount
// inputs, so tax is charged on the already-discounted net. No Date.now()/random —
// `ctx.now` is passed in. Money is always Decimal; strings at the boundary.
//
// Stacking model (spec §2): at most ONE non-stackable promo applies (the single
// best-value one), plus any number of stackable promos (priority order). Each
// promo's discount is computed off the ORIGINAL line net (predictable "off the
// listed price"); a hard floor then clamps every line's extra discount so net ≥ 0
// and the cart discount ≤ the remaining cart net — stacking can never go negative.

import { m, sum, min as dmin, max as dmax, Decimal } from "../money/money";

// ── Config (validated by the backend on write; engine narrows by `type`) ──────
export type PromotionType =
  | "PERCENT_OFF"
  | "FIXED_OFF"
  | "BOGO"
  | "BUNDLE"
  | "VOLUME_TIER"
  | "GROUP"
  | "COUPON";

export interface PromoScope {
  productIds?: string[];
  categoryIds?: string[];
}
export interface PercentOffConfig {
  percent: number;
  scope?: PromoScope;
}
export interface FixedOffConfig {
  amount: number;
  scope?: PromoScope;
}
export interface BogoConfig {
  buyProductId: string;
  buyQty: number;
  getProductId?: string;
  getQty: number;
  getPercent: number;
}
export interface BundleConfig {
  productIds: string[];
  bundlePrice: number;
}
export interface VolumeTierConfig {
  scope?: PromoScope;
  tiers: Array<{ minQty: number; percent: number }>;
}
export interface GroupConfig {
  percent: number;
}
export interface CouponConfig {
  mode: "percent" | "fixed";
  value: number;
  scope?: PromoScope;
}

// ── Engine I/O ────────────────────────────────────────────────────────────────
export interface PromoLine {
  id: string;
  productId: string;
  categoryId: string | null;
  unitPrice: string;
  qty: string;
  existingLineDiscount: string;
}
export interface PromoContext {
  now: Date;
  groupDiscountPercent?: string | null;
  customerGroupId?: string | null;
  couponCode?: string | null;
}
export interface PromoRule {
  id: string;
  name: string;
  type: PromotionType;
  priority: number;
  stackable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  couponCode: string | null;
  customerGroupId: string | null;
  minSubtotal: string | null;
  usageLimit: number | null;
  timesUsed: number;
  config: unknown;
}
export interface AppliedPromo {
  promotionId: string;
  name: string;
  amount: string; // total discount this promo contributed (post-floor)
  lineId?: string;
}
export interface PromoResult {
  lineDiscounts: Record<string, string>; // ADDITIONAL discount per line id
  cartDiscount: string; // ADDITIONAL cart-level flat discount
  applied: AppliedPromo[];
}

interface LineNet {
  line: PromoLine;
  net: Decimal;
  qty: Decimal;
  unit: Decimal;
}
interface Effect {
  perLine: Map<string, Decimal>;
  cart: Decimal;
  total: Decimal;
}

function scopeMatches(scope: PromoScope | undefined, line: PromoLine): boolean {
  if (!scope || ((!scope.productIds || scope.productIds.length === 0) && (!scope.categoryIds || scope.categoryIds.length === 0))) {
    return true; // cart-wide
  }
  if (scope.productIds?.includes(line.productId)) return true;
  if (line.categoryId && scope.categoryIds?.includes(line.categoryId)) return true;
  return false;
}

function isEligible(r: PromoRule, ctx: PromoContext, cartSubtotal: Decimal): boolean {
  if (r.startsAt && r.startsAt.getTime() > ctx.now.getTime()) return false;
  if (r.endsAt && r.endsAt.getTime() < ctx.now.getTime()) return false;
  if (r.usageLimit != null && r.timesUsed >= r.usageLimit) return false;
  if (r.minSubtotal != null && cartSubtotal.lt(m(r.minSubtotal))) return false;
  if (r.couponCode) {
    if (!ctx.couponCode || ctx.couponCode !== r.couponCode) return false;
  }
  if (r.customerGroupId) {
    if (!ctx.customerGroupId || ctx.customerGroupId !== r.customerGroupId) return false;
  }
  return true;
}

function emptyEffect(): Effect {
  return { perLine: new Map(), cart: m(0), total: m(0) };
}
function withTotal(perLine: Map<string, Decimal>, cart: Decimal): Effect {
  const total = sum([...perLine.values()]).plus(cart);
  return { perLine, cart, total };
}

function computeEffect(r: PromoRule, nets: LineNet[]): Effect {
  const byId = new Map(nets.map((n) => [n.line.id, n]));
  switch (r.type) {
    case "PERCENT_OFF": {
      const c = r.config as PercentOffConfig;
      const pct = m(c.percent);
      const scoped = c.scope && ((c.scope.productIds?.length ?? 0) + (c.scope.categoryIds?.length ?? 0) > 0);
      if (!scoped) {
        const cart = sum(nets.map((n) => n.net)).times(pct).div(100);
        return withTotal(new Map(), cart);
      }
      const perLine = new Map<string, Decimal>();
      for (const n of nets) if (scopeMatches(c.scope, n.line)) perLine.set(n.line.id, n.net.times(pct).div(100));
      return withTotal(perLine, m(0));
    }
    case "GROUP": {
      const c = r.config as GroupConfig;
      const cart = sum(nets.map((n) => n.net)).times(m(c.percent)).div(100);
      return withTotal(new Map(), cart);
    }
    case "FIXED_OFF": {
      const c = r.config as FixedOffConfig;
      const amount = m(c.amount);
      const scoped = c.scope && ((c.scope.productIds?.length ?? 0) + (c.scope.categoryIds?.length ?? 0) > 0);
      if (!scoped) return withTotal(new Map(), amount);
      const matching = nets.filter((n) => scopeMatches(c.scope, n.line));
      const base = sum(matching.map((n) => n.net));
      const perLine = new Map<string, Decimal>();
      if (base.gt(0)) {
        for (const n of matching) perLine.set(n.line.id, amount.times(n.net).div(base));
      }
      return withTotal(perLine, m(0));
    }
    case "COUPON": {
      const c = r.config as CouponConfig;
      const scoped = c.scope && ((c.scope.productIds?.length ?? 0) + (c.scope.categoryIds?.length ?? 0) > 0);
      if (c.mode === "percent") {
        const pct = m(c.value);
        if (!scoped) return withTotal(new Map(), sum(nets.map((n) => n.net)).times(pct).div(100));
        const perLine = new Map<string, Decimal>();
        for (const n of nets) if (scopeMatches(c.scope, n.line)) perLine.set(n.line.id, n.net.times(pct).div(100));
        return withTotal(perLine, m(0));
      }
      // fixed
      const amount = m(c.value);
      if (!scoped) return withTotal(new Map(), amount);
      const matching = nets.filter((n) => scopeMatches(c.scope, n.line));
      const base = sum(matching.map((n) => n.net));
      const perLine = new Map<string, Decimal>();
      if (base.gt(0)) for (const n of matching) perLine.set(n.line.id, amount.times(n.net).div(base));
      return withTotal(perLine, m(0));
    }
    case "BOGO": {
      const c = r.config as BogoConfig;
      const buyLine = nets.find((n) => n.line.productId === c.buyProductId);
      const getProductId = c.getProductId ?? c.buyProductId;
      const getLine = nets.find((n) => n.line.productId === getProductId);
      if (!buyLine || !getLine) return emptyEffect();
      const sets = buyLine.qty.div(c.buyQty).floor();
      let freeUnits = dmin(sets.times(c.getQty), getLine.qty);
      // if buy and get are the SAME product, the buy units can't also be the free units
      if (getProductId === c.buyProductId) {
        freeUnits = dmin(freeUnits, dmax(0, getLine.qty.minus(sets.times(c.buyQty))));
      }
      if (freeUnits.lte(0)) return emptyEffect();
      const disc = getLine.unit.times(freeUnits).times(m(c.getPercent)).div(100);
      const perLine = new Map([[getLine.line.id, disc]]);
      return withTotal(perLine, m(0));
    }
    case "VOLUME_TIER": {
      const c = r.config as VolumeTierConfig;
      const perLine = new Map<string, Decimal>();
      for (const n of nets) {
        if (!scopeMatches(c.scope, n.line)) continue;
        const applicable = c.tiers.filter((t) => n.qty.gte(t.minQty));
        if (applicable.length === 0) continue;
        const best = applicable.reduce((a, b) => (b.minQty > a.minQty ? b : a));
        perLine.set(n.line.id, n.net.times(m(best.percent)).div(100));
      }
      return withTotal(perLine, m(0));
    }
    case "BUNDLE": {
      const c = r.config as BundleConfig;
      const members = c.productIds.map((pid) => nets.find((n) => n.line.productId === pid));
      if (members.some((mem) => !mem)) return emptyEffect();
      const present = members as LineNet[];
      const sets = present.reduce((acc, mem) => dmin(acc, mem.qty.floor()), m(Number.MAX_SAFE_INTEGER));
      if (sets.lte(0)) return emptyEffect();
      const base = sum(present.map((mem) => mem.unit.times(sets)));
      const target = m(c.bundlePrice).times(sets);
      const discount = base.minus(target);
      if (discount.lte(0)) return emptyEffect();
      const perLine = new Map<string, Decimal>();
      const lineBase = present.map((mem) => mem.unit.times(sets));
      const baseSum = sum(lineBase);
      present.forEach((mem, i) => {
        if (baseSum.gt(0)) perLine.set(mem.line.id, discount.times(lineBase[i]).div(baseSum));
      });
      return withTotal(perLine, m(0));
    }
    default:
      return emptyEffect();
  }
}

export function resolvePromotions(
  lines: PromoLine[],
  rules: PromoRule[],
  ctx: PromoContext,
): PromoResult {
  const nets: LineNet[] = lines.map((l) => {
    const unit = m(l.unitPrice);
    const qty = m(l.qty);
    const net = dmax(0, unit.times(qty).minus(m(l.existingLineDiscount)));
    return { line: l, net, qty, unit };
  });
  const cartSubtotal = sum(nets.map((n) => n.net));

  // Eligible = explicit rules that pass the gate + the implicit group discount.
  const eligible = rules.filter((r) => isEligible(r, ctx, cartSubtotal));
  if (ctx.groupDiscountPercent && m(ctx.groupDiscountPercent).gt(0)) {
    eligible.push({
      id: "__group__",
      name: "Customer group discount",
      type: "GROUP",
      priority: 1000,
      stackable: true,
      startsAt: null,
      endsAt: null,
      couponCode: null,
      customerGroupId: null,
      minSubtotal: null,
      usageLimit: null,
      timesUsed: 0,
      config: { percent: Number(ctx.groupDiscountPercent) } as GroupConfig,
    });
  }

  const effects = eligible
    .map((r) => ({ r, eff: computeEffect(r, nets) }))
    .filter((e) => e.eff.total.gt(0));

  const lineExtra = new Map<string, Decimal>(nets.map((n) => [n.line.id, m(0)]));
  let cartExtra = m(0);
  const applied: AppliedPromo[] = [];

  const apply = (r: PromoRule, eff: Effect) => {
    for (const [id, amt] of eff.perLine) lineExtra.set(id, (lineExtra.get(id) ?? m(0)).plus(amt));
    cartExtra = cartExtra.plus(eff.cart);
    const lineId = eff.perLine.size === 1 ? [...eff.perLine.keys()][0] : undefined;
    applied.push({ promotionId: r.id, name: r.name, amount: eff.total.toDecimalPlaces(2).toString(), lineId });
  };

  // At most one non-stackable (best value), then all stackable in priority order.
  const nonStack = effects.filter((e) => !e.r.stackable);
  if (nonStack.length > 0) {
    const best = nonStack.reduce((a, b) => (b.eff.total.gt(a.eff.total) ? b : a));
    apply(best.r, best.eff);
  }
  const stack = effects.filter((e) => e.r.stackable).sort((a, b) => a.r.priority - b.r.priority);
  for (const e of stack) apply(e.r, e.eff);

  // Floor: no line net < 0, cart discount ≤ remaining cart net.
  const lineDiscounts: Record<string, string> = {};
  for (const n of nets) {
    const clamped = dmin(lineExtra.get(n.line.id) ?? m(0), n.net);
    if (clamped.gt(0)) lineDiscounts[n.line.id] = clamped.toDecimalPlaces(2).toString();
  }
  const totalLineExtra = sum(nets.map((n) => dmin(lineExtra.get(n.line.id) ?? m(0), n.net)));
  const remainingCartNet = dmax(0, cartSubtotal.minus(totalLineExtra));
  const clampedCart = dmin(cartExtra, remainingCartNet);

  return {
    lineDiscounts,
    cartDiscount: clampedCart.toDecimalPlaces(2).toString(),
    applied,
  };
}
