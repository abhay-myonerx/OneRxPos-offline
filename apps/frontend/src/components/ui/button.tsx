"use client";

import * as React from "react";
import { forwardRef } from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-primary-800 text-white border border-primary-800",
    "hover:bg-primary-800/90 hover:border-primary-800/90",
    "active:bg-primary-900 active:border-primary-900",
    "focus-visible:ring-2 focus-visible:ring-primary-500/20 focus-visible:ring-offset-2",
  ].join(" "),

  secondary: [
    "bg-white text-slate-700 border border-slate-200",
    "hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900",
    "active:bg-slate-100",
    "dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    "dark:hover:bg-slate-700 dark:hover:border-slate-600 dark:hover:text-white dark:active:bg-slate-700/70",
    "focus-visible:ring-2 focus-visible:ring-slate-400/20 focus-visible:ring-offset-2",
  ].join(" "),

  outline: [
    "bg-transparent text-primary-600 border border-primary-200",
    "hover:bg-primary-50 hover:border-primary-300",
    "active:bg-primary-100",
    "dark:text-primary-300 dark:border-primary-400/40 dark:hover:bg-primary-400/10 dark:hover:border-primary-400/60 dark:active:bg-primary-400/20",
    "focus-visible:ring-2 focus-visible:ring-primary-500/20 focus-visible:ring-offset-2",
  ].join(" "),

  ghost: [
    "bg-transparent text-slate-500 border border-transparent",
    "hover:bg-slate-100 hover:text-slate-800",
    "active:bg-slate-200",
    "dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:active:bg-slate-700",
    "focus-visible:ring-2 focus-visible:ring-slate-400/20 focus-visible:ring-offset-2",
  ].join(" "),

  danger: [
    "bg-error-50 text-error-800 border border-error-100",
    "hover:bg-error-100 hover:border-error-200",
    "active:bg-error-200",
    "dark:bg-error-500/15 dark:text-error-300 dark:border-error-500/30 dark:hover:bg-error-500/25 dark:hover:border-error-500/40 dark:active:bg-error-500/30",
    "focus-visible:ring-2 focus-visible:ring-error-500/20 focus-visible:ring-offset-2",
  ].join(" "),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-6 text-base gap-2.5 rounded-lg",
  icon: "h-9 w-9 p-0 rounded-lg",
};

const spinnerSize: Record<ButtonSize, string> = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  icon: "h-4 w-4",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      asChild = false,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const iconOnly = size === "icon";
    const effectiveLeftIcon = leftIcon ?? icon;

    return (
      <Comp
        ref={ref}
        type={!asChild ? type : undefined}
        disabled={!asChild ? disabled || loading : undefined}
        aria-disabled={asChild && (disabled || loading) ? true : undefined}
        className={twMerge(
          clsx(
            "inline-flex items-center justify-center font-medium",
            "transition-all duration-150 ease-in-out",
            "active:scale-[0.98]",
            "outline-none select-none",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
            "aria-disabled:opacity-50 aria-disabled:pointer-events-none",
            variantClasses[variant],
            sizeClasses[size],
            fullWidth && "w-full",
            className,
          ),
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className={clsx(spinnerSize[size], "animate-spin flex-shrink-0")} />
        ) : effectiveLeftIcon ? (
          <span className="flex-shrink-0 flex items-center">{effectiveLeftIcon}</span>
        ) : iconOnly ? (
          children
        ) : null}

        {!iconOnly && <Slottable>{children}</Slottable>}

        {!loading && rightIcon && size !== "icon" && (
          <span className="flex-shrink-0 flex items-center">{rightIcon}</span>
        )}
      </Comp>
    );
  },
);

Button.displayName = "Button";
