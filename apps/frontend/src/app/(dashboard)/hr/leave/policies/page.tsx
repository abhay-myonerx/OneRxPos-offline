"use client";
import { useState } from "react";
import { Link } from "@/shell/nav";
import { Edit, Plus, Scale } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
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
  useListLeavePoliciesQuery,
  useListLeaveTypesQuery,
  useCreateLeavePolicyMutation,
  useUpdateLeavePolicyMutation,
} from "@/features/hr/api/leave.api";
import type { CreateLeavePolicyInput, LeavePolicy } from "@/features/hr/types/leave.types";
import { ACCRUAL_METHOD_LABELS, LEAVE_ACCRUAL_METHODS } from "@/features/hr/types/leave.types";

// Policy defaults: 15 days annual lump (reasonable baseline for most locales).
// carryForwardMax null = unlimited carry-forward; carryForwardExpiryMonths null = never expires.
// minTenureMonths 0 = no probation gate (employee can request from day 1).
const EMPTY: CreateLeavePolicyInput = {
  leaveTypeId: "",
  entitledDaysPerYear: 15,
  accrualMethod: "ANNUAL_LUMP",
  carryForwardMax: null,
  carryForwardExpiryMonths: null,
  minTenureMonths: 0,
};

export default function LeavePoliciesPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.leave.policies.read", "hr.leave.policies.manage");
  const canManage = can("hr.leave.policies.manage");

  const [filterLeaveTypeId, setFilterLeaveTypeId] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LeavePolicy | null>(null);
  const [form, setForm] = useState<CreateLeavePolicyInput>(EMPTY);

  const { data, isLoading, isError, refetch } = useListLeavePoliciesQuery(
    {
      leaveTypeId: filterLeaveTypeId || undefined,
    },
    { skip: !canRead },
  );

  const { data: typesData } = useListLeaveTypesQuery({ isActive: true }, { skip: !canRead });

  const [create, { isLoading: creating }] = useCreateLeavePolicyMutation();
  const [update, { isLoading: updating }] = useUpdateLeavePolicyMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view leave policies."
        missingPermission="hr.leave.policies.read"
      />
    );
  }

  const leaveTypes = typesData?.data ?? [];

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, leaveTypeId: filterLeaveTypeId });
    setModalOpen(true);
  }

  function openEdit(p: LeavePolicy) {
    setEditing(p);
    setForm({
      leaveTypeId: p.leaveTypeId,
      entitledDaysPerYear: Number(p.entitledDaysPerYear),
      accrualMethod: p.accrualMethod,
      carryForwardMax: p.carryForwardMax == null ? null : Number(p.carryForwardMax),
      carryForwardExpiryMonths: p.carryForwardExpiryMonths,
      minTenureMonths: p.minTenureMonths,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.leaveTypeId) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please select a leave type.",
          },
        },
      });
      return;
    }
    try {
      if (editing) {
        await update({
          id: editing.id,
          data: {
            entitledDaysPerYear: form.entitledDaysPerYear,
            accrualMethod: form.accrualMethod,
            carryForwardMax: form.carryForwardMax,
            carryForwardExpiryMonths: form.carryForwardExpiryMonths,
            minTenureMonths: form.minTenureMonths,
          },
        }).unwrap();
        showSuccess("Policy updated");
      } else {
        await create(form).unwrap();
        showSuccess("Policy created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Leave Policies"
        description="Entitlement rules per leave type — days per year, carry-forward, accrual method, minimum tenure."
        actions={
          <div className="flex gap-2">
            <Link href={ROUTES.HR_LEAVE}>
              <Button variant="outline" icon={<Scale className="h-4 w-4" />}>
                Leave types
              </Button>
            </Link>
            {canManage && (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                New policy
              </Button>
            )}
          </div>
        }
      />

      {/* Accrual note — warns operators that MONTHLY_ACCRUAL / PER_WORKED_DAYS
          exist in the schema but require the background job (OI-036).
          Remove or update this banner when that job ships. */}
      <div className="mb-4 rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <strong>Note:</strong> Only <strong>Annual Lump</strong> accrual is active at launch.
        Monthly and per-worked-days strategies are managed manually until the accrual job (OI-036)
        ships.
      </div>

      <Card className="mb-6">
        <div className="flex items-center gap-3">
          <Select
            className="flex-1 max-w-xs"
            value={filterLeaveTypeId}
            onValueChange={(v) => setFilterLeaveTypeId(v as string)}
            placeholder="All leave types"
            clearable
            options={leaveTypes.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load policies." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No policies yet"
          message={
            canManage
              ? "Create a policy to define entitlement days for a leave type."
              : "Ask your HR administrator to set up leave policies."
          }
          icon={<Scale className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                Create policy
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500 dark:text-slate-400">
                <th className="pb-3 pr-4 font-medium">Leave Type</th>
                <th className="pb-3 pr-4 font-medium">Days / year</th>
                <th className="pb-3 pr-4 font-medium">Accrual</th>
                <th className="pb-3 pr-4 font-medium">Carry-forward</th>
                <th className="pb-3 pr-4 font-medium">Min tenure</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                {canManage && <th className="pb-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const lt = leaveTypes.find((t) => t.id === p.leaveTypeId);
                return (
                  <tr key={p.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 pr-4">
                      <span className="font-medium">
                        {p.leaveType?.name ?? lt?.name ?? p.leaveTypeId}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{p.entitledDaysPerYear}</td>
                    <td className="py-3 pr-4">{ACCRUAL_METHOD_LABELS[p.accrualMethod]}</td>
                    <td className="py-3 pr-4">
                      {p.carryForwardMax == null ? "None" : `${p.carryForwardMax} days`}
                      {p.carryForwardExpiryMonths != null && (
                        <span className="text-slate-400 dark:text-slate-500 ml-1">
                          (expires {p.carryForwardExpiryMonths}mo)
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {p.minTenureMonths === 0 ? "None" : `${p.minTenureMonths} months`}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={p.isActive ? "success" : "outline"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(p)}
                          icon={<Edit className="h-4 w-4" />}
                        >
                          Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit leave policy" : "New leave policy"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Leave type" required>
            <Select
              value={form.leaveTypeId}
              onValueChange={(v) => setForm({ ...form, leaveTypeId: v as string })}
              disabled={!!editing}
              placeholder="— select —"
              options={leaveTypes.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Days per year" required>
              <Input
                type="number"
                min={0}
                max={365}
                step={0.5}
                value={form.entitledDaysPerYear}
                onChange={(e) =>
                  setForm({
                    ...form,
                    entitledDaysPerYear: Number(e.target.value),
                  })
                }
                required
              />
            </FormField>
            <FormField label="Accrual method">
              <Select
                value={form.accrualMethod ?? "ANNUAL_LUMP"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    accrualMethod: v as typeof form.accrualMethod,
                  })
                }
                options={LEAVE_ACCRUAL_METHODS.map((m) => ({
                  value: m,
                  label: ACCRUAL_METHOD_LABELS[m],
                }))}
              />
            </FormField>
            <FormField label="Carry-forward max (days)">
              <Input
                type="number"
                min={0}
                value={form.carryForwardMax ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    carryForwardMax: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="None"
              />
            </FormField>
            <FormField label="Carry-forward expiry (months)">
              <Input
                type="number"
                min={1}
                value={form.carryForwardExpiryMonths ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    carryForwardExpiryMonths: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="Never"
              />
            </FormField>
            <FormField label="Min tenure (months)">
              <Input
                type="number"
                min={0}
                value={form.minTenureMonths ?? 0}
                onChange={(e) =>
                  setForm({
                    ...form,
                    minTenureMonths: Number(e.target.value),
                  })
                }
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editing ? "Save changes" : "Create policy"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
