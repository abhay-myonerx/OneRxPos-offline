import { cn } from "@/lib/utils/cn";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  success: "bg-success-50 text-success-800 dark:bg-success-500/15 dark:text-success-300",
  warning: "bg-warning-50 text-warning-800 dark:bg-warning-500/15 dark:text-warning-300",
  danger: "bg-error-50 text-error-800 dark:bg-error-500/15 dark:text-error-300",
  info: "bg-primary-50 text-primary-700 dark:bg-primary-400/15 dark:text-primary-300",
  outline: "border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    ACTIVE: "success",
    COMPLETED: "success",
    RECEIVED: "success",
    TRIAL: "info",
    PARTIAL: "warning",
    PENDING: "warning",
    DRAFT: "outline",
    IN_TRANSIT: "info",
    ORDERED: "info",
    VOIDED: "danger",
    RETURNED: "danger",
    CANCELLED: "danger",
    SUSPENDED: "danger",
    FAILED: "danger",
  };
  return <Badge variant={map[status] || "default"}>{status.replace(/_/g, " ")}</Badge>;
}
