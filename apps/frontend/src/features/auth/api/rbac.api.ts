import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import { Role } from "@/types/enums/role.enums";

export interface RoleDescriptor {
  role: Role;
  description: string;
  scope: string;
  permissionCount: number;
  permissions: string[];
}

export interface MyPermissionsResponse {
  userId: string;
  tenantId: string;
  role: Role;
  permissions: string[];
}

export const rbacApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listRoles: build.query<RoleDescriptor[], void>({
      query: () => "/rbac/roles",
      transformResponse: (res: ApiResponse<RoleDescriptor[]>) => res.data,
    }),
    getRole: build.query<RoleDescriptor, Role>({
      query: (role) => `/rbac/roles/${role}`,
      transformResponse: (res: ApiResponse<RoleDescriptor>) => res.data,
    }),
    listPermissions: build.query<string[], void>({
      query: () => "/rbac/permissions",
      transformResponse: (res: ApiResponse<{ permissions: string[] }>) => res.data.permissions,
    }),
    getMyPermissions: build.query<MyPermissionsResponse, void>({
      query: () => "/rbac/me/permissions",
      transformResponse: (res: ApiResponse<MyPermissionsResponse>) => res.data,
    }),
  }),
});

export const {
  useListRolesQuery,
  useGetRoleQuery,
  useListPermissionsQuery,
  useGetMyPermissionsQuery,
} = rbacApi;
