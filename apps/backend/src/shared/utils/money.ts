// Backend money helpers are now sourced from rx-pos-shared (single source of
// truth). Kept as a shim so existing `../../shared/utils/money` imports (sale,
// payroll, etc.) keep working unchanged.
export {
  m, sum, max, min, gt, gte, toDbNumber, toDisplay, computeTax, Decimal,
} from "rx-pos-shared";
export type { MoneyInput, TaxResult } from "rx-pos-shared";
