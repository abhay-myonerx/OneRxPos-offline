"use client";

import { Link } from "@/shell/nav";
import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ROUTES } from "@/constants/routes";

interface PermissionDeniedProps {
  /** Optional human-readable description of what was denied. */
  title?: string;
  /** Permission string(s) that were missing — surfaced for support. */
  missingPermission?: string | string[];
  /** Where to send the user if they hit "Go back". Defaults to dashboard. */
  fallbackHref?: string;
  /** Compact inline variant (no full-page chrome) for embedding in tabs / cards. */
  compact?: boolean;
}

export function PermissionDenied({
  title,
  missingPermission,
  fallbackHref = ROUTES.DASHBOARD,
  compact = false,
}: PermissionDeniedProps) {
  const { t } = useTranslation("common");
  const missing = missingPermission
    ? Array.isArray(missingPermission)
      ? missingPermission
      : [missingPermission]
    : null;

  const body = (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="rounded-full bg-rose-50 dark:bg-rose-500/15 p-3 text-rose-600 dark:text-rose-300">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title ?? t("permission.denied")}
      </h2>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
        {t("permission.askAdmin")}
      </p>
      {missing && (
        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
          {t("permission.missing")} {missing.join(", ")}
        </p>
      )}
      {!compact && (
        <Link
          href={fallbackHref}
          className="mt-2 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {t("actions.goBack")}
        </Link>
      )}
    </div>
  );

  if (compact) {
    return <div className="rounded-md border bg-white dark:bg-slate-900 p-6">{body}</div>;
  }

  return <div className="flex min-h-[60vh] items-center justify-center p-6">{body}</div>;
}
