// Mirrors the backend Prisma `Role` enum (see /docs/v2 RBAC matrix §1.1).
// v2 added HR_MANAGER, ACCOUNTANT, EMPLOYEE in backend migration
// 20260519185616_role_enum_append.
export enum Role {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  CASHIER = "CASHIER",
  HR_MANAGER = "HR_MANAGER",
  ACCOUNTANT = "ACCOUNTANT",
  EMPLOYEE = "EMPLOYEE",
}
