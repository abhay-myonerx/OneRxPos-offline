"use client";

import { Link, useParams } from "@/shell/nav";
import { format } from "date-fns";
import { ArrowLeft, Download } from "lucide-react";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetEssPayslipQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import { openPayslipPdf } from "@/features/hr/lib/openPayslipPdf";
import { showApiError } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

function fmt(value: string, currency: string) {
  return `${currency} ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const FLAG_LABEL: Record<string, string> = {
  NO_ATTENDANCE_DATA: "No attendance data — please confirm hours",
  NEGATIVE_NET_PAY: "Net pay is negative — please contact HR",
  NO_SALARY: "No salary structure assigned",
  ADVANCE_RECOVERY: "Includes an advance repayment",
};

export default function EssPayslipDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { canAny, can } = usePermissions();
  const canRead = canAny("ess.payslips.read");
  const canDownload = can("ess.payslips.download");
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, isError, error } = useGetEssPayslipQuery(id, {
    skip: !canRead || !id,
  });

  async function handleDownload() {
    if (!id) return;
    setDownloading(true);
    try {
      await openPayslipPdf(id, "ess");
    } catch (err) {
      showApiError(err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={ROUTES.ESS_PAYSLIPS}
        className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to payslips
      </Link>

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        permissionDenied={!canRead}
        missingPermission="ess.payslips.read"
        isEmpty={() => false}
      >
        {(p) => (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  Payslip · {format(new Date(p.periodStart), "MMM d")} –{" "}
                  {format(new Date(p.periodEnd), "MMM d, yyyy")}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  Currency: {p.currency}{" "}
                  {p.finalizedAt && `· Finalized ${format(new Date(p.finalizedAt), "MMM d, yyyy")}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {canDownload && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    loading={downloading}
                    icon={<Download className="h-4 w-4" />}
                  >
                    Download / Print
                  </Button>
                )}
                <Badge
                  variant={
                    p.status === "FINALIZED"
                      ? "success"
                      : p.status === "VOIDED"
                        ? "danger"
                        : "outline"
                  }
                >
                  {p.status}
                </Badge>
              </div>
            </div>

            {p.flags?.length > 0 && (
              <Card className="p-3 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15">
                <h2 className="text-sm font-semibold text-amber-900 mb-1">Flags</h2>
                <ul className="space-y-0.5 text-sm text-amber-900">
                  {p.flags.map((f) => (
                    <li key={f}>• {FLAG_LABEL[f] ?? f}</li>
                  ))}
                </ul>
              </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Gross pay" value={fmt(p.grossPay, p.currency)} />
              <Stat label="Total deductions" value={fmt(p.totalDeductions, p.currency)} negative />
              <Stat label="Net pay" value={fmt(p.netPay, p.currency)} emphasis />
            </div>

            <Card className="overflow-hidden">
              <h2 className="px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800">
                Breakdown
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                        Component
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                        Type
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.lines ?? []).map((line) => (
                      <tr key={line.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-2.5 text-slate-900 dark:text-slate-100">
                          {line.componentName}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 capitalize">
                          {line.type.replace(/_/g, " ").toLowerCase()}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-medium ${
                            line.type === "EARNING" || line.type === "REIMBURSEMENT"
                              ? "text-slate-900 dark:text-slate-100"
                              : "text-red-700 dark:text-red-300"
                          }`}
                        >
                          {fmt(line.amount, p.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-4 grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
                  Days worked
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-semibold mt-1">
                  {Number(p.daysWorked).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
                  Days absent
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-semibold mt-1">
                  {Number(p.daysAbsent).toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
                  Overtime hours
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-semibold mt-1">
                  {Number(p.overtimeHours).toFixed(2)}
                </div>
              </div>
            </Card>
          </div>
        )}
      </EssStateGate>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
  negative,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${
          emphasis
            ? "text-[#4263eb]"
            : negative
              ? "text-red-700 dark:text-red-300"
              : "text-slate-900 dark:text-slate-100"
        }`}
      >
        {value}
      </div>
    </Card>
  );
}
