import { m, Decimal } from "../money/money";
import type { Levy } from "../types/tax.types";

/** Money amount a levy contributes to a line. */
export function computeLevy(levy: Levy, lineNet: Decimal, qty: Decimal): Decimal {
  switch (levy.mode) {
    case "FLAT_PER_UNIT":
      return m(levy.amount).times(qty);
    case "FLAT_PER_LINE":
      return m(levy.amount);
    case "PERCENT":
      return lineNet.times(m(levy.amount)).div(100);
  }
}
