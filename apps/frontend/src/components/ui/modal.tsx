/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { X, AlertTriangle } from "lucide-react";
import { Button, type ButtonVariant } from "./button";

// ── Nesting depth — each open modal increments this for stacking ──────────────
const ModalDepthCtx = createContext(0);

// ── Types ─────────────────────────────────────────────────────────────────────
export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";
export type ModalVariant = "default" | "confirm" | "form";

export interface ModalActionConfig {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  variant?: ModalVariant;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  hideCloseButton?: boolean;
  primaryAction?: ModalActionConfig;
  secondaryAction?: ModalActionConfig;
  children?: React.ReactNode;
  className?: string;
}

// ── Size map ───────────────────────────────────────────────────────────────────
const SIZE_CLS: Record<ModalSize, string> = {
  sm: "w-full max-w-sm",
  md: "w-full max-w-md",
  lg: "w-full max-w-lg",
  xl: "w-full max-w-2xl",
  full: "w-screen max-w-none !rounded-none",
};

// Focusable elements for focus-trap
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// ── Component ─────────────────────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  variant = "default",
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  primaryAction,
  secondaryAction,
  children,
  className,
}: ModalProps) {
  const depth = useContext(ModalDepthCtx);
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Two-phase: mounted controls DOM presence; visible controls CSS classes
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      setMounted(true);
      // Double rAF: element must be in DOM before we apply the visible class
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        prevFocusRef.current?.focus();
      }, 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Prevent body scroll; compensate for scrollbar to avoid layout shift
  useEffect(() => {
    if (!mounted) return;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [mounted]);

  // ESC key
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, closeOnEsc, onClose]);

  // Focus trap
  useEffect(() => {
    if (!visible || !panelRef.current) return;
    const panel = panelRef.current;
    const nodes = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    first?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [visible]);

  if (!mounted || typeof document === "undefined") return null;

  // Nested modals stack by incrementing z-index
  const zBackdrop = 400 + depth * 10;
  const zPanel = zBackdrop + 1;
  const isConfirm = variant === "confirm";
  const isFull = size === "full";

  return createPortal(
    <ModalDepthCtx.Provider value={depth + 1}>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={closeOnBackdrop ? onClose : undefined}
        style={{ zIndex: zBackdrop }}
        className={clsx(
          "fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]",
          "transition-opacity duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Outer scroll container (handles very-tall modals on small viewports) */}
      <div
        style={{ zIndex: zPanel }}
        className={clsx("fixed inset-0", isFull ? "" : "overflow-y-auto")}
        aria-hidden={!visible}
      >
        <div
          className={clsx(isFull ? "h-full" : "flex min-h-full items-center justify-center p-4")}
        >
          {/* Panel */}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            onClick={(e) => e.stopPropagation()}
            className={twMerge(
              clsx(
                "relative flex flex-col bg-white dark:bg-slate-900 overflow-hidden",
                "border border-slate-200/60 dark:border-slate-800",
                "transition-all duration-200 ease-out",
                isFull ? "h-full w-full" : `rounded-xl ${SIZE_CLS[size]} max-h-[90dvh]`,
                visible
                  ? "opacity-100 scale-100 translate-y-0"
                  : "opacity-0 scale-[0.96] -translate-y-2",
                className,
              ),
            )}
          >
            {/* Confirm variant: danger accent bar */}
            {isConfirm && (
              <div className="h-0.5 w-full flex-shrink-0 bg-gradient-to-r from-danger-500 to-danger-600" />
            )}

            {/* Header */}
            {(title || description || !hideCloseButton) && (
              <div
                className={clsx(
                  "flex items-start gap-3 px-6 border-b border-slate-100 dark:border-slate-800 flex-shrink-0",
                  isConfirm ? "py-5" : "py-4",
                )}
              >
                {/* Warning icon for confirm */}
                {isConfirm && (
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-danger-50">
                    <AlertTriangle className="h-4 w-4 text-danger-600" strokeWidth={2} />
                  </span>
                )}

                <div className="flex-1 min-w-0">
                  {title && (
                    <h2
                      id={titleId}
                      className="text-base font-medium text-slate-900 dark:text-slate-100 leading-snug"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id={descId}
                      className={clsx(
                        "text-sm text-slate-500 dark:text-slate-400 leading-relaxed",
                        title && "mt-1",
                      )}
                    >
                      {description}
                    </p>
                  )}
                </div>

                {!hideCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className={clsx(
                      "flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-lg",
                      "text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800",
                      "transition-colors duration-150 outline-none",
                      "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                    )}
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
              </div>
            )}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">{children}</div>

            {/* Sticky footer */}
            {(primaryAction || secondaryAction) && (
              <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
                {secondaryAction && (
                  <Button
                    variant={secondaryAction.variant ?? "secondary"}
                    size="sm"
                    onClick={secondaryAction.onClick}
                    loading={secondaryAction.loading}
                    disabled={secondaryAction.disabled}
                  >
                    {secondaryAction.label}
                  </Button>
                )}
                {primaryAction && (
                  <Button
                    variant={primaryAction.variant ?? (isConfirm ? "danger" : "primary")}
                    size="sm"
                    onClick={primaryAction.onClick}
                    loading={primaryAction.loading}
                    disabled={primaryAction.disabled}
                  >
                    {primaryAction.label}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalDepthCtx.Provider>,
    document.body,
  );
}
