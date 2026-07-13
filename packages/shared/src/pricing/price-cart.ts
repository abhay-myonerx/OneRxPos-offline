import { m, sum, max as dmax, Decimal } from "../money/money";
import type {
  ProvinceCode, TaxCategory, ExemptionType, Levy, TaxComponentCode,
} from "../types/tax.types";
import { getProvinceProfile } from "../data/ca-rates";
import { resolveTreatment } from "../tax/treatment";
import { resolveComponents } from "../tax/engine";
import { computeLevy } from "./levies";

export interface PriceLineInput {
  id: string;
  unitPrice: string;
  qty: string;
  lineDiscount: string;
  taxCategory: TaxCategory;
  taxInclusive: boolean;
  levies: Levy[];
}

export interface PriceCartInput {
  province: ProvinceCode;
  at: Date;
  exemption: ExemptionType | null;
  cartDiscount: { mode: "flat" | "percent"; value: string };
  lines: PriceLineInput[];
}

export interface PricedLine {
  id: string;
  net: Decimal;          // pre-tax goods amount after all discounts
  discount: Decimal;     // line + share of cart discount
  taxableLevies: Decimal;
  nonTaxableLevies: Decimal;
  taxByComponent: Record<string, Decimal>; // full precision
  gross: Decimal;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: Decimal;
  discountTotal: Decimal;
  levyTotal: Decimal;
  taxBreakdown: { code: TaxComponentCode; base: Decimal; ratePct: string; amount: Decimal }[];
  taxTotal: Decimal;
  grandTotal: Decimal;
}

const ROUND2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);

export function priceCart(input: PriceCartInput): PricedCart {
  const profile = getProvinceProfile(input.province, input.at);

  // --- Pass 1: per-line net after line discount (back out tax if inclusive) ---
  const stage1 = input.lines.map((l) => {
    const treatment = resolveTreatment(l.taxCategory, input.exemption, input.province);
    const components = resolveComponents(profile, treatment);
    const combinedRate = components.reduce((r, c) => r.plus(c.ratePct), m(0));
    const lineBase = m(l.unitPrice).times(l.qty);
    const grossOrNet = lineBase.minus(l.lineDiscount);
    // Inclusive: back out net using the line's own applicable combined rate.
    const net = l.taxInclusive
      ? grossOrNet.div(m(100).plus(combinedRate).div(100))
      : grossOrNet;
    return { l, components, net: dmax(0, net), qty: m(l.qty) };
  });

  const netSum = sum(stage1.map((s) => s.net));
  const lineDiscountTotal = sum(input.lines.map((l) => m(l.lineDiscount)));

  // --- Cart discount, clamped, distributed proportionally to line nets ---
  const cartDiscountRaw =
    input.cartDiscount.mode === "percent"
      ? netSum.times(input.cartDiscount.value).div(100)
      : dmax(0, m(input.cartDiscount.value));
  const cartDiscount = dmax(0, Decimal.min(cartDiscountRaw, netSum));
  const ratio = netSum.gt(0) ? cartDiscount.div(netSum) : m(0);

  // --- Pass 2: final net, levies, per-line per-component tax (full precision) ---
  const componentTotals = new Map<string, { code: TaxComponentCode; ratePct: string; base: Decimal; amount: Decimal }>();

  const lines: PricedLine[] = stage1.map((s) => {
    const finalNet = s.net.times(m(1).minus(ratio));
    let taxableLevies = m(0);
    let nonTaxableLevies = m(0);
    for (const lv of s.l.levies) {
      const amt = computeLevy(lv, finalNet, s.qty);
      if (lv.taxable) taxableLevies = taxableLevies.plus(amt);
      else nonTaxableLevies = nonTaxableLevies.plus(amt);
    }
    const taxableBase = finalNet.plus(taxableLevies);

    // Group this line's applicable components by code. HST provinces expose two
    // components (a FEDERAL 5% slice + a PROVINCIAL slice) that share code "HST";
    // they must aggregate into ONE breakdown line — base counted once, rates summed.
    const rateByCode = new Map<TaxComponentCode, Decimal>();
    for (const c of s.components) {
      rateByCode.set(c.code, (rateByCode.get(c.code) ?? m(0)).plus(c.ratePct));
    }
    const taxByComponent: Record<string, Decimal> = {};
    for (const [code, ratePct] of rateByCode) {
      const amount = taxableBase.times(ratePct).div(100);
      taxByComponent[code] = amount;
      const agg = componentTotals.get(code) ?? { code, ratePct: ratePct.toString(), base: m(0), amount: m(0) };
      agg.base = agg.base.plus(taxableBase);
      agg.amount = agg.amount.plus(amount);
      componentTotals.set(code, agg);
    }

    const lineTax = sum(Object.values(taxByComponent));
    return {
      id: s.l.id,
      net: finalNet,
      discount: m(s.l.lineDiscount).plus(s.net.times(ratio)),
      taxableLevies,
      nonTaxableLevies,
      taxByComponent,
      gross: finalNet.plus(taxableLevies).plus(nonTaxableLevies).plus(lineTax),
    };
  });

  // --- Round each tax component ONCE (per-tax-type total) ---
  const taxBreakdown = [...componentTotals.values()].map((c) => ({
    code: c.code,
    base: ROUND2(c.base),
    ratePct: c.ratePct,
    amount: ROUND2(c.amount),
  }));

  const subtotal = sum(lines.map((l) => l.net));
  const levyTotal = sum(lines.map((l) => l.taxableLevies.plus(l.nonTaxableLevies)));
  const taxTotal = sum(taxBreakdown.map((t) => t.amount));
  const discountTotal = lineDiscountTotal.plus(cartDiscount);
  const grandTotal = subtotal.plus(levyTotal).plus(taxTotal);

  return { lines, subtotal, discountTotal, levyTotal, taxBreakdown, taxTotal, grandTotal };
}
