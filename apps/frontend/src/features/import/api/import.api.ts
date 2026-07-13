import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { ImportRequest, ImportResult } from "../types/import.types";

export const importApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    importCatalog: build.mutation<ImportResult, ImportRequest>({
      query: (body) => ({ url: "/import/catalog", method: "POST", body }),
      transformResponse: (res: ApiResponse<ImportResult>) => res.data,
      // A real commit changes products; a dry-run doesn't. Invalidate only on commit.
      invalidatesTags: (_r, _e, arg) => (arg.dryRun ? [] : ["Product"]),
    }),
  }),
});

export const { useImportCatalogMutation } = importApi;
