import { cn } from "@/lib/utils/cn";

type Tone = "primary" | "danger" | "muted";

const toneBadge: Record<Tone, string> = {
  primary:
    "border-primary-100 bg-primary-50 text-primary-600 dark:border-primary-400/30 dark:bg-primary-400/10 dark:text-primary-300",
  danger:
    "border-danger-100 bg-danger-50 text-danger-500 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-400",
  muted:
    "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

const toneCode: Record<Tone, string> = {
  primary: "from-primary-500 to-primary-800 dark:from-primary-300 dark:to-primary-500",
  danger: "from-danger-400 to-danger-600 dark:from-danger-300 dark:to-danger-500",
  muted: "from-slate-400 to-slate-600 dark:from-slate-300 dark:to-slate-500",
};

interface FullScreenStateProps {
  /** Large watermark code shown above the title (e.g. "404"). Optional. */
  code?: string;
  /** Icon rendered in the badge above the title. */
  icon?: React.ReactNode;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  /** Action buttons / links. */
  actions?: React.ReactNode;
  /** Extra content under the actions (e.g. an error reference id). */
  footer?: React.ReactNode;
  tone?: Tone;
}

/**
 * Branded, full-viewport state shell used by the route-level `not-found`,
 * `error`, and similar standalone pages. Modern SaaS look: soft floating
 * gradient orbs, a faint dot grid, and a glassy centred card — fully
 * theme-aware (light / dark).
 */
export function FullScreenState({
  code,
  icon,
  eyebrow,
  title,
  description,
  actions,
  footer,
  tone = "primary",
}: FullScreenStateProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Faint dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.6] dark:opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(circle, rgb(148 163 184 / 0.25) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, black 35%, transparent 100%)",
        }}
      />
      {/* Floating gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-primary-400/20 blur-3xl animate-float-slow dark:bg-primary-500/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-primary-600/15 blur-3xl animate-float-slow-reverse dark:bg-primary-700/15"
      />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12">
        {/* Brand */}
        <div className="mb-10 flex items-center gap-2.5">
          <span
            className="h-9 w-9 rounded-xl flex items-center justify-center text-white font-bold text-base tracking-tight"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))",
            }}
            aria-hidden
          >
            Rx
          </span>
          <span className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            RX POS
          </span>
        </div>

        <div className="w-full max-w-md animate-fade-in rounded-2xl border border-slate-200/70 bg-white/80 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/70 dark:shadow-black/20 sm:p-10">
          {code && (
            <p
              className={cn(
                "select-none bg-gradient-to-b bg-clip-text text-6xl font-extrabold leading-none tracking-tight text-transparent sm:text-7xl",
                toneCode[tone],
              )}
            >
              {code}
            </p>
          )}

          {icon && (
            <div
              className={cn(
                "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border",
                code ? "mt-6" : "",
                toneBadge[tone],
              )}
            >
              {icon}
            </div>
          )}

          {eyebrow && (
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {eyebrow}
            </p>
          )}

          <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-50 sm:text-2xl">
            {title}
          </h1>

          {description && (
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </p>
          )}

          {actions && (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {actions}
            </div>
          )}

          {footer && <div className="mt-6">{footer}</div>}
        </div>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-600">
          RX POS · Point of Sale &amp; Inventory
        </p>
      </div>
    </main>
  );
}
