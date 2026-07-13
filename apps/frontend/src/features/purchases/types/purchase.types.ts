import { PurchaseStatus, PaymentMethod } from "@/types/enums/status.enums";

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  supplierId: string;
  storeId: string;
  purchaseNo: string;
  status: PurchaseStatus;
  subtotal: string;
  taxTotal: string;
  shippingCost: string;
  grandTotal: string;
  paidAmount: string;
  expectedDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string };
  store?: { id: string; name: string };
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  variantId?: string | null;
  orderedQty: number;
  receivedQty: number;
  unitCost: string;
  lineTotal: string;
  product?: { id: string; name: string; sku: string };
  variant?: { id: string; name: string } | null;
}

export interface CreatePurchaseInput {
  supplierId: string;
  storeId: string;
  expectedDate?: string | null;
  shippingCost?: number;
  notes?: string | null;
  items: {
    productId: string;
    variantId?: string | null;
    orderedQty: number;
    unitCost: number;
  }[];
}

export interface ReceiveGoodsInput {
  items: {
    purchaseItemId: string;
    receivedQty: number;
  }[];
}

export interface AddPurchasePaymentInput {
  amount: number;
  method: PaymentMethod;
  referenceNo?: string | null;
  notes?: string | null;
}

export interface ListPurchasesParams {
  supplierId?: string;
  storeId?: string;
  status?: PurchaseStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "grandTotal" | "purchaseNo";
  sortOrder?: "asc" | "desc";
}
