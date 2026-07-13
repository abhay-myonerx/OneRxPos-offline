import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { BarcodeTemplate, MatchType, Strategy, TemplateConfig } from "./types";

/**
 * Barcode template CRUD (Phase 1.3c). Backed by `/api/v1/barcode-templates`
 * (baseApi's v1 root). Reads are till-wide; writes are admin-gated server-side
 * (`settings:manage`). The learned templates are fetched once on POS load and
 * fed into the pure decode pipeline.
 */

/** The server row (adds timestamps to the decode-time `BarcodeTemplate`). */
export interface BarcodeTemplateDto extends BarcodeTemplate {
  createdAt: string;
  updatedAt: string;
}

export interface UpsertBarcodeTemplateInput {
  name: string;
  matchType: MatchType;
  matchValue: string;
  strategy: Strategy;
  config: TemplateConfig;
  isActive?: boolean;
}

export const barcodeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listBarcodeTemplates: build.query<BarcodeTemplateDto[], void>({
      query: () => "/barcode-templates",
      transformResponse: (res: ApiResponse<BarcodeTemplateDto[]>) => res.data,
      providesTags: ["BarcodeTemplate"],
    }),
    createBarcodeTemplate: build.mutation<BarcodeTemplateDto, UpsertBarcodeTemplateInput>({
      query: (body) => ({ url: "/barcode-templates", method: "POST", body }),
      transformResponse: (res: ApiResponse<BarcodeTemplateDto>) => res.data,
      invalidatesTags: ["BarcodeTemplate"],
    }),
    updateBarcodeTemplate: build.mutation<
      BarcodeTemplateDto,
      { id: string } & Partial<UpsertBarcodeTemplateInput>
    >({
      query: ({ id, ...body }) => ({ url: `/barcode-templates/${id}`, method: "PUT", body }),
      transformResponse: (res: ApiResponse<BarcodeTemplateDto>) => res.data,
      invalidatesTags: ["BarcodeTemplate"],
    }),
    deleteBarcodeTemplate: build.mutation<void, { id: string }>({
      query: ({ id }) => ({ url: `/barcode-templates/${id}`, method: "DELETE" }),
      invalidatesTags: ["BarcodeTemplate"],
    }),
  }),
});

export const {
  useListBarcodeTemplatesQuery,
  useCreateBarcodeTemplateMutation,
  useUpdateBarcodeTemplateMutation,
  useDeleteBarcodeTemplateMutation,
} = barcodeApi;
