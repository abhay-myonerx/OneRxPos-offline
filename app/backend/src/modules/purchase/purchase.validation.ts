import { z } from "zod";

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier UUID"),
  storeId: z.string().uuid("Invalid store UUID"),
  expectedDate: z.coerce.date().optional().nullable(),
  shippingCost: z.number().min(0).default(0),
  notes: z.string().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().optional().nullable(),
        orderedQty: z.number().int().positive("Ordered quantity must be positive"),
        unitCost: z.number().min(0, "Unit cost must be >= 0"),
      }),
    )
    .min(1, "At least one item is required"),
});

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const receiveGoodsSchema = z.object({
  items: z
    .array(
      z.object({
        purchaseItemId: z.string().uuid(),
        receivedQty: z.number().int().positive("Received qty must be positive"),
      }),
    )
    .min(1, "At least one item is required"),
});

export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;

export const addPaymentSchema = z.object({
  amount: z.number().positive("Payment must be positive"),
  method: z.enum(["CASH", "CARD", "MOBILE_BANKING", "OTHER"]),
  referenceNo: z.string().max(255).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type AddPaymentInput = z.infer<typeof addPaymentSchema>;

export const listPurchasesSchema = z.object({
  supplierId: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "grandTotal", "purchaseNo"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListPurchasesInput = z.infer<typeof listPurchasesSchema>;
