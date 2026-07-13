import type { Axis, ProvinceCode, TaxCategory, Treatment, ExemptionType } from "../types/tax.types";

const RANK: Record<Treatment, number> = { TAXABLE: 0, ZERO: 1, EXEMPT: 2 };

/** More-relieving of two treatments (EXEMPT > ZERO > TAXABLE). */
function mostRelieving(a: Treatment, b: Treatment): Treatment {
  return RANK[a] >= RANK[b] ? a : b;
}

export function categoryTreatment(category: TaxCategory): Record<Axis, Treatment> {
  switch (category) {
    case "STANDARD":
      return { FEDERAL: "TAXABLE", PROVINCIAL: "TAXABLE" };
    case "ZERO_RATED":
      return { FEDERAL: "ZERO", PROVINCIAL: "ZERO" };
    case "PROVINCIAL_RELIEF":
      return { FEDERAL: "TAXABLE", PROVINCIAL: "ZERO" };
    case "EXEMPT":
      return { FEDERAL: "EXEMPT", PROVINCIAL: "EXEMPT" };
  }
}

export function exemptionTreatment(
  type: ExemptionType,
  _province: ProvinceCode,
): Record<Axis, Treatment> {
  switch (type) {
    case "FIRST_NATIONS":
      // Point-of-sale relief of the provincial portion; GST/federal still applies.
      return { FEDERAL: "TAXABLE", PROVINCIAL: "ZERO" };
    case "DIPLOMATIC":
      return { FEDERAL: "EXEMPT", PROVINCIAL: "EXEMPT" };
  }
}

export function resolveTreatment(
  category: TaxCategory,
  exemption: ExemptionType | null,
  province: ProvinceCode,
): Record<Axis, Treatment> {
  const cat = categoryTreatment(category);
  if (!exemption) return cat;
  const ex = exemptionTreatment(exemption, province);
  return {
    FEDERAL: mostRelieving(cat.FEDERAL, ex.FEDERAL),
    PROVINCIAL: mostRelieving(cat.PROVINCIAL, ex.PROVINCIAL),
  };
}
