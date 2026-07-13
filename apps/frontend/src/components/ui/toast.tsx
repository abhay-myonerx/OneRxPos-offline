"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
export type ToastType = "success" | "error" | "warning" | "info";
export type ToastPosition =
  "top-right" | "top-left" | "top-center" | "bottom-right" | "bottom-left" | "bottom-center";

export interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  /** Milliseconds before auto-dismiss. 0 = persistent. Default: 4000. */
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastRecord {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration: number;
  action?: { label: string; onClick: () => void };
}

/** enter → idle → exit → collapse → (removed) */
type ToastPhase = "enter" | "idle" | "exit" | "collapse";

interface ToastState {
  record: ToastRecord;
  phase: ToastPhase;
}

export interface ToastContextValue {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  success: (title: string, opts?: Omit<ToastOptions, "type" | "title">) => string;
  error: (title: string, opts?: Omit<ToastOptions, "type" | "title">) => string;
  warning: (title: string, opts?: Omit<ToastOptions, "type" | "title">) => string;
  info: (title: string, opts?: Omit<ToastOptions, "type" | "title">) => string;
}

// ── Context ────────────────────────────────────────────────────────────────────
const ToastCtx = createContext<ToastContextValue | null>(null);

// ── Appearance per type ────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<
  ToastType,
  {
    icon: React.ReactElement;
    iconCls: string;
    barCls: string;
  }
> = {
  success: {
    icon: <CheckCircle2 className="h-4 w-4" strokeWidth={2} />,
    iconCls: "text-success-600 dark:text-success-300 bg-success-50 dark:bg-success-500/15",
    barCls: "bg-success-500",
  },
  error: {
    icon: <XCircle className="h-4 w-4" strokeWidth={2} />,
    iconCls: "text-error-600 dark:text-error-300 bg-error-50 dark:bg-error-500/15",
    barCls: "bg-error-500",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" strokeWidth={2} />,
    iconCls: "text-warning-600 dark:text-warning-300 bg-warning-50 dark:bg-warning-500/15",
    barCls: "bg-warning-500",
  },
  info: {
    icon: <Info className="h-4 w-4" strokeWidth={2} />,
    iconCls: "text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-500/15",
    barCls: "bg-primary-500",
  },
};

const POSITION_CLS: Record<ToastPosition, string> = {
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
};

