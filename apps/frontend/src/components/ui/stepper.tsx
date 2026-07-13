"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface Step {
  label: string;
  /** Optional one-line caption shown under the label on larger screens. */
  description?: string;
}

interface StepperProps {
  steps: Step[];
  /** Zero-based index of the active step. */
  current: number;
  /** When provided, completed/active steps become clickable. */
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Horizontal progress stepper used by multi-step forms (e.g. the employee
 * wizard). Steps before `current` render as completed (check), the current
 * step is highlighted, and later steps are muted.
 */
export function Stepper({ steps, current, onStepClick, className }: StepperProps) {
  return (
    <ol className={cn("flex w-full items-center", className)}>
      {steps.map((step, i) => {
        const isCompleted = i < current;
        const isActive = i === current;
        const clickable = !!onStepClick && i <= current;

        return (
          <li
            key={step.label}
            className={cn("flex items-center", i < steps.length - 1 && "flex-1")}
          >
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(i)}
              className={cn("flex items-center gap-3 text-left", clickable && "cursor-pointer")}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  isCompleted && "border-primary-800 bg-primary-800 text-white",
                  isActive &&
                    "border-primary-800 bg-primary-50 text-primary-800 dark:border-primary-400 dark:bg-primary-400/15 dark:text-primary-300",
                  !isCompleted &&
                    !isActive &&
                    "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="hidden flex-col sm:flex">
                <span
                  className={cn(
                    "text-sm font-medium leading-tight",
                    isActive
                      ? "text-slate-900 dark:text-slate-100"
                      : isCompleted
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-slate-400 dark:text-slate-500",
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {step.description}
                  </span>
                )}
              </span>
            </button>

            {i < steps.length - 1 && (
              <span
                className={cn(
                  "mx-3 h-px flex-1 transition-colors",
                  isCompleted ? "bg-primary-800" : "bg-slate-200 dark:bg-slate-700",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
