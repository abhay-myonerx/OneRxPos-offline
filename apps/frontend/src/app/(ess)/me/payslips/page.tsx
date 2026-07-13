"use client";

import { Link } from "@/shell/nav";
import { format } from "date-fns";
import { Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { usePermissions } from "@/hooks/usePermissions";
import { useListEssPayslipsQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import { ROUTES } from "@/constants/routes";

function formatMoney(value: string | number, currency: string) {
  const n = Number(value);
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function EssPayslipsPage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.payslips.read");

  const { data, isLoading, isError, error } = useListEssPayslipsQuery(
    { page: 1, limit: 30 },
    { skip: !canRead },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
          My Payslips
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Finalized payslips only — drafts are not shown.
        </p>
      </div>

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        permissionDenied={!canRead}
        missingPermission="ess.payslips.read"
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No payslips yet"
        emptyMessage="Your payslips will appear here once your first pay run is finalized."
      >
        {(d) => (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.data.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`${ROUTES.ESS_PAYSLIPS}/${p.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-md bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 flex items-center justify-center">
                        <Receipt className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {format(new Date(p.periodStart), "MMM d")} –{" "}
                          {format(new Date(p.periodEnd), "MMM d, yyyy")}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Net pay: {formatMoney(p.netPay, p.currency)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          p.status === "FINALIZED"
                            ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </EssStateGate>
    </div>
  );
}
