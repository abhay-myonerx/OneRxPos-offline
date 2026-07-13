"use client";

// HR — Leave balances: per-employee, per-leave-type balance for a cycle year.
//
// Balance formula: available = entitled + carried − used − pending
//   entitled  — days allocated at the start of the cycle (or via policy accrual)
//   carried   — days rolled over from the previous cycle
//   used      — days consumed by approved/past leave
//   pending   — days held by open (not-yet-decided) requests
//
// Two distinct write operations share the same API endpoint:
//   Adjust  — delta (+/-) applied to an existing balance record; requires reason
//   Allocate — creates a brand-new balance record for an employee/type/year
//              combination (used for annual entitlement provisioning)

import { useState } from "react";
import { Plus, Wallet } from "lucide-react";

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

import {
  useListLeaveBalancesQuery,
  useListLeaveTypesQuery,
  useAdjustLeaveBalanceMutation,
} from "@/features/hr/api/leave.api";
import { useListEmployeesQuery } from "@/features/hr/api/employees.api";
import type { LeaveBalance, LeaveBalanceAdjustInput } from "@/features/hr/types/leave.types";

type Scope = "self" | "team" | "all";

interface AdjustForm {
  entitledDaysDelta: string;
  carriedDaysDelta: string;
  reason: string;
}

interface AllocateForm {
  employeeId: string;
  leaveTypeId: string;
  cycleYear: string;
  entitledDays: string;
  reason: string;
}

const EMPTY_ADJUST: AdjustForm = {
  entitledDaysDelta: "",
  carriedDaysDelta: "",
  reason: "",
};

const EMPTY_ALLOCATE: AllocateForm = {
  employeeId: "",
  leaveTypeId: "",
  cycleYear: String(new Date().getFullYear()),
  entitledDays: "",
  reason: "Initial leave allocation",
};

