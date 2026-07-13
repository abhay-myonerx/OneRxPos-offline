import { format, formatDistanceToNow, parseISO, isValid, type Locale } from "date-fns";

export function formatDate(dateStr: string | Date, fmt = "MMM dd, yyyy", locale?: Locale): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  if (!isValid(d)) return "—";
  return format(d, fmt, locale ? { locale } : undefined);
}

export function formatDateTime(dateStr: string | Date, locale?: Locale): string {
  return formatDate(dateStr, "MMM dd, yyyy • hh:mm a", locale);
}

export function formatTimeAgo(dateStr: string | Date, locale?: Locale): string {
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  if (!isValid(d)) return "—";
  return formatDistanceToNow(d, { addSuffix: true, ...(locale ? { locale } : {}) });
}

export function toISODate(dateStr: string): string {
  return parseISO(dateStr).toISOString();
}

export function todayISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function thirtyDaysAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return format(d, "yyyy-MM-dd");
}
