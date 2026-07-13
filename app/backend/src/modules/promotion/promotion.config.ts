// 3H.4 — per-type promotion `config` validation (backend). The shared engine
// (rx-pos-shared) reads config by narrowing on `type`; the backend is the write
// gate that guarantees each stored config matches its type's shape.

import { z } from "zod";
import type { PromotionType } from "rx-pos-shared";

const scopeSchema = z
  .object({
    productIds: z.array(z.string().uuid()).optional(),
    categoryIds: z.array(z.string().uuid()).optional(),
  })
  .strict();

const percentOff = z.object({ percent: z.number().min(0).max(100), scope: scopeSchema.optional() }).strict();
const fixedOff = z.object({ amount: z.number().positive(), scope: scopeSchema.optional() }).strict();
const bogo = z
  .object({
    buyProductId: z.string().uuid(),
    buyQty: z.number().int().positive(),
    getProductId: z.string().uuid().optional(),
    getQty: z.number().int().positive(),
    getPercent: z.number().min(0).max(100),
  })
  .strict();
const bundle = z.object({ productIds: z.array(z.string().uuid()).min(2), bundlePrice: z.number().positive() }).strict();
const volumeTier = z
  .object({
    scope: scopeSchema.optional(),
    tiers: z.array(z.object({ minQty: z.number().int().positive(), percent: z.number().min(0).max(100) }).strict()).min(1),
  })
  .strict();
const group = z.object({ percent: z.number().min(0).max(100) }).strict();
const coupon = z.object({ mode: z.enum(["percent", "fixed"]), value: z.number().positive(), scope: scopeSchema.optional() }).strict();

const SCHEMAS: Record<PromotionType, z.ZodTypeAny> = {
  PERCENT_OFF: percentOff,
  FIXED_OFF: fixedOff,
  BOGO: bogo,
  BUNDLE: bundle,
  VOLUME_TIER: volumeTier,
  GROUP: group,
  COUPON: coupon,
};

/** Returns the validated config for `type`, or throws a ZodError. */
export function validatePromotionConfig(type: PromotionType, config: unknown): unknown {
  return SCHEMAS[type].parse(config);
}