export default function LeaveBalancesPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny(
    "hr.leave.balances.read.own",
    "hr.leave.balances.read.team",
    "hr.leave.balances.read.all",
    "ess.leave.balance.read",
  );
  const canManage = can("hr.leave.balances.adjust");

  // Non-HR users only see their own balance; managers default to "all" so they
  // can spot shortfalls before approving leave requests.
  const defaultScope: Scope = canManage ? "all" : "self";
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [filterLeaveTypeId, setFilterLeaveTypeId] = useState<string>("");

  // Adjust existing balance
  const [adjustTarget, setAdjustTarget] = useState<LeaveBalance | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(EMPTY_ADJUST);

  // Allocate new balance
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocateForm, setAllocateForm] = useState<AllocateForm>(EMPTY_ALLOCATE);

  const { data, isLoading, isError, refetch } = useListLeaveBalancesQuery(
    {
      scope,
      cycleYear: year,
      leaveTypeId: filterLeaveTypeId || undefined,
    },
    { skip: !canRead },
  );

  const { data: typesData } = useListLeaveTypesQuery({ isActive: true }, { skip: !canRead });

  const { data: employeesData } = useListEmployeesQuery(
    { limit: 100, archived: "active", sortBy: "firstName", sortOrder: "asc" },
    { skip: !canRead },
  );

  const [adjust, { isLoading: adjusting }] = useAdjustLeaveBalanceMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view leave balances."
        missingPermission="ess.leave.balance.read"
      />
    );
  }

  const items = data?.data ?? [];
  const leaveTypes = typesData?.data ?? [];
  const employees = employeesData?.data ?? [];

  // ── Adjust existing balance ──────────────────────────────────────────────────

  function openAdjust(b: LeaveBalance) {
    setAdjustTarget(b);
    setAdjustForm(EMPTY_ADJUST);
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustTarget) return;
    const payload: LeaveBalanceAdjustInput = {
      employeeId: adjustTarget.employeeId,
      leaveTypeId: adjustTarget.leaveTypeId,
      cycleYear: adjustTarget.cycleYear,
      reason: adjustForm.reason.trim(),
    };
    if (adjustForm.entitledDaysDelta !== "")
      payload.entitledDaysDelta = Number(adjustForm.entitledDaysDelta);
    if (adjustForm.carriedDaysDelta !== "")
      payload.carriedDaysDelta = Number(adjustForm.carriedDaysDelta);
    if (!payload.reason) {
      showApiError({
        data: {
          error: { code: "VALIDATION_ERROR", message: "Reason is required." },
        },
      });
      return;
    }
    try {
      await adjust(payload).unwrap();
      showSuccess("Balance adjusted");
      setAdjustTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  // ── Allocate new balance ─────────────────────────────────────────────────────

  function openAllocate() {
    setAllocateForm(EMPTY_ALLOCATE);
    setAllocateOpen(true);
  }

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault();

    if (!allocateForm.employeeId) {
      showApiError({
        data: { error: { code: "VALIDATION_ERROR", message: "Select an employee." } },
      });
      return;
    }
    if (!allocateForm.leaveTypeId) {
      showApiError({
        data: { error: { code: "VALIDATION_ERROR", message: "Select a leave type." } },
      });
      return;
    }
    if (!allocateForm.entitledDays || Number(allocateForm.entitledDays) <= 0) {
      showApiError({
        data: {
          error: { code: "VALIDATION_ERROR", message: "Entitled days must be greater than 0." },
        },
      });
      return;
    }
    if (!allocateForm.reason.trim()) {
      showApiError({
        data: { error: { code: "VALIDATION_ERROR", message: "Reason is required." } },
      });
      return;
    }

    const payload: LeaveBalanceAdjustInput = {
      employeeId: allocateForm.employeeId,
      leaveTypeId: allocateForm.leaveTypeId,
      cycleYear: Number(allocateForm.cycleYear),
      entitledDaysDelta: Number(allocateForm.entitledDays),
      reason: allocateForm.reason.trim(),
    };

    try {
      await adjust(payload).unwrap();
      showSuccess("Leave balance allocated successfully");
      setAllocateOpen(false);
      refetch();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Leave Balances"
        description="Per-employee leave balance for the selected cycle year. Available = entitled + carried − used − pending."
        actions={
          canManage ? (
            <Button onClick={openAllocate} icon={<Plus className="h-4 w-4" />}>
              Allocate balance
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {canManage && (
            <Select
              value={scope}
              onValueChange={(v) => setScope((Array.isArray(v) ? v[0] : v) as Scope)}
              options={[
                { value: "self", label: "My balances" },
                { value: "team", label: "My team" },
                { value: "all", label: "All employees" },
              ]}
            />
          )}
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2100}
            className="w-28"
          />
          <Select
            value={filterLeaveTypeId}
            onValueChange={(v) => setFilterLeaveTypeId(Array.isArray(v) ? v[0] : v)}
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
        <ErrorDisplay message="Could not load balances." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No leave balances found"
          message={
            canManage
              ? 'Click "Allocate balance" to assign leave days to an employee.'
              : "No leave balance has been allocated yet."
          }
          icon={<Wallet className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={openAllocate} icon={<Plus className="h-4 w-4" />}>
                Allocate balance
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500 dark:text-slate-400">
                <th className="pb-3 pr-4 font-medium">Employee</th>
                <th className="pb-3 pr-4 font-medium">Leave type</th>
                <th className="pb-3 pr-4 font-medium text-right">Entitled</th>
                <th className="pb-3 pr-4 font-medium text-right">Carried</th>
                <th className="pb-3 pr-4 font-medium text-right">Used</th>
                <th className="pb-3 pr-4 font-medium text-right">Pending</th>
                <th className="pb-3 pr-4 font-medium text-right">
                  <span className="text-[#4263eb] font-semibold">Available</span>
                </th>
                {canManage && <th className="pb-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {items.map((b) => {
                const lt = b.leaveType ?? leaveTypes.find((t) => t.id === b.leaveTypeId);
                const emp = employees.find((e) => e.id === b.employeeId);
                const avail = parseFloat(b.availableDays);
                return (
                  <tr key={b.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 pr-4">
                      {emp ? (
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {emp.firstName} {emp.lastName}
                          <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 font-mono">
                            {emp.employeeCode}
                          </span>
                        </span>
                      ) : (
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {b.employeeId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {lt?.color && (
                          <span
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ background: lt.color }}
                            aria-hidden
                          />
                        )}
                        {lt?.name ?? b.leaveTypeId}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right">{b.entitledDays}</td>
                    <td className="py-3 pr-4 text-right">{b.carriedDays}</td>
                    <td className="py-3 pr-4 text-right">{b.usedDays}</td>
                    <td className="py-3 pr-4 text-right">{b.pendingDays}</td>
                    <td className="py-3 pr-4 text-right">
                      {/* Negative available days (avail < 0) can occur when
                          an approved request exceeds the balance — flag clearly. */}
                      <Badge variant={avail < 0 ? "danger" : avail === 0 ? "outline" : "success"}>
                        {b.availableDays}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openAdjust(b)}>
                          Adjust
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

      {/* ── Adjust existing balance modal ──────────────────────────────────── */}
      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title="Adjust leave balance"
      >
        {adjustTarget && (
          <form onSubmit={handleAdjust} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Enter positive or negative deltas. Both fields are optional — at least one must be
              provided.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Entitled delta (days)">
                <Input
                  type="number"
                  step={0.5}
                  value={adjustForm.entitledDaysDelta}
                  onChange={(e) =>
                    setAdjustForm({
                      ...adjustForm,
                      entitledDaysDelta: e.target.value,
                    })
                  }
                  placeholder="e.g. +5 or -2"
                />
              </FormField>
              <FormField label="Carried delta (days)">
                <Input
                  type="number"
                  step={0.5}
                  value={adjustForm.carriedDaysDelta}
                  onChange={(e) =>
                    setAdjustForm({
                      ...adjustForm,
                      carriedDaysDelta: e.target.value,
                    })
                  }
                  placeholder="e.g. +3"
                />
              </FormField>
            </div>
            <FormField label="Reason" required>
              <Input
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                required
                placeholder="Reason for manual adjustment"
                maxLength={500}
              />
            </FormField>
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" type="button" onClick={() => setAdjustTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={adjusting}>
                Apply adjustment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Allocate new balance modal ─────────────────────────────────────── */}
      <Modal
        open={allocateOpen}
        onClose={() => setAllocateOpen(false)}
        title="Allocate leave balance"
      >
        <form onSubmit={handleAllocate} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Create a new leave balance for an employee. Use this to assign annual entitlements at
            the start of a leave cycle.
          </p>

          <FormField label="Employee" required>
            <Select
              value={allocateForm.employeeId}
              onValueChange={(v) =>
                setAllocateForm({ ...allocateForm, employeeId: Array.isArray(v) ? v[0] : v })
              }
              placeholder="Select employee…"
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.firstName} ${e.lastName} (${e.employeeCode})`,
              }))}
            />
          </FormField>

          <FormField label="Leave type" required>
            <Select
              value={allocateForm.leaveTypeId}
              onValueChange={(v) =>
                setAllocateForm({ ...allocateForm, leaveTypeId: Array.isArray(v) ? v[0] : v })
              }
              placeholder="Select leave type…"
              options={leaveTypes.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Cycle year" required>
              <Input
                type="number"
                min={2020}
                max={2100}
                value={allocateForm.cycleYear}
                onChange={(e) => setAllocateForm({ ...allocateForm, cycleYear: e.target.value })}
              />
            </FormField>
            <FormField label="Entitled days" required>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                max={365}
                value={allocateForm.entitledDays}
                onChange={(e) => setAllocateForm({ ...allocateForm, entitledDays: e.target.value })}
                placeholder="e.g. 14"
              />
            </FormField>
          </div>

          <FormField label="Reason" required>
            <Input
              value={allocateForm.reason}
              onChange={(e) => setAllocateForm({ ...allocateForm, reason: e.target.value })}
              required
              placeholder="e.g. Annual leave allocation 2026"
              maxLength={500}
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setAllocateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjusting}>
              Allocate
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
