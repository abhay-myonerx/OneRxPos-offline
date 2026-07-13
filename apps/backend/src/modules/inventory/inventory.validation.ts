import { z } from "zod";

// -- StockMovementType matches schema enum exactly --------------------------
// PURCHASE_IN | SALE | SALE_RETURN | ADJUSTMENT_ADD | ADJUSTMENT_SUB
// TRANSFER_IN | TRANSFER_OUT | DAMAGE

export const adjustStockSchema = z.object({
  storeId: z.string().uuid("Invalid store UUID"),
  productId: z.string().uuid("Invalid product UUID"),
  variantId: z.string().uuid().optional().nullable(),
  // positive = stock in, negative = stock out
  quantityChange: z
    .number()
    .int("Must be an integer")
    .refine((n) => n !== 0, {
      message: "quantityChange cannot be zero",
    }),
  type: z.enum([
    "PURCHASE_IN",
    "SALE",
    "SALE_RETURN",
    "ADJUSTMENT_ADD",
    "ADJUSTMENT_SUB",
    "TRANSFER_IN",
    "TRANSFER_OUT",
    "DAMAGE",
  ]),
  notes: z.string().max(500).optional().nullable(),
  referenceId: z.string().optional().nullable(),
  referenceType: z.string().max(50).optional().nullable(),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

// -- Set stock level (absolute override) ------------------------------------
export const setStockSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(0, "Stock cannot be negative"),
  notes: z.string().max(500).optional().nullable(),
});

export type SetStockInput = z.infer<typeof setStockSchema>;

// -- Update low-stock threshold ---------------------------------------------
export const updateThresholdSchema = z.object({
  lowStockThreshold: z.number().int().min(0),
});

export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>;

// -- Create inter-store transfer --------------------------------------------
// TransferStatus enum: PENDING | IN_TRANSIT | COMPLETED | CANCELLED
export const createTransferSchema = z
  .object({
    fromStoreId: z.string().uuid("From-store UUID required"),
    toStoreId: z.string().uuid("To-store UUID required"),
    notes: z.string().max(1000).optional().nullable(),
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          variantId: z.string().uuid().optional().nullable(),
          quantity: z.number().int().positive("Quantity must be positive"),
        }),
      )
      .min(1, "At least one item is required"),
  })
  .refine((d) => d.fromStoreId !== d.toStoreId, {
    message: "Source and destination stores must be different",
    path: ["toStoreId"],
  });

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

// -- Receive / complete a transfer ------------------------------------------
export const receiveTransferSchema = z.object({
  notes: z.string().max(500).optional().nullable(),
});

export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>;

// -- List stock movements query params --------------------------------------
export const listMovementsSchema = z.object({
  storeId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  variantId: z.string().uuid().optional(),
  type: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListMovementsInput = z.infer<typeof listMovementsSchema>;

// -- Low-stock query params -------------------------------------------------
export const lowStockQuerySchema = z.object({
  storeId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;

// -- Transfer list query params ---------------------------------------------
// NEW: `storeId` is an OR-filter across fromStoreId/toStoreId. Destination
// admins can pass their own store id here and see incoming transfers.
export const listTransfersSchema = z.object({
  storeId: z.string().uuid().optional(),
  fromStoreId: z.string().uuid().optional(),
  toStoreId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "IN_TRANSIT", "COMPLETED", "CANCELLED"]).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListTransfersInput = z.infer<typeof listTransfersSchema>;
