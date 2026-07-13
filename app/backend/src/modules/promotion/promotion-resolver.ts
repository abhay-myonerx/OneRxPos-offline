// 3H.4 — loads the eligible active promotions for a cart and runs the pure
// shared engine. NEVER throws into checkout: on any load error it returns an
// empty result so a sale can never break because of promotions.

import { resolvePromotions, type PromoLine, type PromoResult, type PromoRule } from "rx-pos-shared";
import { logger } from "../../shared/utils/logger";

export interface ResolveForCartInput {
  lines: PromoLine[];
  customerId?: string | null;
  couponCode?: string | null;
  now: Date;
}

const EMPTY: PromoResult = { lineDiscounts: {}, cartDiscount: "0", applied: [] };

export async function resolveForCart(db: any, input: ResolveForCartInput): Promise<PromoResult> {
  try {
    const now = input.now;
    // Active promos whose window includes `now` (null bounds = open).
    const promos = await db.promotion.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    });

    // The checkout customer's group discount (activates the dead field) + group id.
    let groupDiscountPercent: string | null = null;
    let customerGroupId: string | null = null;
    if (input.customerId) {
      const customer = await db.customer.findUnique({
        where: { id: input.customerId },
        select: { groupId: true, group: { select: { discountPercent: true } } },
      });
      customerGroupId = customer?.groupId ?? null;
      const pct = customer?.group?.discountPercent;
      if (pct != null && Number(pct) > 0) groupDiscountPercent = String(pct);
    }

    const rules: PromoRule[] = promos.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      priority: p.priority,
      stackable: p.stackable,
      startsAt: p.startsAt ? new Date(p.startsAt) : null,
      endsAt: p.endsAt ? new Date(p.endsAt) : null,
      couponCode: p.couponCode ?? null,
      customerGroupId: p.customerGroupId ?? null,
      minSubtotal: p.minSubtotal != null ? String(p.minSubtotal) : null,
      usageLimit: p.usageLimit ?? null,
      timesUsed: p.timesUsed ?? 0,
      config: p.config,
    }));

    return resolvePromotions(input.lines, rules, {
      now,
      groupDiscountPercent,
      customerGroupId,
      couponCode: input.couponCode ?? null,
    });
  } catch (err) {
    logger.error({ err }, "promotion resolveForCart failed — proceeding with no promotions");
    return EMPTY;
  }
}
