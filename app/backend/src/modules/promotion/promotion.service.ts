// 3H.4 promotion CRUD. Validates the type-specific `config` on write; enforces
// coupon-code uniqueness. Tenant-scoped via `db`.

import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import type { PromotionType } from "rx-pos-shared";
import { validatePromotionConfig } from "./promotion.config";

export interface CreatePromotionInput {
  name: string;
  type: PromotionType;
  config: unknown;
  isActive?: boolean;
  priority?: number;
  stackable?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  couponCode?: string | null;
  customerGroupId?: string | null;
  minSubtotal?: number | null;
  usageLimit?: number | null;
}

function normalizeCoupon(type: PromotionType, couponCode?: string | null): string | null {
  if (type === "COUPON") {
    const code = (couponCode ?? "").trim();
    if (!code) throw new ValidationError("A COUPON promotion requires a couponCode");
    return code;
  }
  return null; // non-coupon promos never carry a code
}

export async function createPromotion(db: any, input: CreatePromotionInput) {
  const config = validatePromotionConfig(input.type, input.config);
  const couponCode = normalizeCoupon(input.type, input.couponCode);
  try {
    return await db.promotion.create({
      data: {
        name: input.name,
        type: input.type,
        config: config as object,
        isActive: input.isActive ?? true,
        priority: input.priority ?? 0,
        stackable: input.stackable ?? false,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        couponCode,
        customerGroupId: input.customerGroupId ?? null,
        minSubtotal: input.minSubtotal ?? null,
        usageLimit: input.usageLimit ?? null,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") throw new ConflictError(`Coupon code '${couponCode}' already exists`);
    throw err;
  }
}

export async function listPromotions(db: any) {
  return db.promotion.findMany({ orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }] });
}

export async function getPromotion(db: any, id: string) {
  const promo = await db.promotion.findUnique({ where: { id } });
  if (!promo) throw new NotFoundError("Promotion", id);
  return promo;
}

export async function updatePromotion(db: any, id: string, patch: Partial<CreatePromotionInput>) {
  const existing = await getPromotion(db, id);
  const type = (patch.type ?? existing.type) as PromotionType;
  const data: Record<string, unknown> = {};
  if (patch.config !== undefined || patch.type !== undefined) {
    data.config = validatePromotionConfig(type, patch.config ?? existing.config) as object;
  }
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.stackable !== undefined) data.stackable = patch.stackable;
  if (patch.startsAt !== undefined) data.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) data.endsAt = patch.endsAt;
  if (patch.customerGroupId !== undefined) data.customerGroupId = patch.customerGroupId;
  if (patch.minSubtotal !== undefined) data.minSubtotal = patch.minSubtotal;
  if (patch.usageLimit !== undefined) data.usageLimit = patch.usageLimit;
  if (patch.couponCode !== undefined || patch.type !== undefined) {
    data.couponCode = normalizeCoupon(type, patch.couponCode ?? existing.couponCode);
  }
  try {
    return await db.promotion.update({ where: { id }, data });
  } catch (err: any) {
    if (err?.code === "P2002") throw new ConflictError("Coupon code already exists");
    throw err;
  }
}

export async function setActive(db: any, id: string, isActive: boolean) {
  await getPromotion(db, id);
  return db.promotion.update({ where: { id }, data: { isActive } });
}

export async function removePromotion(db: any, id: string) {
  await getPromotion(db, id);
  await db.promotion.delete({ where: { id } });
}
