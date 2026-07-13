"use client";
import { forwardRef, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string }
>(({ className, label, ...props }, ref) => (
  <label className="inline-flex items-center gap-2 cursor-pointer">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-primary-600 focus:ring-primary-500",
        className,
      )}
      {...props}
    />
    {label && <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>}
  </label>
));
Checkbox.displayName = "Checkbox";
