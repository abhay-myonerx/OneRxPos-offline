import { LoyaltyTransactionType } from "@/types/enums/status.enums";

export interface Customer {
  id: string;
  tenantId: string;
  groupId?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  creditLimit: string;
  currentBalance: string;
  loyaltyPoints: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  group?: CustomerGroup | null;
  _count?: {
    sales: number;
    loyaltyTransactions?: number;
  };
}

export interface CustomerGroup {
  id: string;
  tenantId: string;
  name: string;
  discountPercent: string;
  pricingTier?: string | null;
  createdAt: string;
  _count?: { customers: number };
}

export interface CreateCustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  groupId?: string | null;
  creditLimit?: number;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  groupId?: string | null;
  creditLimit?: number;
  isActive?: boolean;
}

export interface CustomerListParams {
  search?: string;
  groupId?: string;
  isActive?: boolean;
  hasDue?: boolean;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "name" | "currentBalance" | "loyaltyPoints";
  sortOrder?: "asc" | "desc";
}

export interface CreateGroupInput {
  name: string;
  discountPercent?: number;
  pricingTier?: string | null;
}

export interface UpdateGroupInput {
  name?: string;
  discountPercent?: number;
  pricingTier?: string | null;
}

export interface AdjustPointsInput {
  points: number;
  notes?: string | null;
}

export interface CustomerLedger {
  customer: {
    id: string;
    name: string;
    currentBalance: string;
    creditLimit: string;
    loyaltyPoints: number;
  };
  sales: LedgerSale[];
  payments: LedgerPayment[];
}

export interface LedgerSale {
  id: string;
  invoiceNo: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  status: string;
  createdAt: string;
}

export interface LedgerPayment {
  id: string;
  amount: string;
  method: string;
  saleId?: string | null;
  createdAt: string;
}

export interface LoyaltyHistoryResponse {
  customer: {
    id: string;
    name: string;
    loyaltyPoints: number;
  };
  data: LoyaltyTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface AdjustPointsResponse {
  transaction: LoyaltyTransaction;
  newBalance: number;
}

export interface LoyaltyProgram {
  id: string;
  tenantId: string;
  isActive: boolean;
  earnRate: string;
  redeemRate: string;
  minRedeemPoints: number;
  tiers?: LoyaltyTier[];
}

export interface LoyaltyTier {
  id: string;
  name: string;
  minSpend: string;
  multiplier: string;
  sortOrder: number;
}

export interface LoyaltyTransaction {
  id: string;
  tenantId: string;
  customerId: string;
  type: LoyaltyTransactionType;
  points: number;
  saleId?: string | null;
  notes?: string | null;
  createdAt: string;
}

// 3H.6 statement (aging + open invoices)
export interface StatementOpenInvoice {
  saleId: string;
  invoiceNo: string;
  date: string;
  ageDays: number;
  bucket: "current" | "d31_60" | "d61_90" | "d90plus";
  grandTotal: number;
  dueAmount: number;
}
export interface CustomerStatementData {
  customer: { id: string; name: string; email: string | null };
  asOf: string;
  openInvoices: StatementOpenInvoice[];
  recentPayments: { date: string; method: string; amount: number }[];
  aging: { current: number; d31_60: number; d61_90: number; d90plus: number; total: number };
  currentBalance: number;
  reconciled: boolean;
}
