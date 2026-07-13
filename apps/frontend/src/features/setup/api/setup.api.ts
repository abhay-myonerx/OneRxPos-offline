import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type { AuthResponse, RegisterRequest } from "@/features/auth/types/auth.types";

export interface SetupStatus {
  setupRequired: boolean;
}

export interface CompleteSetupRequest extends RegisterRequest {
  accessCode: string;
}

export const setupApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSetupStatus: build.query<SetupStatus, void>({
      query: () => "/setup/status",
      transformResponse: (res: ApiResponse<SetupStatus>) => res.data,
    }),
    completeSetup: build.mutation<AuthResponse, CompleteSetupRequest>({
      query: (body) => ({ url: "/setup/complete", method: "POST", body }),
      transformResponse: (res: ApiResponse<AuthResponse>) => res.data,
    }),
  }),
});

export const { useGetSetupStatusQuery, useCompleteSetupMutation } = setupApi;
