import { SaleStatus, PaymentMethod, PaymentStatus } from "@/types/enums/status.enums";

export interface Sale {
  id: string;
  tenantId: string;
  storeId: string;
  customerId?: string | null;
  cashierId: string;
  shiftId?: string | null;
  invoiceNo: string;
  subtotal: string;
  taxTotal: string;
  discountAmount: string;
  grandTotal: string;
  paidAmount: string;
  dueAmount: string;
  changeAmount: string;
  status: SaleStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SaleItem[];
  payments?: SalePayment[];
  customer?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  cashier?: { id: string; firstName: string; lastName: string } | null;
  store?: { id: string; name: string; code: string } | null;
  shift?: { id: string; openedAt: string } | null;
  _count?: { items: number };
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: string;
  costPrice: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  product?: { id: string; name: string; sku: string; barcode?: string | null };
  variant?: { id: string; name: string; sku: string } | null;
}

export interface SalePayment {
  id: string;
  tenantId: string;
  saleId?: string | null;
  customerId?: string | null;
  method: PaymentMethod;
  amount: string;
  referenceNo?: string | null;
  status: PaymentStatus;
  notes?: string | null;
  createdAt: string;
}

export interface SaleListParams {
  storeId?: string;
  customerId?: string;
  cashierId?: string;
  status?: SaleStatus;
  invoiceNo?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "grandTotal" | "invoiceNo";
  sortOrder?: "asc" | "desc";
}

export interface VoidSaleInput {
  notes?: string | null;
}

export interface ReturnSaleInput {
  notes?: string | null;
  items?: { saleItemId: string; quantity: number }[];
}
