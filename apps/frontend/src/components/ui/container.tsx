import { cn } from "@/lib/utils/cn";
import { Link } from "@/shell/nav";
import { ChevronRight } from "lucide-react";

export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("max-w-7xl mx-auto", className)}>{children}</div>;
}

export interface Breadcrumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  // Widened from `string` to `React.ReactNode` so callers can compose a title
  // with badges, icons, or status chips. Non-breaking for existing callers.
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
}) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 mb-2 text-xs text-slate-400 dark:text-slate-500">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-primary-600 transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={
                    i === breadcrumbs.length - 1
                      ? "text-slate-600 dark:text-slate-300 font-medium"
                      : ""
                  }
                >
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {typeof title === "string" ? (
            <h1 className="text-2xl font-medium text-slate-900 dark:text-slate-100">{title}</h1>
          ) : (
            <div className="text-2xl font-medium text-slate-900 dark:text-slate-100">{title}</div>
          )}
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