// ── Individual toast item ──────────────────────────────────────────────────────
function ToastItem({ state, onDismiss }: { state: ToastState; onDismiss: (id: string) => void }) {
  const { record, phase } = state;
  const cfg = TYPE_CONFIG[record.type];
  const isExiting = phase === "exit" || phase === "collapse";

  return (
    /*
     * Outer wrapper handles the height-collapse phase.
     * overflow:hidden is crucial — it clips the card as max-height shrinks.
     */
    <div
      style={{
        maxHeight: phase === "collapse" ? "0px" : "200px",
        overflow: "hidden",
        transition:
          phase === "collapse"
            ? "max-height 160ms ease-in, margin-bottom 160ms ease-in"
            : undefined,
      }}
      className={clsx(phase === "collapse" ? "mb-0" : "mb-3")}
    >
      {/*
       * Card handles slide-in (keyframe animation) and slide-out (CSS transition).
       * The keyframe is applied when phase === 'enter', the CSS transition when
       * phase changes to 'exit'/'collapse'. They never conflict because keyframes
       * take priority over transitions for the same properties.
       */}
      <div
        className={clsx(
          "relative flex w-[360px] max-w-[calc(100vw-2rem)] items-start gap-3",
          "rounded-xl border border-slate-200/80 bg-white dark:bg-slate-900 shadow-lg",
          "px-4 py-3.5",
          "transition-[opacity,transform] duration-[200ms] ease-in",
          // Enter: keyframe overrides transition
          phase === "enter" && "animate-toast-enter",
          // Exit / collapse: transition to off-screen right
          isExiting && "opacity-0 translate-x-full",
        )}
      >
        {/* Type icon */}
        <span
          className={clsx(
            "mt-px flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full",
            cfg.iconCls,
          )}
          aria-hidden
        >
          {cfg.icon}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
            {record.title}
          </p>
          {record.description && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {record.description}
            </p>
          )}
          {record.action && (
            <button
              type="button"
              onClick={() => {
                record.action!.onClick();
                onDismiss(record.id);
              }}
              className="mt-1.5 text-xs font-semibold text-primary-600 dark:text-primary-300 hover:text-primary-700 transition-colors duration-100 outline-none focus-visible:underline"
            >
              {record.action.label}
            </button>
          )}
        </div>

        {/* Dismiss button */}
        <button
          type="button"
          onClick={() => onDismiss(record.id)}
          aria-label="Dismiss"
          className={clsx(
            "flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-md",
            "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800",
            "transition-colors duration-100 outline-none",
            "focus-visible:ring-1 focus-visible:ring-primary-500",
          )}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>

        {/* Progress bar — shrinks from left to right over `duration` ms */}
        {record.duration > 0 && phase !== "exit" && phase !== "collapse" && (
          <div
            className={clsx(
              "absolute bottom-0 left-0 right-0 h-[2px] rounded-b-xl opacity-40",
              cfg.barCls,
            )}
            style={{
              transformOrigin: "left",
              animation: `shrinkX ${record.duration}ms linear forwards`,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── Toast container (portal) ───────────────────────────────────────────────────
function ToastContainer({
  states,
  position,
  onDismiss,
}: {
  states: ToastState[];
  position: ToastPosition;
  onDismiss: (id: string) => void;
}) {
  if (typeof document === "undefined" || states.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      aria-label="Notifications"
      className={clsx("fixed z-[600] flex flex-col items-end", POSITION_CLS[position])}
    >
      {states.map((s) => (
        <ToastItem key={s.record.id} state={s} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

// ── Provider ───────────────────────────────────────────────────────────────────
export interface ToastProviderProps {
  children: React.ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

export function ToastProvider({
  children,
  position = "top-right",
  maxToasts = 5,
}: ToastProviderProps) {
  const [states, setStates] = useState<ToastState[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearKey = (key: string) => {
    const t = timers.current.get(key);
    if (t !== undefined) {
      clearTimeout(t);
      timers.current.delete(key);
    }
  };

  const dismiss = useCallback((id: string) => {
    clearKey(`auto_${id}`);

    // Phase: exit — card slides out (200 ms)
    setStates((prev) =>
      prev.map((s) => (s.record.id === id ? { ...s, phase: "exit" as ToastPhase } : s)),
    );

    timers.current.set(
      id,
      setTimeout(() => {
        // Phase: collapse — outer wrapper height shrinks (160 ms)
        setStates((prev) =>
          prev.map((s) => (s.record.id === id ? { ...s, phase: "collapse" as ToastPhase } : s)),
        );
        timers.current.set(
          `${id}_c`,
          setTimeout(() => {
            // Remove
            setStates((prev) => prev.filter((s) => s.record.id !== id));
            clearKey(`${id}_c`);
          }, 165),
        );
        clearKey(id);
      }, 210),
    );
  }, []);

  const toast = useCallback(
    (opts: ToastOptions): string => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const duration = opts.duration ?? 4000;
      const record: ToastRecord = {
        id,
        title: opts.title,
        description: opts.description,
        type: opts.type ?? "info",
        duration,
        action: opts.action,
      };

      setStates((prev) => {
        const next: ToastState[] = [...prev, { record, phase: "enter" }];
        // Trim oldest idle/entering toasts when over max
        if (next.length <= maxToasts) return next;
        let excess = next.length - maxToasts;
        return next.filter((s) => {
          if (excess > 0 && s.record.id !== id && (s.phase === "enter" || s.phase === "idle")) {
            excess--;
            return false;
          }
          return true;
        });
      });

      // Transition enter → idle after enter animation completes
      timers.current.set(
        `enter_${id}`,
        setTimeout(() => {
          setStates((prev) =>
            prev.map((s) =>
              s.record.id === id && s.phase === "enter" ? { ...s, phase: "idle" } : s,
            ),
          );
          clearKey(`enter_${id}`);
        }, 230),
      );

      // Schedule auto-dismiss
      if (duration > 0) {
        timers.current.set(
          `auto_${id}`,
          setTimeout(() => dismiss(id), duration),
        );
      }

      return id;
    },
    [dismiss, maxToasts],
  );

  const success = useCallback(
    (title: string, opts?: Omit<ToastOptions, "type" | "title">) =>
      toast({ ...opts, title, type: "success" }),
    [toast],
  );
  const error = useCallback(
    (title: string, opts?: Omit<ToastOptions, "type" | "title">) =>
      toast({ ...opts, title, type: "error" }),
    [toast],
  );
  const warning = useCallback(
    (title: string, opts?: Omit<ToastOptions, "type" | "title">) =>
      toast({ ...opts, title, type: "warning" }),
    [toast],
  );
  const info = useCallback(
    (title: string, opts?: Omit<ToastOptions, "type" | "title">) =>
      toast({ ...opts, title, type: "info" }),
    [toast],
  );

  const dismissAll = useCallback(() => {
    setStates((prev) => {
      prev.forEach((s) => dismiss(s.record.id));
      return prev;
    });
  }, [dismiss]);

  // Cleanup all timers on unmount
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const value: ToastContextValue = { toast, dismiss, dismissAll, success, error, warning, info };

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <ToastContainer states={states} position={position} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
