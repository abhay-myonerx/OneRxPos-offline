"use client";

import { useMemo, useState } from "react";
import { Users, CalendarCheck, Plane, Wallet, History, AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS_V2 } from "@/lib/permissions/permissions-v2";
import { useAppSelector } from "@/store/hooks";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDate, formatDateTime, thirtyDaysAgoISO, todayISO } from "@/lib/date/format-date";

import {
  useGetAttendanceReportQuery,
  useGetEmployeeReportQuery,
  useGetLeaveReportQuery,
  useGetPayrollReportQuery,
  useGetRecentActivityQuery,
} from "@/features/reports/api/hr-reports.api";

type Tab = "employees" | "attendance" | "leave" | "payroll" | "activity";

const COLORS = [
  "#233699",
  "#02BCF5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function KpiCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-xl font-medium text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
        {value}
      </p>
      {sublabel && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{sublabel}</p>
      )}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <AlertTriangle className="h-6 w-6 text-slate-400 dark:text-slate-500" />
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

function PermissionDeniedCard() {
  return (
    <Card>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-warning-50 dark:bg-warning-500/15 flex items-center justify-center mb-3">
          <AlertTriangle className="h-6 w-6 text-warning-500 dark:text-warning-300" />
        </div>
        <p className="text-base font-medium text-slate-700 dark:text-slate-200">
          You don&apos;t have access to this report
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
          Ask an administrator to grant the relevant HR or report permission on your role.
        </p>
      </div>
    </Card>
  );
}

// ─── Employees tab ───────────────────────────────────────────────────────────

