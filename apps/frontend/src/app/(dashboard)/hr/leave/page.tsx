"use client";

import { useState } from "react";
import { Link, Navigate } from "@/shell/nav";
import { Archive, CalendarDays, Edit, Plus, RefreshCw, Scale, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import {
  useListLeaveTypesQuery,
  useCreateLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  useDeactivateLeaveTypeMutation,
  useReactivateLeaveTypeMutation,
} from "@/features/hr/api/leave.api";
import type { CreateLeaveTypeInput, LeaveType } from "@/features/hr/types/leave.types";

const EMPTY: CreateLeaveTypeInput = {
  name: "",
  code: "",
  isPaid: true,
  maxConsecutiveDays: null,
  requiresDocument: false,
  color: "#4263eb",
};

export default function LeaveTypesPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.leave.types.read", "hr.leave.types.manage", "ess.leave.types.read");
  const canManage = can("hr.leave.types.manage");
  const canReadRequests = canAny(
    "hr.leave.request.read.own",
    "hr.leave.request.read.team",
    "hr.leave.request.read.all",
    "ess.leave.request.read",
  );

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<CreateLeaveTypeInput>(EMPTY);
  const [pendingDeactivate, setPendingDeactivate] = useState<LeaveType | null>(null);

  const { data, isLoading, isError, refetch } = useListLeaveTypesQuery(
    {
      search: search.trim() || undefined,
      ...(showInactive ? {} : { isActive: true }),
    },
    { skip: !canRead },
  );

  const [create, { isLoading: creating }] = useCreateLeaveTypeMutation();
  const [update, { isLoading: updating }] = useUpdateLeaveTypeMutation();
  const [deactivate, { isLoading: deactivating }] = useDeactivateLeaveTypeMutation();
  const [reactivate] = useReactivateLeaveTypeMutation();

  if (!canRead) {
    // Leave Types is HR-admin config. Roles that can't read types but
    // can see leave requests (e.g. a MANAGER approving team leave, or an
    // ESS user viewing their own) are routed to the requests view rather
    // than hitting a dead permission-denied wall.
    if (canReadRequests) return <Navigate to={ROUTES.HR_LEAVE_REQUESTS} replace />;
    return (
      <PermissionDenied
        title="You don't have permission to view leave types."
        missingPermission="hr.leave.types.read"
      />
    );
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(t: LeaveType) {
    setEditing(t);
    setForm({
      name: t.name,
      code: t.code,
      isPaid: t.isPaid,
      maxConsecutiveDays: t.maxConsecutiveDays,
      requiresDocument: t.requiresDocument,
      color: t.color ?? "#4263eb",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await update({ id: editing.id, data: form }).unwrap();
        showSuccess("Leave type updated");
      } else {
        await create(form).unwrap();
        showSuccess("Leave type created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleDeactivate() {
    if (!pendingDeactivate) return;
    try {
      await deactivate(pendingDeactivate.id).unwrap();
      showSuccess("Leave type deactivated");
      setPendingDeactivate(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleReactivate(t: LeaveType) {
    try {
      await reactivate(t.id).unwrap();
      showSuccess("Leave type reactivated");
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Leave Types"
        description="Catalogue of leave categories (Annual, Sick, Maternity, etc.) with entitlement and documentation rules."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.HR_LEAVE_POLICIES}>
              <Button variant="outline" icon={<Scale className="h-4 w-4" />}>
                Policies
              </Button>
            </Link>
            <Link href={ROUTES.HR_LEAVE_REQUESTS}>
              <Button variant="outline" icon={<CalendarDays className="h-4 w-4" />}>
                Requests
              </Button>
            </Link>
            <Link href={ROUTES.HR_LEAVE_BALANCES}>
              <Button variant="outline" icon={<Wallet className="h-4 w-4" />}>
                Balances
              </Button>
            </Link>
            {canManage && (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                New leave type
              </Button>
            )}
          </div>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            placeholder="Search by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:flex-1"
          />
          <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Include inactive
          </label>
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load leave types." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No leave types yet"
          message={
            canManage
              ? "Create your first leave type to begin managing employee leave."
              : "Ask your HR administrator to set up leave types."
          }
          icon={<CalendarDays className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                Create leave type
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <Card key={t.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div
                    className="h-10 w-10 rounded-md flex-shrink-0"
                    style={{ background: t.color ?? "#4263eb" }}
                    aria-hidden
                  />
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{t.code}</p>
                  </div>
                </div>
                <Badge variant={t.isActive ? "success" : "outline"}>
                  {t.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm text-slate-700 dark:text-slate-200">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pay</p>
                  <p className="font-medium">{t.isPaid ? "Paid" : "Unpaid"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Max consecutive</p>
                  <p className="font-medium">
                    {t.maxConsecutiveDays ?? "—"} {t.maxConsecutiveDays != null ? "days" : ""}
                  </p>
                </div>
                {t.requiresDocument && (
                  <div className="col-span-2">
                    <Badge variant="outline" className="text-xs">
                      Documentation required
                    </Badge>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(t)}
                    icon={<Edit className="h-4 w-4" />}
                  >
                    Edit
                  </Button>
                  {t.isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingDeactivate(t)}
                      icon={<Archive className="h-4 w-4" />}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReactivate(t)}
                      icon={<RefreshCw className="h-4 w-4" />}
                    >
                      Reactivate
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit leave type" : "New leave type"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={100}
              />
            </FormField>
            <FormField label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. ANNUAL"
                required
                maxLength={50}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Max consecutive days">
              <Input
                type="number"
                min={1}
                value={form.maxConsecutiveDays ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxConsecutiveDays: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="Unlimited"
              />
            </FormField>
            <FormField label="Color">
              <Input
                type="color"
                value={form.color ?? "#4263eb"}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </FormField>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.isPaid ?? true}
                onChange={(e) => setForm({ ...form, isPaid: e.target.checked })}
              />
              Paid leave
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.requiresDocument ?? false}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiresDocument: e.target.checked,
                  })
                }
              />
              Requires documentation
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editing ? "Save changes" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDeactivate}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Deactivate this leave type?"
        description={
          pendingDeactivate
            ? `"${pendingDeactivate.name}" will be hidden from active lists and cannot be used for new requests. Existing balances and requests are unaffected. You can reactivate it later.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivating}
      />
    </>
  );
}
