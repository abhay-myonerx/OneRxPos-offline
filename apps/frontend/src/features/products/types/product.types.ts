import { ProductType } from "@/types/enums/status.enums";
import type { LevyMode, TaxCategory } from "rx-pos-shared";

/** A levy row attached to a product, as returned by `productLevies: { include: { levy: true } }`. */
export interface ProductLevy {
  productId: string;
  levyId: string;
  levy: {
    id: string;
    code: string;
    name: string;
    mode: LevyMode;
    /** Decimal string: dollars (FLAT_*) or percent (PERCENT). */
    amount: string;
    taxable: boolean;
    effectiveFrom: string;
    effectiveTo?: string | null;
    isActive: boolean;
  };
}

/** Store summary embedded on stock rows by the product-detail endpoint. */
export interface StoreStockStore {
  id: string;
  name: string;
  code: string;
}

/** Per-variant inventory row when listing/detail includes stock scoped by store. */
export interface VariantStoreStock {
  storeId: string;
  variantId: string;
  quantity: number;
  lowStockThreshold: number;
  store?: StoreStockStore;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId?: string | null;
  name: string;
  slug: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  productType: ProductType;
  costPrice: string;
  sellPrice: string;
  taxGroupId?: string | null;
  /** Drives the shared pricing engine's federal/provincial treatment (rx-pos-shared). */
  taxCategory: TaxCategory;
  taxInclusive: boolean;
  image?: string | null;
  weight?: string | null;
  warrantyMonths?: number | null;
  expiryDate?: string | null;
  isActive: boolean;
  /** Phase 2.1 pharmacy: DIN link into the shared drug catalog (null = not a drug). */
  din?: string | null;
  /** Phase 2.1 pharmacy: per-product schedule override (null = use the catalog category). */
  scheduleOverride?: "NEEDS_RX" | "NARCOTIC" | "BEHIND_COUNTER" | "OPEN" | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string } | null;
  taxGroup?: { id: string; name: string; rate: string; isInclusive: boolean } | null;
  variants?: ProductVariant[];
  storeStock?: {
    storeId: string;
    quantity: number;
    lowStockThreshold: number;
    store?: StoreStockStore;
  }[];
  productLevies?: ProductLevy[];
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode?: string | null;
  costPrice?: string | null;
  sellPrice?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  storeStock?: VariantStoreStock[];
}

export interface CreateProductInput {
  name: string;
  sku: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  productType?: ProductType;
  costPrice: number;
  sellPrice: number;
  taxGroupId?: string | null;
  /** Drives the shared pricing engine's federal/provincial treatment (rx-pos-shared). */
  taxCategory?: TaxCategory;
  taxInclusive?: boolean;
  /** Ids of levies (rx-pos-shared `Levy`) attached to this product. */
  levyIds?: string[];
  image?: string | null;
  weight?: number | null;
  warrantyMonths?: number | null;
  expiryDate?: string | null;
  variants?: UpsertVariantInput[];
}

export interface UpdateProductInput {
  name?: string;
  sku?: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  costPrice?: number;
  sellPrice?: number;
  taxGroupId?: string | null;
  taxCategory?: TaxCategory;
  taxInclusive?: boolean;
  levyIds?: string[];
  image?: string | null;
  weight?: number | null;
  warrantyMonths?: number | null;
  expiryDate?: string | null;
  isActive?: boolean;
}

export interface UpsertVariantInput {
  name: string;
  sku: string;
  barcode?: string | null;
  costPrice?: number | null;
  sellPrice?: number | null;
  isActive?: boolean;
}

export const TAX_CATEGORY_OPTIONS: { value: TaxCategory; label: string }[] = [
  { value: "STANDARD", label: "Standard" },
  { value: "ZERO_RATED", label: "Zero-rated" },
  { value: "PROVINCIAL_RELIEF", label: "Provincial relief" },
  { value: "EXEMPT", label: "Exempt" },
];

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  productType?: ProductType;
  isActive?: boolean;
  storeId?: string | null;
  sortBy?: "createdAt" | "name" | "sellPrice" | "costPrice";
  sortOrder?: "asc" | "desc";
}

// 3H.2 multi-vendor per product
export interface ProductVendor {
  id: string;
  productId: string;
  supplierId: string;
  supplierSku: string | null;
  costPrice: string | number;
  leadTimeDays: number | null;
  minOrderQty: number | null;
  reorderQty: number | null;
  isPreferred: boolean;
  autoEmail: boolean | null;
  isActive: boolean;
  isCheapest?: boolean;
}

export interface AddProductVendorInput {
  supplierId: string;
  costPrice: number;
  supplierSku?: string | null;
  leadTimeDays?: number | null;
  minOrderQty?: number | null;
  reorderQty?: number | null;
  isPreferred?: boolean;
  autoEmail?: boolean | null;
}
