"use client";

import { Link, usePathname } from "@/shell/nav";
import { CalendarClock, FolderTree, DollarSign, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/constants/routes";
import { usePermissions } from "@/hooks/usePermissions";
import type { AnyPermission } from "@/hooks/usePermissions";

interface PayrollTab {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Visible when the user holds at least one of these permissions. */
  anyOf: AnyPermission[];
}

// Sub-navigation for the Payroll workspace. The sidebar only exposes a single
// "Payroll" entry (which redirects to /hr/payroll/runs), so these tabs make the
// sibling routes — runs, salary structures, employee salaries and advances —
// reachable. Each tab mirrors the read gate of the page it links to; hiding is
// UX only, the backend remains the source of truth.
const PAYROLL_TABS: PayrollTab[] = [
  {
    label: "Runs",
    href: ROUTES.HR_PAYROLL_RUNS,
    icon: <CalendarClock className="h-4 w-4" />,
    anyOf: [
      "hr.payroll.read",
      "hr.payroll.run.create",
      "hr.payroll.run.process",
      "hr.payroll.run.approve",
      "hr.payroll.run.disburse",
      "hr.payroll.run.cancel",
    ],
  },
  {
    label: "Salary Structures",
    href: ROUTES.HR_PAYROLL_STRUCTURES,
    icon: <FolderTree className="h-4 w-4" />,
    anyOf: ["hr.payroll.salary-structure.read", "hr.payroll.salary-structure.manage"],
  },
  {
    label: "Employee Salaries",
    href: ROUTES.HR_PAYROLL_SALARIES,
    icon: <DollarSign className="h-4 w-4" />,
    anyOf: ["hr.payroll.salary-structure.read", "hr.payroll.salary-structure.manage"],
  },
  {
    label: "Advances",
    href: ROUTES.HR_PAYROLL_ADVANCES,
    icon: <CreditCard className="h-4 w-4" />,
    anyOf: ["hr.payroll.advance.read", "hr.payroll.advance.create"],
  },
];

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { canAny } = usePermissions();

  const visibleTabs = PAYROLL_TABS.filter((tab) => canAny(...tab.anyOf));

  return (
    <div>
      {visibleTabs.length > 0 && (
        <nav
          aria-label="Payroll sections"
          className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800"
        >
          {visibleTabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 -mb-px text-[13px] border-b-2 transition-colors",
                  active
                    ? "border-primary-600 text-primary-700 dark:text-primary-300 font-medium"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span className="shrink-0">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
