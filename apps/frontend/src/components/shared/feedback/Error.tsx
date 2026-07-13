"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface ErrorDisplayProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="h-14 w-14 rounded-full bg-danger-50 dark:bg-danger-500/15 flex items-center justify-center">
        <AlertTriangle className="h-7 w-7 text-danger-500" />
      </div>
      <div className="text-center">
        <p className="text-slate-700 dark:text-slate-200 font-medium">{t("feedback.error")}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {message ?? t("feedback.somethingWrong")}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
          {t("actions.tryAgain")}
        </Button>
      )}
    </div>
  );
}
