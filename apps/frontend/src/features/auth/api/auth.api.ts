import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ChangePasswordRequest,
  AuthUser,
  RoleCaps,
} from "../types/auth.types";

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<AuthResponse, LoginRequest>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      transformResponse: (res: ApiResponse<AuthResponse>) => res.data,
    }),
    register: build.mutation<AuthResponse, RegisterRequest>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
      transformResponse: (res: ApiResponse<AuthResponse>) => res.data,
    }),
    // `discountCaps` (Phase 1.3a, Task 7 backend) rides along on the SAME
    // `/auth/me` payload every authenticated role already fetches on session
    // bootstrap — ring-up gating (Task 16) reads it from here rather than a
    // second (ADMIN-only) tenant-settings round-trip. Optional since older
    // cached responses / demo fixtures may not carry it; callers fall back
    // to `DEFAULT_ROLE_CAPS`.
    // `enabledSectors` (Phase 2.1) rides along on the same `/auth/me` payload —
    // the pharmacy UI gates on whether the tenant has the `pharmacy` sector on.
    // Tolerant of either backend shape (a slug->bool map or a slug list).
    getMe: build.query<
      {
        user: AuthUser;
        isDemoMode: boolean;
        discountCaps?: RoleCaps;
        enabledSectors?: Record<string, boolean>;
        sectors?: string[];
      },
      void
    >({
      query: () => "/auth/me",
      transformResponse: (
        res: ApiResponse<{
          user: AuthUser;
          isDemoMode: boolean;
          discountCaps?: RoleCaps;
          enabledSectors?: Record<string, boolean>;
          sectors?: string[];
        }>,
      ) => res.data,
      providesTags: ["Auth"],
    }),
    changePassword: build.mutation<{ success: boolean }, ChangePasswordRequest>({
      query: (body) => ({ url: "/auth/change-password", method: "POST", body }),
      transformResponse: (res: ApiResponse<{ success: boolean }>) => res.data,
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      // invalidatesTags: ["Auth"],
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGetMeQuery,
  useChangePasswordMutation,
  useLogoutMutation,
} = authApi;
