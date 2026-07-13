"use client";

import { forwardRef, useId } from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type InputSize = "sm" | "md" | "lg";

/**
 * Omit 'size' from HTMLInputElement because the native attribute is `number`
 * (controls visible character width) while our design-system 'size' is a
 * string union ('sm' | 'md' | 'lg'). Without the Omit the two declarations
 * clash and TypeScript raises:
 *   "Type 'InputSize | undefined' is not assignable to type 'number | undefined'"
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  helperText?: string;
  /**
   * Pass a string to show an inline error message below the field.
   * Pass `true` (boolean) to apply error styling without a message text.
   */
  error?: string | boolean;
  /** Backward-compat alias for prefixIcon. */
  icon?: React.ReactNode;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  size?: InputSize;
  required?: boolean;
  fullWidth?: boolean;
  containerClassName?: string;
}

const sizeMap = {
  sm: {
    wrapper: "h-8 rounded-md",
    input: "text-xs px-3",
    withPrefix: "pl-8",
    withSuffix: "pr-8",
    iconSlot: "w-8",
    icon: "h-3.5 w-3.5",
    label: "text-xs",
    helper: "text-[10px]",
  },
  md: {
    wrapper: "h-9 rounded-lg",
    input: "text-sm px-3",
    withPrefix: "pl-9",
    withSuffix: "pr-9",
    iconSlot: "w-9",
    icon: "h-4 w-4",
    label: "text-sm",
    helper: "text-xs",
  },
  lg: {
    wrapper: "h-11 rounded-lg",
    input: "text-base px-4",
    withPrefix: "pl-11",
    withSuffix: "pr-11",
    iconSlot: "w-11",
    icon: "h-5 w-5",
    label: "text-sm",
    helper: "text-xs",
  },
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      icon,
      prefixIcon,
      suffixIcon,
      size = "md",
      required = false,
      fullWidth = false,
      containerClassName,
      disabled,
      className,
      id: propId,
      ...props
    },
    ref,
  ) => {
    const autoId = useId();
    const id = propId ?? autoId;
    const sz = sizeMap[size];

    const hasError = Boolean(error);
    const errorMessage = typeof error === "string" ? error : undefined;
    const showMessage = Boolean(errorMessage ?? helperText);

    // icon is a backward-compat alias for prefixIcon
    const effectivePrefixIcon = prefixIcon ?? icon;

    return (
      <div
        className={twMerge(
          clsx("flex flex-col gap-1.5", fullWidth && "w-full", containerClassName),
        )}
      >
        {label && (
          <label
            htmlFor={id}
            className={clsx(
              sz.label,
              "font-medium text-slate-700 dark:text-slate-300 leading-none",
            )}
          >
            {label}
            {required && (
              <span className="text-error-500 ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div className={clsx("relative flex items-center", fullWidth && "w-full")}>
          {effectivePrefixIcon && (
            <span
              className={clsx(
                "absolute left-0 flex items-center justify-center pointer-events-none",
                sz.iconSlot,
                "h-full text-slate-400",
              )}
              aria-hidden="true"
            >
              <span className={sz.icon}>{effectivePrefixIcon}</span>
            </span>
          )}

          <input
            ref={ref}
            id={id}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={showMessage ? `${id}-message` : undefined}
            className={twMerge(
              clsx(
                "w-full bg-white dark:bg-slate-900 border text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500",
                "transition-all duration-150 outline-none",
                sz.wrapper,
                sz.input,
                effectivePrefixIcon && sz.withPrefix,
                suffixIcon && sz.withSuffix,
                disabled && "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800",
                hasError
                  ? [
                      "border-error-400",
                      "focus:border-error-500 focus:ring-2 focus:ring-error-500/10",
                    ]
                  : [
                      "border-slate-200 dark:border-slate-700",
                      !disabled && "hover:border-slate-300 dark:hover:border-slate-600",
                      "focus:border-primary-400 focus:ring-2 focus:ring-primary-500/10",
                    ],
                className,
              ),
            )}
            {...props}
          />

          {suffixIcon && (
            <span
              className={clsx(
                "absolute right-0 flex items-center justify-center pointer-events-none",
                sz.iconSlot,
                "h-full text-slate-400",
              )}
              aria-hidden="true"
            >
              <span className={sz.icon}>{suffixIcon}</span>
            </span>
          )}
        </div>

        {showMessage && (
          <p
            id={`${id}-message`}
            className={clsx(
              sz.helper,
              "leading-none",
              hasError
                ? "text-error-600 dark:text-error-400"
                : "text-slate-500 dark:text-slate-400",
            )}
          >
            {errorMessage ?? helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";
