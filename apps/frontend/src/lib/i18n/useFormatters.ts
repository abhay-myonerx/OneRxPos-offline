import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { bcp47, dateFnsLocale, isLocale, type Locale } from "./locale";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDate, formatDateTime, formatTimeAgo } from "@/lib/date/format-date";

export function useFormatters() {
  const { i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "en";

  return useMemo(() => {
    const tag = bcp47(locale);
    const dfl = dateFnsLocale(locale);
    return {
      money: (value: string | number | null | undefined, opts?: { currency?: string }) =>
        formatMoney(value, { locale: tag, currency: opts?.currency ?? "CAD" }),
      date: (value: string | Date, fmt?: string) => formatDate(value, fmt, dfl),
      dateTime: (value: string | Date) => formatDateTime(value, dfl),
      timeAgo: (value: string | Date) => formatTimeAgo(value, dfl),
      number: (value: number, opts?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(tag, opts).format(value),
    };
  }, [locale]);
}
