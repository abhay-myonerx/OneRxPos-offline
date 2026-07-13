import { PaymentMethod, PaymentStatus } from "@/types/enums/status.enums";

export interface Payment {
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
  sale?: { id: string; invoiceNo: string } | null;
}

export interface CollectDueInput {
  customerId: string;
  saleId?: string | null;
  method: PaymentMethod;
  amount: number;
  referenceNo?: string | null;
  notes?: string | null;
}

export interface ListPaymentsParams {
  saleId?: string;
  customerId?: string;
  method?: PaymentMethod;
  status?: PaymentStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "amount";
  sortOrder?: "asc" | "desc";
}
