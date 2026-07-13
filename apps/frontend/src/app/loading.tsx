import { BrandSpinner } from "@/components/shared/feedback/BrandSpinner";

export default function Loading() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 to-white px-6 dark:from-slate-950 dark:to-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary-400/15 blur-3xl dark:bg-primary-500/10"
      />

      <div className="relative z-10 flex flex-col items-center gap-7 animate-fade-in">
        <div className="flex items-center gap-2.5">
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

        <BrandSpinner size={46} />

        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Loading your workspace…
        </p>
      </div>
    </main>
  );
}
