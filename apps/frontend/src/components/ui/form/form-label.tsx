import { cn } from "@/lib/utils/cn";

export function FormLabel({
  children,
  required,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5",
        className,
      )}
    >
      {children}
      {required && <span className="text-danger-500 ml-0.5">*</span>}
    </label>
  );
}
