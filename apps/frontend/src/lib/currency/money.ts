// Frontend money helpers are now sourced from rx-pos-shared (single source of
// truth, shared with the backend). Kept as a shim so existing
// `@/lib/currency/money` imports across the app keep working unchanged.
export {
  m, sum, max, min, gt, gte, toApiNumber, toDisplay, computeTax, Decimal,
} from "rx-pos-shared";
export type { MoneyInput, TaxResult } from "rx-pos-shared";
