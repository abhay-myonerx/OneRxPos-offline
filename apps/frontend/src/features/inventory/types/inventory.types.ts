import { StockMovementType, TransferStatus } from "@/types/enums/status.enums";

export interface StoreStock {
  id: string;
  storeId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  lowStockThreshold: number;
  updatedAt: string;
  product?: { id: string; name: string; sku: string; costPrice: string; sellPrice: string };
  variant?: { id: string; name: string; sku: string } | null;
  store?: { id: string; name: string };
}

export interface StockMovement {
  id: string;
  tenantId: string;
  storeId: string;
  productId: string;
  variantId?: string | null;
  type: StockMovementType;
  quantityChange: number;
  quantityAfter: number;
  referenceId?: string | null;
  referenceType?: string | null;
  notes?: string | null;
  performedBy: string;
  createdAt: string;
  product?: { id: string; name: string; sku: string };
  variant?: { id: string; name: string; sku: string } | null;
  user?: { id: string; firstName: string; lastName: string };
  store?: { id: string; name: string };
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  fromStoreId: string;
  toStoreId: string;
  transferNumber: string;
  status: TransferStatus;
  notes?: string | null;
  createdBy: string;
  completedAt?: string | null;
  createdAt: string;
  fromStore?: { id: string; name: string; code?: string };
  toStore?: { id: string; name: string; code?: string };
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transferId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  // NEW: now populated by backend joins
  product?: { id: string; name: string; sku: string; costPrice?: string; sellPrice?: string };
  variant?: { id: string; name: string; sku: string } | null;
}

// -- Matches backend adjustStockSchema exactly --
export interface AdjustStockInput {
  storeId: string;
  productId: string;
  variantId?: string | null;
  quantityChange: number;
  type: StockMovementType;
  notes?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
}

// -- Matches backend setStockSchema exactly --
export interface SetStockInput {
  storeId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  notes?: string | null;
}

// -- Matches backend updateThresholdSchema exactly --
export interface UpdateThresholdInput {
  lowStockThreshold: number;
}

// -- Matches backend createTransferSchema exactly --
// NEW: items now accept optional variantId (was silently dropped before)
export interface CreateTransferInput {
  fromStoreId: string;
  toStoreId: string;
  notes?: string | null;
  items: {
    productId: string;
    variantId?: string | null;
    quantity: number;
  }[];
}

// -- Query params matching backend schemas --
export interface ListStockParams {
  storeId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListMovementsParams {
  storeId?: string;
  productId?: string;
  variantId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// NEW: `storeId` is the OR-filter across from/to; the exact-match fields are
// still available for advanced filtering.
export interface ListTransfersParams {
  storeId?: string;
  fromStoreId?: string;
  toStoreId?: string;
  status?: TransferStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
