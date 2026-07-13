"use client";

interface AuthBrandPanelProps {
  badge?: string;
  title?: string;
  subtitle?: string;
  brandName?: string;
  tagline?: string;
  features?: string[];
  stats?: { label: string; value: string }[];
  /** When set, replaces the SVG storefront with a background image. */
  imageSrc?: string;
  /** Hides the floating stat cards — useful for image mode. */
  hideStats?: boolean;
  /** When set, replaces the default features list at the bottom. */
  bottomContent?: React.ReactNode;
}

const DEFAULT_FEATURES = [
  "Lightning fast checkout in under 3 seconds",
  "Real-time inventory across every store",
  "Bank-grade security with role-based access",
];

const DEFAULT_STATS = [
  { label: "Today's Sales", value: "$2,847" },
  { label: "Orders", value: "142" },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3 text-white" aria-hidden>
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StorefrontScene() {
  return (
    <svg
      viewBox="0 0 480 360"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto"
      aria-hidden
    >
      <defs>
        <linearGradient id="bp-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <linearGradient id="bp-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
        <linearGradient id="bp-roof" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-accent-400)" />
          <stop offset="100%" stopColor="var(--color-primary-400)" />
        </linearGradient>
        <linearGradient id="bp-counter" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
        </linearGradient>
      </defs>
      <ellipse cx="240" cy="320" rx="200" ry="22" fill="url(#bp-floor)" />
      <rect
        x="80"
        y="90"
        width="320"
        height="200"
        rx="14"
        fill="url(#bp-wall)"
        stroke="rgba(255,255,255,0.18)"
      />
      <path d="M70 100 L410 100 L390 70 L90 70 Z" fill="url(#bp-roof)" opacity="0.95" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <path
          key={i}
          d={`M${90 + i * 40} 70 L${110 + i * 40} 100`}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.5"
        />
      ))}
      <rect x="190" y="46" width="100" height="22" rx="6" fill="rgba(255,255,255,0.92)" />
      <text
        x="240"
        y="62"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="12"
        fill="var(--color-primary-700)"
      >
        RX POS
      </text>
      <rect x="100" y="120" width="120" height="6" rx="2" fill="rgba(255,255,255,0.35)" />
      <rect x="100" y="170" width="120" height="6" rx="2" fill="rgba(255,255,255,0.35)" />
      <rect
        x="108"
        y="100"
        width="22"
        height="20"
        rx="3"
        fill="var(--color-accent-300)"
        opacity="0.85"
      />
      <rect
        x="138"
        y="98"
        width="18"
        height="22"
        rx="3"
        fill="var(--color-primary-300)"
        opacity="0.85"
      />
      <rect x="164" y="104" width="24" height="16" rx="3" fill="rgba(255,255,255,0.85)" />
      <rect
        x="196"
        y="100"
        width="18"
        height="20"
        rx="3"
        fill="var(--color-accent-200)"
        opacity="0.9"
      />
      <rect
        x="108"
        y="148"
        width="20"
        height="22"
        rx="3"
        fill="var(--color-primary-200)"
        opacity="0.9"
      />
      <circle cx="148" cy="160" r="11" fill="var(--color-accent-300)" opacity="0.9" />
      <rect x="170" y="150" width="22" height="20" rx="3" fill="rgba(255,255,255,0.85)" />
      <rect
        x="200"
        y="148"
        width="14"
        height="22"
        rx="3"
        fill="var(--color-accent-400)"
        opacity="0.9"
      />
      <rect x="240" y="200" width="160" height="80" rx="8" fill="url(#bp-counter)" />
      <rect x="240" y="200" width="160" height="14" rx="6" fill="rgba(255,255,255,0.55)" />
      <rect x="266" y="170" width="56" height="38" rx="5" fill="var(--color-slate-800)" />
      <rect
        x="270"
        y="174"
        width="48"
        height="22"
        rx="2"
        fill="var(--color-accent-300)"
        opacity="0.9"
      />
      <rect x="273" y="178" width="30" height="2" rx="1" fill="rgba(255,255,255,0.9)" />
      <rect x="273" y="183" width="22" height="2" rx="1" fill="rgba(255,255,255,0.7)" />
      <rect x="273" y="188" width="26" height="2" rx="1" fill="rgba(255,255,255,0.7)" />
      <rect x="340" y="178" width="40" height="30" rx="4" fill="var(--color-slate-700)" />
      <rect x="346" y="172" width="28" height="10" rx="2" fill="rgba(255,255,255,0.85)" />
      <rect x="348" y="174" width="24" height="2" rx="1" fill="var(--color-slate-400)" />
      <rect x="348" y="178" width="18" height="2" rx="1" fill="var(--color-slate-400)" />
      <circle cx="200" cy="218" r="14" fill="#f4c9a8" />
      <path
        d="M186 215 Q186 198 200 198 Q214 198 214 215 L214 210 Q210 204 200 204 Q190 204 186 210 Z"
        fill="var(--color-slate-800)"
      />
      <circle cx="195" cy="220" r="1.4" fill="var(--color-slate-800)" />
      <circle cx="205" cy="220" r="1.4" fill="var(--color-slate-800)" />
      <path
        d="M196 226 Q200 229 204 226"
        stroke="var(--color-slate-800)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M178 240 Q200 232 222 240 L226 286 L174 286 Z" fill="var(--color-accent-500)" />
      <rect x="196" y="234" width="8" height="40" fill="rgba(255,255,255,0.35)" />
      <path
        d="M214 246 Q236 234 268 200"
        stroke="#f4c9a8"
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="372" cy="238" r="11" fill="#e7b389" />
      <path d="M358 254 Q372 248 386 254 L388 286 L356 286 Z" fill="var(--color-primary-500)" />
      <rect x="392" y="260" width="20" height="22" rx="2" fill="rgba(255,255,255,0.85)" />
      <path
        d="M396 260 Q396 254 402 254 Q408 254 408 260"
        stroke="var(--color-slate-700)"
        strokeWidth="1.4"
        fill="none"
      />
      <g opacity="0.85">
        <path
          d="M120 60 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 z"
          fill="rgba(255,255,255,0.7)"
        />
        <path
          d="M390 130 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 z"
          fill="rgba(255,255,255,0.55)"
        />
        <circle cx="60" cy="180" r="3" fill="rgba(255,255,255,0.5)" />
        <circle cx="430" cy="240" r="2.5" fill="rgba(255,255,255,0.5)" />
      </g>
    </svg>
  );
}

