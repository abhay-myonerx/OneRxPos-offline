export interface ProductRow {
  id: string;
  tenantId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  costPrice: string;
  sellPrice: string;
  taxGroupId: string | null;
  productType: string | null;
  updatedAt: string | null;
}

export interface CustomerRow {
  id: string;
  tenantId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  currentBalance: string;
  groupId: string | null;
  updatedAt: string | null;
}

export interface SaleRow {
  id: string;
  tenantId: string | null;
  storeId: string | null;
  invoiceNo: string | null;
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
  paidAmount: string;
  dueAmount: string;
  changeAmount: string;
  status: string | null;
  cashierId: string | null;
  shiftId: string | null;
  customerId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SaleItemRow {
  id: string;
  saleId: string;
  productId: string | null;
  variantId: string | null;
  quantity: string;
  unitPrice: string;
  costPrice: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface PaymentRow {
  id: string;
  tenantId: string | null;
  saleId: string;
  method: string | null;
  amount: string;
  referenceNo: string | null;
  status: string | null;
  createdAt: string | null;
}

export interface LocalStore {
  upsertProduct(p: ProductRow): void;
  getProduct(id: string): ProductRow | null;
  upsertCustomer(c: CustomerRow): void;
  getCustomer(id: string): CustomerRow | null;
  recordSale(sale: SaleRow, items: SaleItemRow[], payments: PaymentRow[]): void;
  getSale(id: string): { sale: SaleRow; items: SaleItemRow[]; payments: PaymentRow[] } | null;
}
