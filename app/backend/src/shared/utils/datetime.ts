// Store-local date/time helpers. All accept an optional IANA timezone (e.g.
// "America/Toronto", from the tenant's Settings → Regional). When the timezone
// is undefined they fall back to the runtime's local timezone (the store PC's
// clock), which matches the pre-existing behaviour.

/** "YYYYMMDD" for `date` in the given timezone — used for the invoice date
 *  segment AND the daily-per-store sequence key, so both always agree. */
export function zonedDateKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

/** Human date for the receipt, e.g. "Jul 9, 2026", in the store timezone. */
export function formatReceiptDate(date: Date, timeZone?: string, locale = "en-US"): string {
  return date.toLocaleDateString(locale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Human time for the receipt, e.g. "10:04:35 PM", in the store timezone. */
export function formatReceiptTime(date: Date, timeZone?: string, locale = "en-US"): string {
  return date.toLocaleTimeString(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
