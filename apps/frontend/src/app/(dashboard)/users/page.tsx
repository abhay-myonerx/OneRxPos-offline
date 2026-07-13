"use client";

import { useState } from "react";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Users as UsersIcon,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import {
  useListUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useResetPasswordMutation,
} from "@/features/users/api/users.api";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import { formatTimeAgo } from "@/lib/date/format-date";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { CreatableUserRole, CreateUserInput } from "@/features/users/types/user.types";

// Roles that an admin is allowed to create. SUPER_ADMIN is intentionally
// excluded — that role can only be assigned at the database level.
// HR_MANAGER and EMPLOYEE were added in the v2 hotfix (2026-05-24); they
// were missing from the v1 trio and the TS literal union rejected the cast.
const ROLE_OPTIONS: ReadonlyArray<{
  value: CreatableUserRole;
  label: string;
}> = [
  { value: "ADMIN", label: "Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "HR_MANAGER", label: "HR Manager" },
  { value: "CASHIER", label: "Cashier" },
  { value: "EMPLOYEE", label: "Employee" },
];

/**
 * Tenant user management: list, create, edit, deactivate, and admin password-reset.
 * "Delete" is a soft-deactivation — the record is preserved for audit trails.
 * Password reset is a privileged admin action; the user must know their own
 * current password for self-service changes (see ProfilePage/PasswordSection).
 */
export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateUserInput>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    role: "CASHIER",
  });

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [resetTarget, setResetTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [pwError, setPwError] = useState("");

  const { data, isLoading } = useListUsersQuery({
    search: search || undefined,
    role: (roleFilter as CreatableUserRole) || undefined,
    storeId: storeFilter || undefined,
    page,
    limit: 20,
  });
  const { data: stores } = useListStoresQuery({});
  const [create, { isLoading: creating }] = useCreateUserMutation();
  const [update, { isLoading: updating }] = useUpdateUserMutation();
  const [remove, { isLoading: deleting }] = useDeleteUserMutation();
  const [resetPw, { isLoading: resetting }] = useResetPasswordMutation();

  const users = data?.data || [];
  const pagination = data?.pagination;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await update({
          id: editId,
          data: {
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            role: form.role,
            storeId: form.storeId,
          },
        }).unwrap();
        showSuccess("User updated");
      } else {
        await create(form).unwrap();
        showSuccess("User created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id).unwrap();
      showSuccess("User deactivated");
      setDeleteTarget(null);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");

    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPwError("Must include at least one uppercase letter");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setPwError("Must include at least one lowercase letter");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setPwError("Must include at least one digit");
      return;
    }

    try {
      await resetPw({
        id: resetTarget!.id,
        data: { newPassword },
      }).unwrap();
      showSuccess("Password reset successfully");
      closeResetModal();
    } catch (err) {
      showApiError(err);
    }
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setNewPassword("");
    setShowNewPassword(false);
    setPwError("");
  };

  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader
        title="Users"
        description={`${pagination?.total || 0} users`}
        actions={
          <Button
            onClick={() => {
              setForm({
                email: "",
                password: "",
                firstName: "",
                lastName: "",
                role: "CASHIER",
              });
              setEditId(null);
              setModalOpen(true);
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            Add User
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            icon={<Search className="h-4 w-4" />}
            className="sm:max-w-xs"
          />
          <Select
            options={[
              { value: "", label: "All Roles" },
              ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
            ]}
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-[150px]"
          />
          <Select
            options={[
              { value: "", label: "All Stores" },
              ...(stores || []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={storeFilter}
            onChange={(e) => {
              setStoreFilter(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-[180px]"
          />
        </div>

        {!users.length ? (
          <Empty
            title="No users"
            icon={<UsersIcon className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          />
        ) : (
          <Table>
            <Thead>
              <Tr className="bg-slate-50/80">
                <Th>User</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Store</Th>
                <Th>Last Login</Th>
                <Th>Status</Th>
                <Th className="text-right pr-4">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.map((u) => (
                <Tr key={u.id} className="group">
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-500/20 ring-1 ring-primary-200/60 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                          {u.firstName[0]}
                          {u.lastName[0]}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {u.firstName} {u.lastName}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-slate-500 dark:text-slate-400">{u.email}</Td>
                  <Td>
                    <Badge
                      variant={
                        u.role === "ADMIN"
                          ? "info"
                          : u.role === "MANAGER"
                            ? "warning"
                            : u.role === "HR_MANAGER"
                              ? "success"
                              : "default"
                      }
                    >
                      {u.role.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                  <Td className="text-slate-600 dark:text-slate-300">
                    {u.store?.name || "All stores"}
                  </Td>
                  <Td className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {u.lastLoginAt ? formatTimeAgo(u.lastLoginAt) : "Never"}
                  </Td>
                  <Td>
                    <Badge variant={u.isActive ? "success" : "danger"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td className="pr-4">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edit user"
                        aria-label="Edit user"
                        icon={<Edit className="h-4 w-4" />}
                        className="text-slate-500 dark:text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                        onClick={() => {
                          setForm({
                            ...form,
                            firstName: u.firstName,
                            lastName: u.lastName,
                            email: u.email,
                            phone: u.phone,
                            role: u.role as CreatableUserRole,
                            storeId: u.storeId,
                          });
                          setEditId(u.id);
                          setModalOpen(true);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Reset password"
                        aria-label="Reset password"
                        icon={<KeyRound className="h-4 w-4" />}
                        className="text-warning-600 dark:text-warning-300 hover:bg-warning-50 hover:text-warning-700"
                        onClick={() =>
                          setResetTarget({
                            id: u.id,
                            name: `${u.firstName} ${u.lastName}`,
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Deactivate user"
                        aria-label="Deactivate user"
                        icon={<Trash2 className="h-4 w-4" />}
                        className="text-error-600 dark:text-error-300 hover:bg-error-50 hover:text-error-700"
                        onClick={() =>
                          setDeleteTarget({
                            id: u.id,
                            name: `${u.firstName} ${u.lastName}`,
                          })
                        }
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit User" : "New User"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First Name" required>
              <Input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </FormField>
            <FormField label="Last Name" required>
              <Input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </FormField>
          </div>
          {!editId && (
            <FormField label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
          )}
          {!editId && (
            <FormField label="Password" required>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 8 chars, uppercase + lowercase + digit"
              />
            </FormField>
          )}
          <FormField label="Phone">
            <Input
              value={form.phone || ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value || null })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Role" required>
              <Select
                options={ROLE_OPTIONS.map((r) => ({
                  value: r.value,
                  label: r.label,
                }))}
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as CreatableUserRole,
                  })
                }
              />
            </FormField>
            <FormField label="Store">
              <Select
                options={(stores || []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                placeholder="All stores"
                value={form.storeId || ""}
                onChange={(e) => setForm({ ...form, storeId: e.target.value || null })}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Deactivate User"
        description={`Are you sure you want to deactivate ${deleteTarget?.name}? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />

      <Modal open={!!resetTarget} onClose={closeResetModal} title="Reset Password" size="sm">
        <form onSubmit={handleResetPassword} className="space-y-4">
          {/* User info banner */}
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/15 rounded-xl border border-amber-100 dark:border-amber-500/30">
            <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
              <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {resetTarget?.name}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300">
                This will immediately change their password
              </p>
            </div>
          </div>

          {/* Password input */}
          <FormField label="New Password" error={pwError} required>
            <div className="relative">
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="Min 8 chars, uppercase + lowercase + digit"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (pwError) setPwError("");
                }}
                error={!!pwError}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </FormField>

          {/* Strength hints */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              { ok: newPassword.length >= 8, label: "8+ characters" },
              { ok: /[A-Z]/.test(newPassword), label: "Uppercase letter" },
              { ok: /[a-z]/.test(newPassword), label: "Lowercase letter" },
              { ok: /\d/.test(newPassword), label: "Number" },
            ].map((rule) => (
              <p
                key={rule.label}
                className={`text-xs flex items-center gap-1.5 ${rule.ok ? "text-success-600 dark:text-success-300" : "text-slate-400 dark:text-slate-500"}`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${rule.ok ? "bg-success-500" : "bg-slate-300"}`}
                />
                {rule.label}
              </p>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={closeResetModal}>
              Cancel
            </Button>
            <Button type="submit" loading={resetting}>
              Reset Password
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
