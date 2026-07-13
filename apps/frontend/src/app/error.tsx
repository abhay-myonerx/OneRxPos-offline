"use client";

import { useEffect } from "react";
import { Link } from "@/shell/nav";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullScreenState } from "@/components/shared/feedback/FullScreenState";
import { ROUTES } from "@/constants/routes";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for diagnostics (telemetry hook can go here later).
    console.error(error);
  }, [error]);

  return (
    <FullScreenState
      tone="danger"
      icon={<AlertTriangle className="h-7 w-7" />}
      eyebrow="Something went wrong"
      title="This page hit an unexpected error"
      description="Sorry about that — the issue has been logged. You can retry, or head back to your dashboard."
      actions={
        <>
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
        </>
      }
      footer={
        error.digest ? (
          <p className="font-mono text-xs text-slate-400 dark:text-slate-600">
            Reference: {error.digest}
          </p>
        ) : null
      }
    />
  );
}