function StatCard({
  label,
  value,
  accent,
  delay,
}: {
  label: string;
  value: string;
  accent: "primary" | "accent";
  delay: string;
}) {
  return (
    <div
      className="rounded-2xl bg-white/95 backdrop-blur shadow-xl border border-white/40 px-4 py-3 min-w-[160px] animate-auth-float"
      style={{ animationDelay: delay }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{
            background:
              accent === "primary"
                ? "linear-gradient(135deg, var(--color-primary-500), var(--color-primary-700))"
                : "linear-gradient(135deg, var(--color-accent-400), var(--color-accent-600))",
          }}
        >
          {accent === "primary" ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <path
                d="M3 17l6-6 4 4 8-8"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 7h7v7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
              <path
                d="M5 7h14l-1.5 11a2 2 0 01-2 1.8H8.5a2 2 0 01-2-1.8L5 7z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M9 7V5a3 3 0 116 0v2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none">
            {label}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 leading-none tracking-tight">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthBrandPanel({
  badge,
  title,
  subtitle,
  brandName = "RX POS",
  tagline,
  features = DEFAULT_FEATURES,
  stats = DEFAULT_STATS,
  imageSrc,
  hideStats,
  bottomContent,
}: AuthBrandPanelProps) {
  const displayTagline = tagline ?? subtitle ?? title ?? "";

  return (
    <div
      className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 relative overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(155deg, var(--color-primary-900) 0%, var(--color-primary-600) 55%, var(--color-primary-800) 100%)",
      }}
    >
      {/* image background mode (used by setup wizard) */}
      {imageSrc && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageSrc})` }}
            aria-hidden
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(155deg, rgba(30,39,88,0.92) 0%, rgba(35,54,153,0.78) 55%, rgba(29,41,106,0.92) 100%)",
            }}
            aria-hidden
          />
        </>
      )}

      {/* ambient blobs (only without image) */}
      {!imageSrc && (
        <>
          <div
            className="absolute -top-24 -right-24 w-[380px] h-[380px] rounded-full animate-float-slow"
            style={{
              background: "radial-gradient(circle, rgba(2,188,245,0.32) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-12 -left-16 w-[280px] h-[280px] rounded-full animate-float-slow-reverse"
            style={{
              background: "radial-gradient(circle, rgba(59,94,248,0.28) 0%, transparent 70%)",
            }}
          />
        </>
      )}

      <div className="relative z-10">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl xl:text-5xl font-extrabold tracking-tight text-white">
            {brandName}
          </span>
          {badge && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/15 backdrop-blur border border-white/20 text-[10px] font-semibold uppercase tracking-wider text-white/90">
              {badge}
            </span>
          )}
        </div>
        {displayTagline && (
          <p className="text-[15px] text-white/80 leading-relaxed mt-3 max-w-md">
            {displayTagline}
          </p>
        )}
      </div>

      {/* middle: only render scene + stats when no image */}
      {!imageSrc && (
        <div className="relative z-10 my-8 max-w-[520px] mx-auto w-full">
          <StorefrontScene />
          {!hideStats && (
            <>
              <div className="absolute -top-2 -left-4">
                <StatCard
                  label={stats[0]?.label ?? "Today's Sales"}
                  value={stats[0]?.value ?? "$2,847"}
                  accent="primary"
                  delay="0s"
                />
              </div>
              <div className="absolute bottom-6 -right-2">
                <StatCard
                  label={stats[1]?.label ?? "Orders"}
                  value={stats[1]?.value ?? "142"}
                  accent="accent"
                  delay="1.2s"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* bottom */}
      <div className="relative z-10">
        {bottomContent ? (
          bottomContent
        ) : (
          <ul className="space-y-3 max-w-md">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--color-accent-400), var(--color-primary-500))",
                    boxShadow: "0 4px 14px rgba(2,188,245,0.35)",
                  }}
                >
                  <CheckIcon />
                </span>
                <span className="text-sm font-medium text-white/90 leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
