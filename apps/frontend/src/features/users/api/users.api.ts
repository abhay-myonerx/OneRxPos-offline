import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  ResetPasswordInput,
  UserListParams,
} from "../types/user.types";

export interface UpdateMyProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    updateMyProfile: build.mutation<User, UpdateMyProfileInput>({
      query: (body) => ({ url: "/users/me", method: "PATCH", body }),
      transformResponse: (res: ApiResponse<User>) => res.data,
      invalidatesTags: ["Auth", "User"],
    }),
    listUsers: build.query<
      { data: User[]; pagination: PaginatedResponse<User>["pagination"] },
      UserListParams & { page?: number; limit?: number }
    >({
      query: (params) => ({ url: "/users", params }),
      transformResponse: (res: PaginatedResponse<User>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["User"],
    }),
    getUser: build.query<User, string>({
      query: (id) => `/users/${id}`,
      transformResponse: (res: ApiResponse<User>) => res.data,
      providesTags: (_r, _e, id) => [{ type: "User", id }],
    }),
    createUser: build.mutation<User, CreateUserInput>({
      query: (body) => ({ url: "/users", method: "POST", body }),
      transformResponse: (res: ApiResponse<User>) => res.data,
      invalidatesTags: ["User"],
    }),
    updateUser: build.mutation<User, { id: string; data: UpdateUserInput }>({
      query: ({ id, data }) => ({ url: `/users/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<User>) => res.data,
      invalidatesTags: ["User"],
    }),
    resetPassword: build.mutation<void, { id: string; data: ResetPasswordInput }>({
      query: ({ id, data }) => ({ url: `/users/${id}/reset-password`, method: "POST", body: data }),
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `/users/${id}`, method: "DELETE" }),
      invalidatesTags: ["User"],
    }),
  }),
});

export const {
  useUpdateMyProfileMutation,
  useListUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  useDeleteUserMutation,
} = usersApi;
