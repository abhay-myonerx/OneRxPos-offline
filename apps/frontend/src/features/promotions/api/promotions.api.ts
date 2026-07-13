import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type {
  Promotion,
  CreatePromotionInput,
  CouponValidationResult,
} from "../types/promotion.types";

export const promotionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listPromotions: build.query<Promotion[], void>({
      query: () => "/promotions",
      transformResponse: (res: ApiResponse<Promotion[]>) => res.data,
      providesTags: ["Promotion"],
    }),
    createPromotion: build.mutation<Promotion, CreatePromotionInput>({
      query: (body) => ({ url: "/promotions", method: "POST", body }),
      transformResponse: (res: ApiResponse<Promotion>) => res.data,
      invalidatesTags: ["Promotion"],
    }),
    updatePromotion: build.mutation<Promotion, { id: string; data: Partial<CreatePromotionInput> }>({
      query: ({ id, data }) => ({ url: `/promotions/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Promotion>) => res.data,
      invalidatesTags: ["Promotion"],
    }),
    setPromotionActive: build.mutation<Promotion, { id: string; isActive: boolean }>({
      query: ({ id, isActive }) => ({ url: `/promotions/${id}/activate`, method: "POST", body: { isActive } }),
      transformResponse: (res: ApiResponse<Promotion>) => res.data,
      invalidatesTags: ["Promotion"],
    }),
    deletePromotion: build.mutation<void, string>({
      query: (id) => ({ url: `/promotions/${id}`, method: "DELETE" }),
      invalidatesTags: ["Promotion"],
    }),
    validateCoupon: build.mutation<
      CouponValidationResult,
      { code: string; items?: { productId: string; quantity: number; unitPrice: number; variantId?: string | null; discount?: number }[]; customerId?: string | null }
    >({
      query: (body) => ({ url: "/promotions/validate-coupon", method: "POST", body }),
      transformResponse: (res: ApiResponse<CouponValidationResult>) => res.data,
    }),
  }),
});

export const {
  useListPromotionsQuery,
  useCreatePromotionMutation,
  useUpdatePromotionMutation,
  useSetPromotionActiveMutation,
  useDeletePromotionMutation,
  useValidateCouponMutation,
} = promotionsApi;
