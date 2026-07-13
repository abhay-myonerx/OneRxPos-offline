import { Role } from "@/types/enums/role.enums";

export interface User {
  id: string;
  tenantId: string;
  storeId?: string | null;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  store?: { id: string; name: string } | null;
  employeeId?: string | null;
}

export type CreatableUserRole = "ADMIN" | "MANAGER" | "HR_MANAGER" | "CASHIER" | "EMPLOYEE";

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: CreatableUserRole;
  storeId?: string | null;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  role?: CreatableUserRole;
  storeId?: string | null;
  isActive?: boolean;
}

export interface ResetPasswordInput {
  newPassword: string;
}

export interface UserListParams {
  search?: string;
  role?: CreatableUserRole;
  storeId?: string;
  isActive?: boolean;
}
