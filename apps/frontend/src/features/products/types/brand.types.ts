export type ArchivedFilter = "active" | "archived" | "any";

export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
}

export interface BrandListParams {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "name" | "slug";
  sortOrder?: "asc" | "desc";
  search?: string;
  isActive?: boolean;
  archived?: ArchivedFilter;
}

export interface CreateBrandInput {
  name: string;
  slug?: string;
  description?: string | null;
  logo?: string | null;
  website?: string | null;
}

export type UpdateBrandInput = Partial<CreateBrandInput>;
