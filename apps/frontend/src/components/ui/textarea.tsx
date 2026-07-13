"use client";
import { forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 min-h-[80px]",
      "transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
      error ? "border-danger-500" : "border-slate-300 dark:border-slate-700",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
