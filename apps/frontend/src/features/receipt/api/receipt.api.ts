import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type {
  ReceiptTemplate,
  UpsertReceiptTemplateInput,
  ReceiptData,
} from "../types/receipt.types";

export const receiptApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getReceiptTemplate: build.query<ReceiptTemplate, void>({
      query: () => "/receipts/template",
      transformResponse: (res: ApiResponse<ReceiptTemplate>) => res.data,
      providesTags: ["Receipt"],
    }),

    upsertReceiptTemplate: build.mutation<ReceiptTemplate, UpsertReceiptTemplateInput>({
      query: (body) => ({ url: "/receipts/template", method: "PUT", body }),
      transformResponse: (res: ApiResponse<ReceiptTemplate>) => res.data,
      invalidatesTags: ["Receipt"],
    }),

    getReceiptData: build.query<ReceiptData, { saleId: string; duplicate?: boolean }>({
      query: ({ saleId, duplicate }) => ({
        url: `/receipts/sale/${saleId}`,
        params: { format: "data", ...(duplicate ? { duplicate: true } : {}) },
      }),
      transformResponse: (res: ApiResponse<ReceiptData>) => res.data,
    }),

    getReceiptHtml: build.query<string, { saleId: string; duplicate?: boolean }>({
      query: ({ saleId, duplicate }) => ({
        url: `/receipts/sale/${saleId}`,
        params: { format: "html", ...(duplicate ? { duplicate: true } : {}) },
        responseHandler: "text",
      }),
    }),

    // Auto-print the sale receipt to the store's network printer (Phase 2.11).
    printSaleReceipt: build.mutation<
      { ok: boolean; reason?: string },
      { saleId: string; deviceId?: string }
    >({
      query: ({ saleId, ...body }) => ({
        url: `/receipts/sale/${saleId}/print`,
        method: "POST",
        body,
      }),
      transformResponse: (res: ApiResponse<{ ok: boolean; reason?: string }>) => res.data,
    }),
  }),
});

export const {
  useGetReceiptTemplateQuery,
  useUpsertReceiptTemplateMutation,
  useGetReceiptDataQuery,
  useLazyGetReceiptHtmlQuery,
  usePrintSaleReceiptMutation,
} = receiptApi;
