"use client";

import { useState } from "react";
import { Link } from "@/shell/nav";
import { Plus, Briefcase, Search, Archive, RotateCcw } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import {
  useListEmployeesQuery,
  useDeactivateEmployeeMutation,
  useRestoreEmployeeMutation,
} from "@/features/hr/api/employees.api";
import { useListDepartmentsQuery } from "@/features/hr/api/departments.api";
import { useListDesignationsQuery } from "@/features/hr/api/designations.api";

import { EMPLOYMENT_STATUSES } from "@/features/hr/types/hr.types";
import type {
  EmployeeListItem,
  EmploymentStatus,
  ArchivedFilter,
} from "@/features/hr/types/hr.types";

const STATUS_VARIANT: Partial<Record<EmploymentStatus, "success" | "info" | "warning" | "danger">> =
  {
    ACTIVE: "success",
    PROBATION: "info",
    ON_LEAVE: "info",
    SUSPENDED: "warning",
  };

function statusVariant(s: EmploymentStatus) {
  return STATUS_VARIANT[s] ?? "danger";
}

function initials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export default function EmployeesPage() {
  const { can } = usePermissions();
  const canRead = can("hr.employees.read");
  const canCreate = can("hr.employees.create");
  const canUpdate = can("hr.employees.update");

  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [designationId, setDesignationId] = useState<string>("");
  const [employmentStatus, setEmploymentStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const [pendingArchive, setPendingArchive] = useState<EmployeeListItem | null>(null);

  const { data, isLoading, isError, refetch } = useListEmployeesQuery(
    {
      search: search || undefined,
      archived,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
      employmentStatus: (employmentStatus || undefined) as EmploymentStatus | undefined,
      page,
      limit: 20,
    },
    { skip: !canRead },
  );

  const { data: deptData } = useListDepartmentsQuery(
    { limit: 100, archived: "active" },
    { skip: !canRead },
  );
  const { data: desigData } = useListDesignationsQuery(
    { limit: 100, archived: "active" },
    { skip: !canRead },
  );

  const [deactivate, { isLoading: deactivating }] = useDeactivateEmployeeMutation();
  const [restore] = useRestoreEmployeeMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view employees."
        missingPermission="hr.employees.read"
      />
    );
  }

  const employees = data?.data ?? [];
  const pagination = data?.pagination;

  async function handleArchive() {
    if (!pendingArchive) return;
    try {
      await deactivate(pendingArchive.id).unwrap();
      showSuccess("Employee deactivated");
      setPendingArchive(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleRestore(id: string) {
    try {
      await restore(id).unwrap();
      showSuccess("Employee restored");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage your team."
        actions={
          canCreate ? (
            <Button asChild icon={<Plus className="h-4 w-4" />}>
              <Link href={ROUTES.HR_EMPLOYEES_NEW}>New</Link>
            </Button>
          ) : null
        }
      />

      <Card className="mb-6" padding={false}>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Search employees…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={departmentId}
            onValueChange={(v) => {
              setDepartmentId(v as string);
              setPage(1);
            }}
            placeholder="All departments"
            clearable
            searchable
            options={(deptData?.data ?? []).map((d) => ({
              value: d.id,
              label: d.name,
            }))}
          />
          <Select
            value={designationId}
            onValueChange={(v) => {
              setDesignationId(v as string);
              setPage(1);
            }}
            placeholder="All designations"
            clearable
            searchable
            options={(desigData?.data ?? []).map((d) => ({
              value: d.id,
              label: d.title,
            }))}
          />
          <Select
            value={employmentStatus}
            onValueChange={(v) => {
              setEmploymentStatus(v as string);
              setPage(1);
            }}
            placeholder="All statuses"
            clearable
            options={EMPLOYMENT_STATUSES.map((s) => ({
              value: s,
              label: s.replace(/_/g, " "),
            }))}
          />
          <Select
            className="md:col-span-1 lg:col-span-2"
            value={archived}
            onValueChange={(v) => {
              setArchived(v as ArchivedFilter);
              setPage(1);
            }}
            options={[
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
              { value: "any", label: "All" },
            ]}
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Failed to load employees" onRetry={() => refetch()} />
      ) : employees.length === 0 ? (
        <Empty
          title="No employees"
          message={
            canCreate
              ? "Add your first team member to get started."
              : "Ask an HR admin to add employees."
          }
          icon={<Briefcase className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Start date</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-500/15 text-xs font-semibold text-primary-700 dark:text-primary-300">
                          {initials(e.firstName, e.lastName)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`${ROUTES.HR_EMPLOYEES}/${e.id}`}
                            className="font-medium text-slate-800 dark:text-slate-100 hover:text-primary-700"
                          >
                            {[e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ")}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                            <code className="text-slate-500 dark:text-slate-400">
                              {e.employeeCode}
                            </code>
                            {e.email && (
                              <span className="truncate text-slate-400 dark:text-slate-500">
                                {e.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {e.department?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {e.designation?.title ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={statusVariant(e.employmentStatus)}>
                          {e.employmentStatus.replace(/_/g, " ")}
                        </Badge>
                        {!e.isActive && <Badge variant="outline">Archived</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {new Date(e.employmentStartDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canUpdate &&
                        (e.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingArchive(e)}
                            icon={<Archive className="h-3.5 w-3.5" />}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(e.id)}
                            icon={<RotateCcw className="h-3.5 w-3.5" />}
                          >
                            Restore
                          </Button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              <span>
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!pagination.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={!!pendingArchive}
        onClose={() => setPendingArchive(null)}
        onConfirm={handleArchive}
        title="Deactivate this employee?"
        description={
          pendingArchive
            ? `${pendingArchive.firstName} ${pendingArchive.lastName} will be hidden from active lists. History is kept and you can restore them later.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivating}
      />
    </>
  );
}
