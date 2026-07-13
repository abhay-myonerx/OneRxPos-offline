// 3H.4 promotions

export type PromotionType =
  | "PERCENT_OFF"
  | "FIXED_OFF"
  | "BOGO"
  | "BUNDLE"
  | "VOLUME_TIER"
  | "GROUP"
  | "COUPON";

export interface Promotion {
  id: string;
  name: string;
  type: PromotionType;
  isActive: boolean;
  priority: number;
  stackable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  couponCode: string | null;
  customerGroupId: string | null;
  minSubtotal: string | number | null;
  usageLimit: number | null;
  timesUsed: number;
  config: Record<string, unknown>;
}

export interface CreatePromotionInput {
  name: string;
  type: PromotionType;
  config: Record<string, unknown>;
  isActive?: boolean;
  priority?: number;
  stackable?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  couponCode?: string | null;
  customerGroupId?: string | null;
  minSubtotal?: number | null;
  usageLimit?: number | null;
}

export interface CouponValidationResult {
  valid: boolean;
  reason?: string;
  name?: string;
  discount?: string;
}

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  PERCENT_OFF: "% off",
  FIXED_OFF: "Fixed amount off",
  BOGO: "Buy X get Y",
  BUNDLE: "Bundle price",
  VOLUME_TIER: "Volume / tiered",
  GROUP: "Customer-group discount",
  COUPON: "Coupon code",
};
