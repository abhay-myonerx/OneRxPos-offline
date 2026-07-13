"use client";

import { Package } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EmptyProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  description?: string;
}

export function Empty({ title, message, icon, action, description }: EmptyProps) {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-14 w-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        {icon || <Package className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
      </div>
      <div className="text-center">
        <p className="text-slate-700 dark:text-slate-200 font-medium">{title ?? t("feedback.noData")}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {message ?? t("feedback.nothingYet")}
        </p>
        {description && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
