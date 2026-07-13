import { isLocale, type Locale } from "./locale";

// Mirrors src/lib/theme/theme.ts's THEME_STORAGE_KEY convention.
export const LOCALE_STORAGE_KEY = "rxpos.locale";
// migrate-on-read; allowlisted in the no-posvelo guard. Exported (test-only
// use) so the migration regression test can reference the exact legacy key
// without hard-coding the literal string itself.
export const LEGACY_LOCALE_STORAGE_KEY = "posvelo.locale";

export function readStoredLocale(): Locale {
  try {
    let v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === null) {
      const legacy = window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
      if (isLocale(legacy)) {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, legacy);
        window.localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY);
        v = legacy;
      }
    }
    return isLocale(v) ? v : "en";
  } catch {
    return "en";
  }
}

export function writeStoredLocale(l: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, l);
  } catch {
    /* storage unavailable — non-fatal, matches theme helper */
  }
}