function EmployeesReport() {
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const { can } = usePermissions();
  const allowed = can(PERMISSIONS_V2.HR_EMPLOYEES_READ);
  const { data, isLoading, error, refetch } = useGetEmployeeReportQuery(undefined, {
    skip: !allowed,
  });

  if (!allowed) return <PermissionDeniedCard />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!data) return null;

  const byStatusChart = data.byStatus.map((s) => ({
    name: s.status.replace(/_/g, " "),
    value: s.count,
  }));
  const byDeptChart = data.byDepartment.slice(0, 8).map((d) => ({
    name: d.departmentName,
    count: d.count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Employees" value={data.summary.total.toString()} />
        <KpiCard label="Active" value={data.summary.active.toString()} />
        <KpiCard label="On Leave" value={data.summary.onLeave.toString()} />
        <KpiCard label="Terminated" value={data.summary.terminated.toString()} />
        <KpiCard label="New (30d)" value={data.summary.newHiresLast30Days.toString()} />
      </div>

      {data.summary.total === 0 ? (
        <Card>
          <EmptyState message="No employees recorded yet." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>By Department</CardTitle>
              <Badge variant="info">{data.byDepartment.length}</Badge>
            </CardHeader>
            {byDeptChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={byDeptChart} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#1e293b" : "#f1f5f9"} />
                  <XAxis
                    dataKey="name"
                    tick={{
                      fontSize: 11,
                      fill: isDark ? "#94a3b8" : "#64748b",
                    }}
                    angle={-30}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tick={{
                      fontSize: 11,
                      fill: isDark ? "#94a3b8" : "#64748b",
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                      background: isDark ? "#1e293b" : "#fff",
                      color: isDark ? "#e2e8f0" : "#1e293b",
                    }}
                  />
                  <Bar dataKey="count" fill="#233699" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No departments yet." />
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By Employment Status</CardTitle>
            </CardHeader>
            {byStatusChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={byStatusChart}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={55}
                    paddingAngle={3}
                  >
                    {byStatusChart.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                      background: isDark ? "#1e293b" : "#fff",
                      color: isDark ? "#e2e8f0" : "#1e293b",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No status breakdown yet." />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Attendance tab ──────────────────────────────────────────────────────────

function AttendanceReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const { can } = usePermissions();
  const allowed = can(PERMISSIONS_V2.REPORTS_HR_ATTENDANCE_READ);
  const { data, isLoading, error, refetch } = useGetAttendanceReportQuery(
    { dateFrom, dateTo },
    { skip: !allowed },
  );

  if (!allowed) return <PermissionDeniedCard />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!data) return null;

  const byMethodChart = data.byMethod.map((m) => ({
    name: m.method.replace(/_/g, " "),
    value: m.count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Employees" value={data.summary.activeEmployees.toString()} />
        <KpiCard
          label="Check-ins"
          value={data.summary.checkIns.toString()}
          sublabel={`${data.summary.checkOuts} check-outs`}
        />
        <KpiCard label="Unique Attendees" value={data.summary.uniqueAttendees.toString()} />
        <KpiCard
          label="Pending Corrections"
          value={data.summary.pendingCorrections.toString()}
          sublabel={`${data.summary.approvedCorrections} approved`}
        />
      </div>

      {data.summary.totalEvents === 0 ? (
        <Card>
          <EmptyState message="No attendance events in this period." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>By Method</CardTitle>
            </CardHeader>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byMethodChart}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={55}
                  paddingAngle={3}
                >
                  {byMethodChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                    background: isDark ? "#1e293b" : "#fff",
                    color: isDark ? "#e2e8f0" : "#1e293b",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card padding={false}>
            <div className="p-5">
              <CardTitle>By Event Type</CardTitle>
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Event</Th>
                  <Th>Count</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.byEventType.map((e) => (
                  <Tr key={e.eventType}>
                    <Td className="font-medium">{e.eventType.replace(/_/g, " ")}</Td>
                    <Td>{e.count}</Td>
                  </Tr>
                ))}
                {data.byEventType.length === 0 && (
                  <Tr>
                    <Td colSpan={2} className="text-center text-slate-400 dark:text-slate-500 py-6">
                      No events.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Leave tab ───────────────────────────────────────────────────────────────

function LeaveReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { can } = usePermissions();
  const allowed = can(PERMISSIONS_V2.REPORTS_HR_ATTENDANCE_READ);
  const { data, isLoading, error, refetch } = useGetLeaveReportQuery(
    { dateFrom, dateTo },
    { skip: !allowed },
  );

  if (!allowed) return <PermissionDeniedCard />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Requests"
          value={data.summary.totalRequests.toString()}
          sublabel={`${data.summary.totalDays} days`}
        />
        <KpiCard label="Pending" value={data.summary.pending.toString()} />
        <KpiCard label="Approved" value={data.summary.approved.toString()} />
        <KpiCard label="Currently On Leave" value={data.summary.currentlyOnLeave.toString()} />
      </div>

      {data.summary.totalRequests === 0 ? (
        <Card>
          <EmptyState message="No leave requests in this period." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>By Status</CardTitle>
            </CardHeader>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#02BCF5" radius={[6, 6, 0, 0]} name="Requests" />
                <Bar dataKey="totalDays" fill="#233699" radius={[6, 6, 0, 0]} name="Days" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card padding={false}>
            <div className="p-5">
              <CardTitle>Approved by Leave Type</CardTitle>
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Type</Th>
                  <Th>Code</Th>
                  <Th>Requests</Th>
                  <Th>Days</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.byType.map((t) => (
                  <Tr key={t.leaveTypeId}>
                    <Td className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: t.color ?? "#94a3b8",
                          }}
                        />
                        {t.name}
                      </span>
                    </Td>
                    <Td className="text-slate-500">{t.code}</Td>
                    <Td>{t.approvedRequests}</Td>
                    <Td>{t.approvedDays}</Td>
                  </Tr>
                ))}
                {data.byType.length === 0 && (
                  <Tr>
                    <Td colSpan={4} className="text-center text-slate-400 py-6">
                      No approved leave yet.
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Payroll tab ─────────────────────────────────────────────────────────────

function PayrollReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { can } = usePermissions();
  const allowed = can(PERMISSIONS_V2.REPORTS_HR_PAYROLL_READ);
  const { data, isLoading, error, refetch } = useGetPayrollReportQuery(
    { dateFrom, dateTo },
    { skip: !allowed },
  );

  if (!allowed) return <PermissionDeniedCard />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Payroll Runs"
          value={data.summary.totalRuns.toString()}
          sublabel={`${data.summary.totalEmployeesPaid} employees`}
        />
        <KpiCard label="Total Gross" value={formatMoney(data.summary.totalGross)} />
        <KpiCard label="Total Net" value={formatMoney(data.summary.totalNet)} />
        <KpiCard label="Total Deductions" value={formatMoney(data.summary.totalDeductions)} />
      </div>

      {data.summary.totalRuns === 0 ? (
        <Card>
          <EmptyState message="No payroll runs in this period." />
        </Card>
      ) : (
        <Card padding={false}>
          <div className="p-5">
            <CardTitle>Recent Payroll Runs</CardTitle>
          </div>
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th>Employees</Th>
                <Th>Gross</Th>
                <Th>Net</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.recentRuns.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-slate-500">
                    {formatDate(r.periodStart)} → {formatDate(r.periodEnd)}
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        r.status === "DISBURSED"
                          ? "success"
                          : r.status === "FAILED" || r.status === "CANCELLED"
                            ? "danger"
                            : "info"
                      }
                    >
                      {r.status}
                    </Badge>
                  </Td>
                  <Td>{r.employeeCount}</Td>
                  <Td className="font-medium">{formatMoney(r.totalGross)}</Td>
                  <Td className="font-medium text-emerald-700">{formatMoney(r.totalNet)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── Activity tab ────────────────────────────────────────────────────────────

function ActivityReport({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { can } = usePermissions();
  const allowed = can(PERMISSIONS_V2.TENANT_AUDIT_READ);
  const { data, isLoading, error, refetch } = useGetRecentActivityQuery(
    { dateFrom, dateTo, limit: 50 },
    { skip: !allowed },
  );

  if (!allowed) return <PermissionDeniedCard />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;
  if (!data) return null;

  return (
    <Card padding={false}>
      <div className="p-5 flex items-center justify-between">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            {data.summary.shown} of {data.summary.totalEvents} events
          </p>
        </div>
      </div>
      <Table>
        <Thead>
          <Tr>
            <Th>When</Th>
            <Th>User</Th>
            <Th>Action</Th>
            <Th>Entity</Th>
            <Th>IP</Th>
          </Tr>
        </Thead>
        <Tbody>
          {data.items.length === 0 && (
            <Tr>
              <Td colSpan={5} className="text-center text-slate-400 py-10">
                No activity in this window.
              </Td>
            </Tr>
          )}
          {data.items.map((i) => (
            <Tr key={i.id}>
              <Td className="text-slate-500 whitespace-nowrap">{formatDateTime(i.createdAt)}</Td>
              <Td>
                <div className="font-medium text-slate-800">{i.userName ?? "System"}</div>
                {i.userEmail && <div className="text-xs text-slate-500">{i.userEmail}</div>}
              </Td>
              <Td>
                <Badge variant="info">{i.action}</Badge>
              </Td>
              <Td className="text-slate-500">
                {i.entityType}
                <span className="text-slate-400 text-xs ml-1">#{i.entityId.slice(0, 8)}</span>
              </Td>
              <Td className="text-slate-400 text-xs">{i.ipAddress ?? "—"}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/**
 * HR reporting hub: Employees, Attendance, Leave, Payroll, and Activity tabs.
 * The page-level guard checks whether the user holds ANY HR/audit permission;
 * each tab additionally guards itself so a user who can see Employees but not
 * Payroll still gets a proper permission-denied card on that tab rather than a
 * blank screen or 403. The Employees tab has no date filter because it
 * aggregates current headcount, not time-series data.
 */
export default function HrReportsPage() {
  const { canAny } = usePermissions();
  const [tab, setTab] = useState<Tab>("employees");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoISO());
  const [dateTo, setDateTo] = useState(todayISO());

  // Page-level early exit: if the user has none of the HR permissions at all,
  // show a single denied card rather than rendering four denied tab panels.
  const allowed = useMemo(
    () =>
      canAny(
        PERMISSIONS_V2.HR_EMPLOYEES_READ,
        PERMISSIONS_V2.REPORTS_HR_ATTENDANCE_READ,
        PERMISSIONS_V2.REPORTS_HR_PAYROLL_READ,
        PERMISSIONS_V2.TENANT_AUDIT_READ,
      ),
    [canAny],
  );

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "employees",
      label: "Employees",
      icon: <Users className="h-4 w-4" />,
    },
    {
      key: "attendance",
      label: "Attendance",
      icon: <CalendarCheck className="h-4 w-4" />,
    },
    { key: "leave", label: "Leave", icon: <Plane className="h-4 w-4" /> },
    { key: "payroll", label: "Payroll", icon: <Wallet className="h-4 w-4" /> },
    {
      key: "activity",
      label: "Activity",
      icon: <History className="h-4 w-4" />,
    },
  ];

  if (!allowed) {
    return (
      <>
        <PageHeader title="HR Reports" description="People analytics" />
        <PermissionDeniedCard />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="HR Reports"
        description="Employees, attendance, leave, payroll, and audit activity"
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
        <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-1 overflow-x-auto shrink-0">
          {tabs.map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setTab(t.key)}
              icon={t.icon}
              className="whitespace-nowrap"
            >
              {t.label}
            </Button>
          ))}
        </div>
        {tab !== "employees" && (
          <div className="flex gap-2 sm:ml-auto items-center flex-wrap">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[148px] sm:w-[160px]"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[148px] sm:w-[160px]"
            />
          </div>
        )}
      </div>

      {tab === "employees" && <EmployeesReport />}
      {tab === "attendance" && <AttendanceReport dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === "leave" && <LeaveReport dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === "payroll" && <PayrollReport dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === "activity" && <ActivityReport dateFrom={dateFrom} dateTo={dateTo} />}
    </>
  );
}
