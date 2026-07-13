import { cn } from "@/lib/utils/cn";

interface BrandSpinnerProps {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

/**
 * A modern dual-ring spinner in the brand colour. The outer ring is a faint
 * track; the inner arc rotates. Pure CSS (uses the global `spin` keyframes) so
 * it works in server components and Suspense fallbacks.
 */
export function BrandSpinner({ size = 44, className }: BrandSpinnerProps) {
  const border = Math.max(2, Math.round(size / 14));
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("relative inline-flex", className)}
      style={{ width: size, height: size }}
    >
      {/* Track */}
      <span
        className="absolute inset-0 rounded-full border-slate-200 dark:border-slate-700/70"
        style={{ borderWidth: border, borderStyle: "solid" }}
      />
      {/* Rotating arc */}
      <span
        className="absolute inset-0 rounded-full border-transparent border-t-primary-500 dark:border-t-primary-400"
        style={{
          borderWidth: border,
          borderStyle: "solid",
          animation: "spin 0.7s linear infinite",
        }}
      />
    </span>
  );
}
