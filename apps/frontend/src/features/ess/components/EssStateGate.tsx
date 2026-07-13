"use client";

import { ShieldAlert, UserX, AlertTriangle, Inbox } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { parseEssError } from "../lib/ess-error";

interface Props<T> {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  data: T | undefined | null;
  /** True if the user lacks the required ESS permission to view this. */
  permissionDenied?: boolean;
  /** Missing permission string for the permission-denied state. */
  missingPermission?: string;
  /** Custom empty check; default = data is null/undefined/empty-array. */
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Render when data is present and non-empty. */
  children: (data: T) => React.ReactNode;
}

function defaultIsEmpty<T>(data: T): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

export function EssStateGate<T>({
  isLoading,
  isError,
  error,
  data,
  permissionDenied,
  missingPermission,
  isEmpty,
  emptyTitle = "Nothing here yet",
  emptyMessage = "There's no data to show at this time.",
  children,
}: Props<T>) {
  if (permissionDenied) {
    return (
      <PermissionDenied
        title="You don't have access to this page."
        missingPermission={missingPermission}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (isError) {
    const ess = parseEssError(error);
    if (ess.isNoLinkedEmployee) {
      return (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-warning-500/15 text-amber-600 dark:text-warning-300">
            <UserX className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{ess.title}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            {ess.detail}
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm">
              Contact HR
            </Button>
          </div>
        </Card>
      );
    }
    if (ess.status === 403) {
      return (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-danger-500/15 text-red-600 dark:text-danger-300">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{ess.title}</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            {ess.detail}
          </p>
        </Card>
      );
    }
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-danger-500/15 text-red-600 dark:text-danger-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          {ess.detail}
        </p>
      </Card>
    );
  }

  if (data === undefined || data === null) {
    return (
      <Card className="p-8 text-center text-sm text-slate-600 dark:text-slate-300">
        No data available.
      </Card>
    );
  }

  const empty = (isEmpty ?? defaultIsEmpty)(data);
  if (empty) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-3 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 w-fit">
          <Inbox className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{emptyTitle}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto">
          {emptyMessage}
        </p>
      </Card>
    );
  }

  return <>{children(data)}</>;
}
