import type { Axis, ProvinceProfile, TaxComponent, Treatment } from "../types/tax.types";

/**
 * Components that survive the per-axis treatment. A component is charged only
 * if its axis is TAXABLE; ZERO and EXEMPT both drop it (the reporting
 * distinction between them is carried by the category, not the math).
 */
export function resolveComponents(
  profile: ProvinceProfile,
  treatment: Record<Axis, Treatment>,
): TaxComponent[] {
  return profile.components.filter((c) => treatment[c.axis] === "TAXABLE");
}
