// HTTP layer for promotions (3H.4): CRUD + a cart preview + coupon validation.

import { Request, Response, NextFunction } from "express";
import { m, sum } from "../../shared/utils/money";
import type { PromoLine } from "rx-pos-shared";
import * as svc from "./promotion.service";
import { resolveForCart } from "./promotion-resolver";
import {
  createPromotionSchema,
  updatePromotionSchema,
  setActiveSchema,
  previewSchema,
  validateCouponSchema,
} from "./promotion.validation";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await svc.listPromotions(req.db!) });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createPromotionSchema.parse(req.body);
    const promo = await svc.createPromotion(req.db!, input as never);
    res.status(201).json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = updatePromotionSchema.parse(req.body);
    const promo = await svc.updatePromotion(req.db!, req.params.id as string, patch as never);
    res.json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
}

export async function activate(req: Request, res: Response, next: NextFunction) {
  try {
    const { isActive } = setActiveSchema.parse(req.body);
    const promo = await svc.setActive(req.db!, req.params.id as string, isActive);
    res.json({ success: true, data: promo });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.removePromotion(req.db!, req.params.id as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** Builds engine lines from preview items (loads each product's categoryId for scope). */
async function toPromoLines(db: any, items: ReturnType<typeof previewSchema.parse>["items"]): Promise<PromoLine[]> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, categoryId: true } });
  const catById = new Map(products.map((p: any) => [p.id, p.categoryId ?? null]));
  return items.map((it) => ({
    id: it.productId + (it.variantId ?? ""),
    productId: it.productId,
    categoryId: (catById.get(it.productId) as string | null) ?? null,
    unitPrice: String(it.unitPrice),
    qty: String(it.quantity),
    existingLineDiscount: String(it.discount ?? 0),
  }));
}

function discountTotal(lineDiscounts: Record<string, string>, cartDiscount: string) {
  return sum(Object.values(lineDiscounts).map((v) => m(v)))
    .plus(m(cartDiscount))
    .toDecimalPlaces(2)
    .toString();
}

// POST /promotions/preview — server-computed promo discounts for a cart.
export async function preview(req: Request, res: Response, next: NextFunction) {
  try {
    const input = previewSchema.parse(req.body);
    const lines = await toPromoLines(req.db!, input.items);
    const result = await resolveForCart(req.db!, {
      lines,
      customerId: input.customerId ?? null,
      couponCode: input.couponCode ?? null,
      now: new Date(),
    });
    res.json({ success: true, data: { ...result, discountTotal: discountTotal(result.lineDiscounts, result.cartDiscount) } });
  } catch (err) {
    next(err);
  }
}

// POST /promotions/validate-coupon — is this code usable, and what does it give?
export async function validateCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const input = validateCouponSchema.parse(req.body);
    const promo = await req.db!.promotion.findFirst({
      where: { couponCode: input.code, isActive: true },
      select: { id: true, name: true },
    });
    if (!promo) {
      res.json({ success: true, data: { valid: false, reason: "Unknown or inactive coupon" } });
      return;
    }
    const lines = input.items ? await toPromoLines(req.db!, input.items) : [];
    const result = await resolveForCart(req.db!, {
      lines,
      customerId: input.customerId ?? null,
      couponCode: input.code,
      now: new Date(),
    });
    const applied = result.applied.find((a) => a.promotionId === promo.id);
    res.json({
      success: true,
      data: {
        valid: !!applied,
        reason: applied ? undefined : "Coupon not applicable to this cart",
        name: promo.name,
        discount: applied?.amount ?? "0",
      },
    });
  } catch (err) {
    next(err);
  }
}
