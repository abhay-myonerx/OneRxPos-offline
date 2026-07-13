export interface Supplier {
  id: string;
  tenantId: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  balance: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierInput {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
}

export interface UpdateSupplierInput {
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  isActive?: boolean;
}

export interface ListSuppliersParams {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "name" | "balance";
  sortOrder?: "asc" | "desc";
}
