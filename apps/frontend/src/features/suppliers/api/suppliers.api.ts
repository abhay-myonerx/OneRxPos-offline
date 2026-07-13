import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Supplier,
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSuppliersParams,
} from "../types/supplier.types";

export const suppliersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listSuppliers: build.query<
      { data: Supplier[]; pagination: PaginatedResponse<Supplier>["pagination"] },
      ListSuppliersParams
    >({
      query: (params) => ({ url: "/suppliers", params }),
      transformResponse: (res: PaginatedResponse<Supplier>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Supplier"],
    }),
    getSupplier: build.query<Supplier, string>({
      query: (id) => `/suppliers/${id}`,
      transformResponse: (res: ApiResponse<Supplier>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "Supplier", id }],
    }),
    createSupplier: build.mutation<Supplier, CreateSupplierInput>({
      query: (body) => ({ url: "/suppliers", method: "POST", body }),
      transformResponse: (res: ApiResponse<Supplier>) => res.data,
      invalidatesTags: ["Supplier"],
    }),
    updateSupplier: build.mutation<Supplier, { id: string; data: UpdateSupplierInput }>({
      query: ({ id, data }) => ({ url: `/suppliers/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Supplier>) => res.data,
      invalidatesTags: ["Supplier"],
    }),
    deleteSupplier: build.mutation<void, string>({
      query: (id) => ({ url: `/suppliers/${id}`, method: "DELETE" }),
      invalidatesTags: ["Supplier"],
    }),
  }),
});

export const {
  useListSuppliersQuery,
  useGetSupplierQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
} = suppliersApi;
