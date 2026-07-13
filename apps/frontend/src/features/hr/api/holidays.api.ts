import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";

import { HR_V2_ROOT } from "./hr-base-url";

import type {
  CreateHolidayInput,
  Holiday,
  HolidayCalendarParams,
  HolidayCalendarView,
  HolidayImportPresetInput,
  HolidayImportPresetResult,
  HolidayListParams,
  UpdateHolidayInput,
} from "../types/leave.types";

const url = (path = "") => `${HR_V2_ROOT}/holidays${path}`;

export const holidaysApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getHolidayCalendar: build.query<HolidayCalendarView, HolidayCalendarParams>({
      query: (params) => ({
        url: url("/calendar"),
        params,
      }),
      transformResponse: (res: ApiResponse<HolidayCalendarView>) => res.data,
      providesTags: [{ type: "HrHoliday", id: "CALENDAR" }],
    }),

    importHolidayPreset: build.mutation<HolidayImportPresetResult, HolidayImportPresetInput>({
      query: (body) => ({ url: url("/import-preset"), method: "POST", body }),
      transformResponse: (res: ApiResponse<HolidayImportPresetResult>) => res.data,
      invalidatesTags: [
        { type: "HrHoliday", id: "LIST" },
        { type: "HrHoliday", id: "CALENDAR" },
      ],
    }),

    listHolidays: build.query<PaginatedResponse<Holiday>, HolidayListParams | void>({
      query: (params) => ({
        url: url("/"),
        params: params ?? undefined,
      }),
      providesTags: (res) =>
        res
          ? [
              { type: "HrHoliday" as const, id: "LIST" },
              ...res.data.map((h) => ({
                type: "HrHoliday" as const,
                id: h.id,
              })),
            ]
          : [{ type: "HrHoliday", id: "LIST" }],
    }),

    createHoliday: build.mutation<Holiday, CreateHolidayInput>({
      query: (body) => ({ url: url("/"), method: "POST", body }),
      transformResponse: (res: ApiResponse<Holiday>) => res.data,
      invalidatesTags: [
        { type: "HrHoliday", id: "LIST" },
        { type: "HrHoliday", id: "CALENDAR" },
      ],
    }),

    getHoliday: build.query<Holiday, string>({
      query: (id) => url(`/${id}`),
      transformResponse: (res: ApiResponse<Holiday>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "HrHoliday", id }],
    }),

    updateHoliday: build.mutation<Holiday, { id: string; data: UpdateHolidayInput }>({
      query: ({ id, data }) => ({
        url: url(`/${id}`),
        method: "PATCH",
        body: data,
      }),
      transformResponse: (res: ApiResponse<Holiday>) => res.data,
      invalidatesTags: (_r, _e, arg) => [
        { type: "HrHoliday", id: arg.id },
        { type: "HrHoliday", id: "LIST" },
        { type: "HrHoliday", id: "CALENDAR" },
      ],
    }),

    deactivateHoliday: build.mutation<Holiday, string>({
      query: (id) => ({ url: url(`/${id}`), method: "DELETE" }),
      transformResponse: (res: ApiResponse<Holiday>) => res.data,
      invalidatesTags: (_r, _e, id) => [
        { type: "HrHoliday", id },
        { type: "HrHoliday", id: "LIST" },
        { type: "HrHoliday", id: "CALENDAR" },
      ],
    }),
  }),
});

export const {
  useGetHolidayCalendarQuery,
  useImportHolidayPresetMutation,
  useListHolidaysQuery,
  useCreateHolidayMutation,
  useGetHolidayQuery,
  useUpdateHolidayMutation,
  useDeactivateHolidayMutation,
} = holidaysApi;
