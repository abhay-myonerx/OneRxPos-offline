import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { Category, CreateCategoryInput, UpdateCategoryInput } from "../types/category.types";

export const categoriesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listCategories: build.query<Category[], void>({
      query: () => "/products/categories",
      transformResponse: (res: ApiResponse<Category[]>) => res.data,
      providesTags: ["Category"],
    }),
    getCategory: build.query<Category, string>({
      query: (id) => `/products/categories/${id}`,
      transformResponse: (res: ApiResponse<Category>) => res.data,
    }),
    createCategory: build.mutation<Category, CreateCategoryInput>({
      query: (body) => ({ url: "/products/categories", method: "POST", body }),
      transformResponse: (res: ApiResponse<Category>) => res.data,
      invalidatesTags: ["Category"],
    }),
    updateCategory: build.mutation<Category, { id: string; data: UpdateCategoryInput }>({
      query: ({ id, data }) => ({ url: `/products/categories/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Category>) => res.data,
      invalidatesTags: ["Category"],
    }),
    deleteCategory: build.mutation<void, string>({
      query: (id) => ({ url: `/products/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["Category"],
    }),
  }),
});

export const {
  useListCategoriesQuery,
  useGetCategoryQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} = categoriesApi;
