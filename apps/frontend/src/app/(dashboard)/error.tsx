"use client";

import { useEffect } from "react";
import { Link } from "@/shell/nav";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center px-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-danger-100 bg-danger-50 text-danger-500 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-400">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Something went wrong
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
          We couldn&apos;t load this page
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          An unexpected error occurred while loading this section. You can retry or return to your
          dashboard.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={() => reset()} fullWidth className="sm:w-auto">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="outline" fullWidth className="sm:w-auto">
            <Link href={ROUTES.DASHBOARD}>
              <Home className="h-4 w-4" />
              Back to dashboard
            </Link>
          </Button>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-xs text-slate-400 dark:text-slate-600">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
