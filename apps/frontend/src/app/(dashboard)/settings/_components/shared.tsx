"use client";

import { cn } from "@/lib/utils/cn";

export function SectionTitle({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
          {icon}
        </div>
        <div className="pt-0.5">
          <h3 className="text-[15px] font-medium text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
            {title}
          </h3>
          {description && (
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-slate-200/70 dark:bg-slate-800", className)} />;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  compact = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between rounded-lg transition-colors cursor-pointer",
        compact
          ? "py-2.5 px-1 hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
          : "px-3.5 py-3 border border-slate-200/70 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50/50 dark:hover:border-slate-600 dark:hover:bg-slate-800/40",
      )}
      onClick={() => onChange(!checked)}
    >
      <div className="min-w-0 pr-4">
        <p
          className={cn(
            "font-medium text-slate-800 dark:text-slate-100 leading-tight",
            compact ? "text-[13px]" : "text-sm",
          )}
        >
          {label}
        </p>
        {description && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={cn(
          "relative inline-flex h-[22px] w-[40px] items-center rounded-full transition-colors duration-200 shrink-0",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2",
          checked ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700",
        )}
      >
        <span
          className={cn(
            "inline-block h-[16px] w-[16px] rounded-full bg-white transition-transform duration-200",
            checked ? "translate-x-[20px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FieldGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4 pt-5 first:pt-0", className)}>{children}</div>;
}

export function InfoBanner({
  icon,
  title,
  description,
  variant = "info",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  variant?: "info" | "success" | "warning";
}) {
  const styles = {
    info: "bg-primary-50/60 border-primary-100 text-primary-800",
    success: "bg-success-50/60 border-success-500/20 text-success-800",
    warning: "bg-warning-50/60 border-warning-500/20 text-warning-800",
  };

  const iconStyles = {
    info: "text-primary-600",
    success: "text-success-600",
    warning: "text-warning-600",
  };

  return (
    <div className={cn("p-4 rounded-xl border", styles[variant])}>
      <div className="flex items-start gap-3">
        <span className={cn("shrink-0 mt-0.5", iconStyles[variant])}>{icon}</span>
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-[12px] mt-0.5 opacity-85 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
