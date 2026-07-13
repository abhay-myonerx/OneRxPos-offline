import type { WeightReading } from "./hal.types";

// Base conversion factors to kilograms.
const TO_KG: Record<WeightReading["unit"], number> = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
  oz: 0.028349523125,
};

/** Convert a weight value between units. */
export function convertWeight(
  value: number,
  from: WeightReading["unit"],
  to: WeightReading["unit"],
): number {
  return (value * TO_KG[from]) / TO_KG[to];
}

/** Net weight after tare (same unit). Clamped at 0. */
export function applyTare(gross: number, tare: number): number {
  return Math.max(0, gross - tare);
}

/**
 * Price a weighed item: unit price (cents per `priceUnit`) × weight, rounded to
 * the nearest cent. The weight is converted to the price unit first.
 */
export function weightPriceCents(
  unitPriceCents: number,
  weight: number,
  weightUnit: WeightReading["unit"],
  priceUnit: WeightReading["unit"] = "kg",
): number {
  const qty = convertWeight(weight, weightUnit, priceUnit);
  return Math.round(unitPriceCents * qty);
}

/** A reading is sellable only when stable and strictly positive. */
export function isSellableWeight(reading: WeightReading): boolean {
  return reading.stable && reading.value > 0;
}
