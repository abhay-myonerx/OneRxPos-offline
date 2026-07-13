import { z } from "zod";

const promotionTypeEnum = z.enum([
  "PERCENT_OFF",
  "FIXED_OFF",
  "BOGO",
  "BUNDLE",
  "VOLUME_TIER",
  "GROUP",
  "COUPON",
]);

// `config` is validated per-type in the service (validatePromotionConfig); here
// it is accepted as an object and the type/common fields are checked.
export const createPromotionSchema = z.object({
  name: z.string().min(1).max(150),
  type: promotionTypeEnum,
  config: z.record(z.string(), z.unknown()),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  stackable: z.boolean().optional(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  couponCode: z.string().max(64).optional().nullable(),
  customerGroupId: z.string().uuid().optional().nullable(),
  minSubtotal: z.number().min(0).optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
});

export const updatePromotionSchema = createPromotionSchema.partial();

export const idParamSchema = z.object({ id: z.string().uuid() });

export const setActiveSchema = z.object({ isActive: z.boolean() });

const previewItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).optional(),
});

export const previewSchema = z.object({
  items: z.array(previewItemSchema).min(1),
  customerId: z.string().uuid().optional().nullable(),
  couponCode: z.string().max(64).optional().nullable(),
});

export const validateCouponSchema = z.object({
  code: z.string().min(1).max(64),
  items: z.array(previewItemSchema).optional(),
  customerId: z.string().uuid().optional().nullable(),
});
