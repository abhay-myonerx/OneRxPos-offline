import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Product,
  ProductVariant,
  CreateProductInput,
  UpdateProductInput,
  ProductListParams,
  UpsertVariantInput,
  ProductVendor,
  AddProductVendorInput,
} from "../types/product.types";

/** Cache tag id for a product's vendor list (scoped under the Product tag). */
const vendorsTag = (productId: string) => ({ type: "Product" as const, id: `VENDORS-${productId}` });

export interface BarcodeLookupResult {
  product: Product;
  matchedVariantId: string | null;
}

/** Some list/store-scoped endpoints omit variant flags or use snake_case; POS relies on boolean isActive. */
type VariantRaw = ProductVariant & { is_active?: boolean };

function coerceVariantIsActive(
  rawIsActive: unknown,
  rawIs_active: unknown,
  fallbackWhenUnset: boolean,
): boolean {
  const raw = rawIsActive ?? rawIs_active;
  if (raw === undefined || raw === null) return fallbackWhenUnset;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.toLowerCase();
    return s === "true" || s === "1";
  }
  if (typeof raw === "number") return raw !== 0;
  return Boolean(raw);
}

function normalizeProduct(product: Product): Product {
  if (!product.variants?.length) return product;
  const fallback = product.isActive !== false;
  return {
    ...product,
    variants: product.variants.map((v) => {
      const vr = v as VariantRaw;
      return {
        ...v,
        isActive: coerceVariantIsActive(vr.isActive, vr.is_active, fallback),
      };
    }),
  };
}

export const productsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listProducts: build.query<
      { data: Product[]; pagination: PaginatedResponse<Product>["pagination"] },
      ProductListParams
    >({
      query: (params) => ({ url: "/products", params }),
      transformResponse: (res: PaginatedResponse<Product>) => ({
        data: res.data.map(normalizeProduct),
        pagination: res.pagination,
      }),
      providesTags: ["Product"],
    }),
    getProduct: build.query<Product, string>({
      query: (id) => `/products/${id}`,
      transformResponse: (res: ApiResponse<Product>) => normalizeProduct(res.data),
      providesTags: (_r, _e, id) => [{ type: "Product", id }],
    }),
    lookupByBarcode: build.query<BarcodeLookupResult, string>({
      query: (barcode) => `/products/lookup/barcode/${encodeURIComponent(barcode)}`,
      transformResponse: (res: ApiResponse<BarcodeLookupResult>) => ({
        ...res.data,
        product: normalizeProduct(res.data.product),
      }),
    }),
    createProduct: build.mutation<Product, CreateProductInput>({
      query: (body) => ({ url: "/products", method: "POST", body }),
      transformResponse: (res: ApiResponse<Product>) => res.data,
      invalidatesTags: ["Product"],
    }),
    updateProduct: build.mutation<Product, { id: string; data: UpdateProductInput }>({
      query: ({ id, data }) => ({ url: `/products/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Product>) => res.data,
      invalidatesTags: ["Product"],
    }),
    deleteProduct: build.mutation<void, string>({
      query: (id) => ({ url: `/products/${id}`, method: "DELETE" }),
      invalidatesTags: ["Product"],
    }),
    addVariant: build.mutation<ProductVariant, { productId: string; data: UpsertVariantInput }>({
      query: ({ productId, data }) => ({
        url: `/products/${productId}/variants`,
        method: "POST",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ProductVariant>) => res.data,
      invalidatesTags: ["Product"],
    }),
    updateVariant: build.mutation<
      ProductVariant,
      { productId: string; variantId: string; data: UpsertVariantInput }
    >({
      query: ({ productId, variantId, data }) => ({
        url: `/products/${productId}/variants/${variantId}`,
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ProductVariant>) => res.data,
      invalidatesTags: ["Product"],
    }),
    deleteVariant: build.mutation<void, { productId: string; variantId: string }>({
      query: ({ productId, variantId }) => ({
        url: `/products/${productId}/variants/${variantId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Product"],
    }),
    bulkImport: build.mutation<{ imported: number }, { products: CreateProductInput[] }>({
      query: (body) => ({ url: "/products/bulk-import", method: "POST", body }),
      transformResponse: (res: ApiResponse<{ imported: number }>) => res.data,
      invalidatesTags: ["Product"],
    }),

    // ── 3H.2 multi-vendor ──────────────────────────────────────────────────
    getProductVendors: build.query<ProductVendor[], string>({
      query: (productId) => `/products/${productId}/vendors`,
      transformResponse: (res: ApiResponse<ProductVendor[]>) => res.data,
      providesTags: (_r, _e, productId) => [vendorsTag(productId)],
    }),
    addProductVendor: build.mutation<ProductVendor, { productId: string; data: AddProductVendorInput }>({
      query: ({ productId, data }) => ({ url: `/products/${productId}/vendors`, method: "POST", body: data }),
      transformResponse: (res: ApiResponse<ProductVendor>) => res.data,
      invalidatesTags: (_r, _e, { productId }) => [vendorsTag(productId)],
    }),
    updateProductVendor: build.mutation<
      ProductVendor,
      { productId: string; supplierId: string; data: Partial<AddProductVendorInput> }
    >({
      query: ({ productId, supplierId, data }) => ({
        url: `/products/${productId}/vendors/${supplierId}`,
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<ProductVendor>) => res.data,
      invalidatesTags: (_r, _e, { productId }) => [vendorsTag(productId)],
    }),
    removeProductVendor: build.mutation<void, { productId: string; supplierId: string }>({
      query: ({ productId, supplierId }) => ({
        url: `/products/${productId}/vendors/${supplierId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, { productId }) => [vendorsTag(productId)],
    }),
    setPreferredVendor: build.mutation<void, { productId: string; supplierId: string }>({
      query: ({ productId, supplierId }) => ({
        url: `/products/${productId}/vendors/${supplierId}/prefer`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, { productId }) => [vendorsTag(productId)],
    }),
  }),
});

export const {
  useListProductsQuery,
  useGetProductQuery,
  useLazyLookupByBarcodeQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useAddVariantMutation,
  useUpdateVariantMutation,
  useDeleteVariantMutation,
  useBulkImportMutation,
  useGetProductVendorsQuery,
  useAddProductVendorMutation,
  useUpdateProductVendorMutation,
  useRemoveProductVendorMutation,
  useSetPreferredVendorMutation,
} = productsApi;
