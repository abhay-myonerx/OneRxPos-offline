import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";

/**
 * Drug identity API (Phase 2.1). Reads the shared Health-Canada DPD catalog and
 * links a tenant Product to a DIN / sets a schedule override.
 */

export type DrugScheduleCategory = "NEEDS_RX" | "NARCOTIC" | "BEHIND_COUNTER" | "OPEN";

export interface DrugIngredient {
  name: string;
  strength?: string;
}

export interface DrugProductDto {
  din: string;
  brandName: string;
  company: string | null;
  form: string | null;
  route: string | null;
  activeIngredients: DrugIngredient[];
  scheduleClass: string | null;
  scheduleCategory: DrugScheduleCategory;
  status: string | null;
  npn: string | null;
}

export const drugApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    searchDrugProducts: build.query<DrugProductDto[], { search: string; limit?: number }>({
      query: ({ search, limit }) => ({ url: "/drug-products", params: { search, limit } }),
      transformResponse: (res: ApiResponse<DrugProductDto[]>) => res.data,
    }),
    getDrugProduct: build.query<DrugProductDto, { din: string }>({
      query: ({ din }) => `/drug-products/${din}`,
      transformResponse: (res: ApiResponse<DrugProductDto>) => res.data,
    }),
    linkProductDrug: build.mutation<{ id: string; din: string | null }, { id: string; din: string | null }>({
      query: ({ id, din }) => ({ url: `/products/${id}/drug`, method: "PUT", body: { din } }),
      transformResponse: (res: ApiResponse<{ id: string; din: string | null }>) => res.data,
      invalidatesTags: ["Product"],
    }),
    setScheduleOverride: build.mutation<
      { id: string; scheduleOverride: DrugScheduleCategory | null },
      { id: string; scheduleOverride: DrugScheduleCategory | null }
    >({
      query: ({ id, scheduleOverride }) => ({
        url: `/products/${id}/schedule-override`,
        method: "PUT",
        body: { scheduleOverride },
      }),
      transformResponse: (res: ApiResponse<{ id: string; scheduleOverride: DrugScheduleCategory | null }>) =>
        res.data,
      invalidatesTags: ["Product"],
    }),
  }),
});

export const {
  useLazySearchDrugProductsQuery,
  useGetDrugProductQuery,
  useLazyGetDrugProductQuery,
  useLinkProductDrugMutation,
  useSetScheduleOverrideMutation,
} = drugApi;

// ── Shared display helpers ───────────────────────────────────────────────────

export const SCHEDULE_LABELS: Record<DrugScheduleCategory, string> = {
  NEEDS_RX: "Prescription",
  NARCOTIC: "Narcotic / Controlled",
  BEHIND_COUNTER: "Behind counter",
  OPEN: "Open sale",
};

export const SCHEDULE_OPTIONS: { value: DrugScheduleCategory; label: string }[] = (
  ["NEEDS_RX", "NARCOTIC", "BEHIND_COUNTER", "OPEN"] as const
).map((v) => ({ value: v, label: SCHEDULE_LABELS[v] }));
