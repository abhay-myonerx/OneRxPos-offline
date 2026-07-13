import { enCA, frCA, type Locale as DateFnsLocale } from "date-fns/locale";

export type Locale = "en" | "fr";

export const LOCALES = ["en", "fr"] as const;

const BCP47: Record<Locale, "en-CA" | "fr-CA"> = { en: "en-CA", fr: "fr-CA" };
const DATE_FNS: Record<Locale, DateFnsLocale> = { en: enCA, fr: frCA };

export function bcp47(l: Locale): "en-CA" | "fr-CA" {
  return BCP47[l];
}

export function dateFnsLocale(l: Locale): DateFnsLocale {
  return DATE_FNS[l];
}

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "fr";
}
