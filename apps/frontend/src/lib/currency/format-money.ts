import { m } from "./money";

interface FormatOptions {
  currency?: string; // ISO 4217, e.g. "USD", "BDT", "EUR"
  locale?: string; // BCP 47, e.g. "en-US", "bn-BD"
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** If true, skip Intl and just format "symbol + number" ("$ 1,200.00"). */
  symbol?: string;
}

const DEFAULT_CURRENCY = "CAD";
const DEFAULT_LOCALE = "en-CA";

export function formatMoney(
  value: string | number | null | undefined,
  opts: FormatOptions = {},
): string {
  if (value === null || value === undefined || value === "") return "—";

  let num: number;
  try {
    num = m(value).toNumber();
  } catch {
    return "—";
  }
  if (!Number.isFinite(num)) return "—";

  const minFrac = opts.minimumFractionDigits ?? 2;
  const maxFrac = opts.maximumFractionDigits ?? 2;

  // Explicit symbol override — some currencies lack good Intl support
  // (e.g. custom/internal currencies). Symbol + grouped number is safer.
  if (opts.symbol) {
    const formatted = new Intl.NumberFormat(opts.locale ?? DEFAULT_LOCALE, {
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
    }).format(num);
    return `${opts.symbol}${formatted}`;
  }

  return new Intl.NumberFormat(opts.locale ?? DEFAULT_LOCALE, {
    style: "currency",
    currency: opts.currency ?? DEFAULT_CURRENCY,
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  }).format(num);
}

export function formatCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  let num: number;
  try {
    num = m(value).toNumber();
  } catch {
    return "—";
  }
  if (!Number.isFinite(num)) return "—";

  if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toFixed(2);
}
