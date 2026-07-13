"use client";

import React, { useState } from "react";
import { Shield, CheckCircle2, Minus, Users, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { useListUsersQuery, useUpdateUserMutation } from "@/features/users/api/users.api";
import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types/enums/role.enums";
import { ROLE_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/permissions/permissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";

type PermGroup = {
  label: string;
  perms: Array<{ key: Permission; label: string }>;
};

const PERM_GROUPS: PermGroup[] = [
  {
    label: "Sales",
    perms: [
      { key: PERMISSIONS.SALE_CREATE, label: "Create Sales" },
      { key: PERMISSIONS.SALE_READ, label: "View All Sales" },
      { key: PERMISSIONS.SALE_READ_OWN, label: "View Own Sales" },
      { key: PERMISSIONS.SALE_VOID, label: "Void Sales" },
      { key: PERMISSIONS.SALE_RETURN, label: "Process Returns" },
    ],
  },
  {
    label: "Products & Inventory",
    perms: [
      { key: PERMISSIONS.PRODUCT_READ, label: "View Products" },
      { key: PERMISSIONS.PRODUCT_WRITE, label: "Manage Products" },
      { key: PERMISSIONS.CATEGORY_READ, label: "View Categories" },
      { key: PERMISSIONS.CATEGORY_WRITE, label: "Manage Categories" },
      { key: PERMISSIONS.INVENTORY_READ, label: "View Inventory" },
      { key: PERMISSIONS.INVENTORY_WRITE, label: "Manage Inventory" },
    ],
  },
  {
    label: "Customers & Suppliers",
    perms: [
      { key: PERMISSIONS.CUSTOMER_READ, label: "View Customers" },
      { key: PERMISSIONS.CUSTOMER_WRITE, label: "Manage Customers" },
      { key: PERMISSIONS.SUPPLIER_READ, label: "View Suppliers" },
      { key: PERMISSIONS.SUPPLIER_WRITE, label: "Manage Suppliers" },
    ],
  },
  {
    label: "Finance",
    perms: [
      { key: PERMISSIONS.PURCHASE_READ, label: "View Purchases" },
      { key: PERMISSIONS.PURCHASE_WRITE, label: "Manage Purchases" },
      { key: PERMISSIONS.PURCHASE_RECEIVE, label: "Receive Stock" },
      { key: PERMISSIONS.EXPENSE_READ, label: "View Expenses" },
      { key: PERMISSIONS.EXPENSE_WRITE, label: "Manage Expenses" },
      { key: PERMISSIONS.REPORT_READ, label: "View Reports" },
      { key: PERMISSIONS.REPORT_READ_OWN, label: "View Own Reports" },
      { key: PERMISSIONS.REPORT_EXPORT, label: "Export Reports" },
    ],
  },
  {
    label: "Administration",
    perms: [
      { key: PERMISSIONS.USER_MANAGE, label: "Manage All Users" },
      { key: PERMISSIONS.USER_MANAGE_STORE, label: "Manage Store Users" },
      { key: PERMISSIONS.STORE_MANAGE, label: "Manage Stores" },
      { key: PERMISSIONS.TENANT_MANAGE, label: "Tenant Settings" },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: "System Settings" },
      { key: PERMISSIONS.SHIFT_MANAGE, label: "Manage Shifts" },
      { key: PERMISSIONS.SHIFT_OWN, label: "Own Shift" },
      { key: PERMISSIONS.RECEIPT_READ, label: "View Receipt Templates" },
      { key: PERMISSIONS.RECEIPT_WRITE, label: "Manage Receipt Templates" },
      { key: PERMISSIONS.RECEIPT_GENERATE, label: "Generate Receipts" },
    ],
  },
  // HR permission keys use the v2 dotted notation granted by the backend
  // (see ROLE_PERMISSIONS for HR_MANAGER). They are cast to Permission to
  // match the existing typing convention used throughout the RBAC config.
  {
    label: "HR — Employees",
    perms: [
      { key: "hr.employees.read" as Permission, label: "View Employees" },
      { key: "hr.employees.create" as Permission, label: "Add Employees" },
      { key: "hr.employees.update" as Permission, label: "Update Employees" },
      {
        key: "hr.employees.read.salary" as Permission,
        label: "View Salary Details",
      },
      {
        key: "hr.employees.terminate" as Permission,
        label: "Terminate Employees",
      },
      {
        key: "hr.departments.manage" as Permission,
        label: "Manage Departments",
      },
      {
        key: "hr.designations.manage" as Permission,
        label: "Manage Designations",
      },
      { key: "hr.contracts.read" as Permission, label: "View Contracts" },
    ],
  },
  {
    label: "HR — Attendance & Shifts",
    perms: [
      {
        key: "hr.attendance.read.team" as Permission,
        label: "View Team Attendance",
      },
      {
        key: "hr.attendance.read.all" as Permission,
        label: "View All Attendance",
      },
      {
        key: "hr.attendance.regularize.approve" as Permission,
        label: "Approve Corrections",
      },
      { key: "hr.shifts.read" as Permission, label: "View Shifts" },
      {
        key: "hr.shifts.schedule.create" as Permission,
        label: "Manage Shift Schedules",
      },
    ],
  },
  {
    label: "HR — Leave & Holidays",
    perms: [
      {
        key: "hr.leave.types.manage" as Permission,
        label: "Manage Leave Types",
      },
      {
        key: "hr.leave.policies.manage" as Permission,
        label: "Manage Leave Policies",
      },
      {
        key: "hr.leave.balances.adjust" as Permission,
        label: "Adjust Leave Balances",
      },
      {
        key: "hr.leave.request.approve" as Permission,
        label: "Approve Leave Requests",
      },
      { key: "hr.holidays.manage" as Permission, label: "Manage Holidays" },
    ],
  },
  {
    label: "HR — Payroll",
    perms: [
      { key: "hr.payroll.read" as Permission, label: "View Payroll" },
      {
        key: "hr.payroll.salary-structure.manage" as Permission,
        label: "Manage Salary Structures",
      },
      {
        key: "hr.payroll.run.create" as Permission,
        label: "Create Payroll Run",
      },
      { key: "hr.payroll.run.process" as Permission, label: "Process Payroll" },
      {
        key: "hr.payroll.read.payslip.all" as Permission,
        label: "View All Payslips",
      },
    ],
  },
  {
    label: "Self-Service (Employee)",
    perms: [
      { key: "ess.attendance.check-in" as Permission, label: "Clock In / Out" },
      {
        key: "ess.attendance.regularize" as Permission,
        label: "Request Attendance Fix",
      },
      {
        key: "ess.leave.request.create" as Permission,
        label: "Request Leave",
      },
      {
        key: "ess.shifts.swap.request" as Permission,
        label: "Request Shift Swap",
      },
      { key: "ess.payslips.read" as Permission, label: "View Own Payslips" },
    ],
  },
];

// SUPER_ADMIN is excluded from the visual matrix — it inherits all
// permissions by design and doesn't need a column in the reference table.
// HR_MANAGER and EMPLOYEE are included so the HR / self-service rows above
// have at least one meaningful column.
const MATRIX_ROLES = [
  Role.CASHIER,
  Role.MANAGER,
  Role.ADMIN,
  Role.HR_MANAGER,
  Role.EMPLOYEE,
] as const;

const ROLE_BADGE: Record<string, string> = {
  [Role.CASHIER]: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  [Role.MANAGER]: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
  [Role.ADMIN]: "bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300",
  [Role.SUPER_ADMIN]: "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300",
  [Role.HR_MANAGER]: "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300",
  [Role.EMPLOYEE]: "bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300",
};

function roleLabel(role: string) {
  if (role === Role.HR_MANAGER) return "HR Manager";
  return role.charAt(0) + role.slice(1).toLowerCase().replace("_", " ");
}

/**
 * Two-panel RBAC view: a read-only permission matrix showing what each role
 * can do, plus an inline role-reassignment panel for eligible users.
 * Admins can only change Manager/Cashier roles; SUPER_ADMIN can also change
 * Admin roles, enforcing a clear authority hierarchy.
 */
export default function PermissionsPage() {
  const user = useAppSelector((s) => s.auth.user);
  const [updateUser] = useUpdateUserMutation();
  const [pendingChange, setPendingChange] = useState<{
    userId: string;
    role: string;
  } | null>(null);

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const isAdmin = user?.role === Role.ADMIN;
  const canManage = isSuperAdmin || isAdmin;

  // Admins cannot escalate another user to their own level or above.
  const manageableRoles: Role[] = isSuperAdmin
    ? [Role.ADMIN, Role.MANAGER, Role.CASHIER]
    : isAdmin
      ? [Role.MANAGER, Role.CASHIER]
      : [];

  const { data, isLoading } = useListUsersQuery({}, { skip: !canManage });
  const managedUsers = (data?.data ?? []).filter(
    (u) => manageableRoles.includes(u.role as Role) && u.id !== user?.id,
  );

  const getRoleOptions = (currentRole: Role) => {
    const pool: Role[] = isSuperAdmin
      ? [Role.ADMIN, Role.MANAGER, Role.CASHIER]
      : [Role.MANAGER, Role.CASHIER];
    return pool
      .filter((r) => r !== currentRole)
      .map((r) => ({ value: r as string, label: roleLabel(r) }));
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUser({
        id: userId,
        data: { role: newRole as "ADMIN" | "MANAGER" | "CASHIER" },
      }).unwrap();
      showSuccess("Role updated");
      setPendingChange(null);
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <>
      <PageHeader
        title="Role Permissions"
        description="Review what each role can do, and reassign user roles."
      />

      {/* Permission Matrix */}
      <Card className="mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary-600 dark:text-primary-300" />
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Permission Matrix
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
            (read-only reference)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider w-1/2">
                  Permission
                </th>
                {MATRIX_ROLES.map((role) => (
                  <th
                    key={role}
                    className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${
                        ROLE_BADGE[role]
                      }`}
                    >
                      {roleLabel(role)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERM_GROUPS.map((group) => (
                <React.Fragment key={group.label}>
                  <tr className="bg-slate-50/60">
                    <td
                      colSpan={MATRIX_ROLES.length + 1}
                      className="px-5 py-2 text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.perms.map(({ key, label }) => (
                    <tr
                      key={key}
                      className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
                    >
                      <td className="px-5 py-2.5 text-[13px] text-slate-600 dark:text-slate-300 pl-8">
                        {label}
                      </td>
                      {MATRIX_ROLES.map((role) => {
                        const granted = (ROLE_PERMISSIONS[role] as readonly string[]).includes(key);
                        return (
                          <td key={role} className="px-4 py-2.5 text-center">
                            {granted ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                            ) : (
                              <Minus className="h-3.5 w-3.5 text-slate-200 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* User Role Assignment */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-600 dark:text-primary-300" />
          <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100">
            User Role Assignment
          </h2>
          {canManage && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
              {isSuperAdmin
                ? "Managing Admins, Managers & Cashiers"
                : "Managing Managers & Cashiers"}
            </span>
          )}
        </div>

        {!canManage ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            You don&apos;t have permission to manage user roles.
          </div>
        ) : isLoading ? (
          <div className="p-6">
            <Loading />
          </div>
        ) : managedUsers.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            No users to manage.
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {managedUsers.map((u) => {
              const options = getRoleOptions(u.role as Role);
              const editing = pendingChange?.userId === u.id;

              return (
                <div
                  key={u.id}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center text-primary-700 dark:text-primary-300 font-medium text-sm shrink-0">
                    {u.firstName[0]}
                    {u.lastName[0]}
                  </div>

                  {/* Name / email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">
                      {u.firstName} {u.lastName}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {u.email}
                    </p>
                  </div>

                  {/* Store */}
                  {u.store && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 hidden sm:block">
                      {u.store.name}
                    </span>
                  )}

                  {/* Role / edit controls */}
                  {editing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        options={[
                          {
                            value: u.role,
                            label: `${roleLabel(u.role)} (current)`,
                          },
                          ...options,
                        ]}
                        value={pendingChange.role}
                        onChange={(e) => setPendingChange({ userId: u.id, role: e.target.value })}
                        className="text-xs h-8 w-44"
                      />
                      <button
                        onClick={() => handleRoleChange(u.id, pendingChange.role)}
                        disabled={pendingChange.role === u.role}
                        className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setPendingChange(null)}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                          ROLE_BADGE[u.role] ??
                          "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {roleLabel(u.role)}
                      </span>
                      {options.length > 0 && (
                        <button
                          onClick={() => setPendingChange({ userId: u.id, role: u.role })}
                          className="text-[11px] text-primary-600 dark:text-primary-300 hover:text-primary-700 font-medium flex items-center gap-0.5 transition-colors"
                        >
                          Change <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
