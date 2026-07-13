import { useCallback } from "react";
import { useAppSelector } from "@/store/hooks";
import { formatMoney } from "@/lib/currency/format-money";

export function useCurrency() {
  const tenant = useAppSelector((s) => s.auth.tenant);

  const currency = tenant?.currency ?? "USD";
  const symbol = tenant?.currencySymbol;
  // Locale could come from user preferences later; for now derive from
  // common currency codes.
  const locale = deriveLocale(currency);

  const format = useCallback(
    (value: string | number | null | undefined) =>
      formatMoney(value, {
        currency,
        symbol,
        locale,
      }),
    [currency, symbol, locale],
  );

  return { currency, symbol, locale, format };
}

function deriveLocale(currency: string): string {
  switch (currency) {
    case "BDT":
      return "bn-BD";
    case "INR":
      return "en-IN";
    case "PKR":
      return "en-PK";
    case "EUR":
      return "en-IE";
    case "GBP":
      return "en-GB";
    case "JPY":
      return "ja-JP";
    default:
      return "en-US";
  }
}
