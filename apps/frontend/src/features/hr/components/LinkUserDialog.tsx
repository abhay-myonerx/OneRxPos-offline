"use client";

// LinkUserDialog — wires `POST /api/v2/hr/employees/:id/link-user`.
//
// Two modes (mirrors backend `linkUserSchema`):
//   - "existing"  — link an existing user (by id picked from a search)
//   - "create"    — mint a new user atomically
//
// Surfaced on the Employee detail page when an employee has no
// `userId` AND the actor holds `hr.employees.update`. The
// `users.create` permission gate (for the "create" mode) is enforced
// by the backend; we hide the create-mode tab when the actor lacks
// it client-side as a UX shortcut.

import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form/form-field";

import { useListUsersQuery } from "@/features/users/api/users.api";
import { useLinkEmployeeUserMutation } from "@/features/hr/api/employees.api";
import type { CreateUserRole, EmployeeWithUser } from "@/features/hr/types/hr.types";

import { showApiError, showSuccess } from "@/lib/api/error-handler";

interface Props {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
  onLinked: (result: EmployeeWithUser) => void;
  canCreateUser: boolean;
  availableUserRoles: CreateUserRole[];
}

export function LinkUserDialog({
  employeeId,
  employeeName,
  open,
  onClose,
  onLinked,
  canCreateUser,
  availableUserRoles,
}: Props) {
  const [mode, setMode] = useState<"existing" | "create">(canCreateUser ? "create" : "existing");

  // ── Existing-user mode state ──────────────────────────────────────
  const [search, setSearch] = useState("");
  const { data: usersPage } = useListUsersQuery(
    { search, limit: 10 },
    { skip: !open || mode !== "existing" },
  );
  // Backend tenant-scopes the search and returns 409 if the chosen
  // user is already linked to another employee — so we don't pre-
  // filter by `employeeId` here (the list endpoint doesn't surface
  // that field yet). The UX falls back to a clear error toast on
  // submit if the operator picks a linked user.
  const candidates = usersPage?.data ?? [];
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // ── Create-user mode state ────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CreateUserRole>(availableUserRoles[0] ?? "EMPLOYEE");
  const [password, setPassword] = useState("");

  const [linkUser, { isLoading }] = useLinkEmployeeUserMutation();

  async function submitExisting() {
    if (!selectedUserId) return;
    try {
      const result = await linkUser({
        id: employeeId,
        data: { userId: selectedUserId },
      }).unwrap();
      showSuccess("User linked");
      onLinked(result);
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  async function submitCreate() {
    try {
      const result = await linkUser({
        id: employeeId,
        data: {
          createUser: {
            email,
            role,
            ...(password ? { password } : {}),
          },
        },
      }).unwrap();
      showSuccess("User created and linked");
      onLinked(result);
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  const canShowCreateTab = canCreateUser && availableUserRoles.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Link a user to ${employeeName}`}
      description="Linking gives this employee access to ESS endpoints (/api/v2/me/*) using their own credentials."
      size="md"
      primaryAction={{
        label: mode === "create" ? "Create & link" : "Link",
        onClick: mode === "create" ? submitCreate : submitExisting,
        loading: isLoading,
        disabled: mode === "create" ? !email : !selectedUserId,
      }}
      secondaryAction={{
        label: "Cancel",
        onClick: onClose,
      }}
    >
      <div className="space-y-4">
        {canShowCreateTab && (
          <div
            role="tablist"
            className="inline-flex rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-1"
          >
            <Button
              type="button"
              size="sm"
              variant={mode === "create" ? "primary" : "ghost"}
              onClick={() => setMode("create")}
            >
              Create new user
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "existing" ? "primary" : "ghost"}
              onClick={() => setMode("existing")}
            >
              Link existing user
            </Button>
          </div>
        )}

        {mode === "create" && canShowCreateTab && (
          <div className="space-y-4">
            <FormField label="Login email" required>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@example.com"
              />
            </FormField>
            <FormField label="Role" required>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as CreateUserRole)}
                options={availableUserRoles.map((r) => ({
                  value: r,
                  label: r.replace("_", " "),
                }))}
              />
            </FormField>
            <FormField
              label="Temporary password"
              hint="Leave empty to auto-generate (shown once after linking)."
            >
              <Input
                type="text"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="(auto-generate)"
                minLength={8}
              />
            </FormField>
          </div>
        )}

        {mode === "existing" && (
          <div className="space-y-4">
            <FormField
              label="Search users by name or email"
              hint="Backend returns 409 if the user you pick is already linked to another employee."
            >
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to search…"
              />
            </FormField>
            <FormField label="Select user" required>
              <Select
                value={selectedUserId}
                onValueChange={(v) => setSelectedUserId(v as string)}
                placeholder="— pick one —"
                searchable
                options={candidates.map((u) => ({
                  value: u.id,
                  label: `${u.firstName} ${u.lastName} (${u.email}) · ${u.role}`,
                }))}
              />
            </FormField>
            {candidates.length === 0 && search && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No users match your search.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
