/**
 * Theme primitives — framework-agnostic helpers shared by the no-flash
 * boot script, the ThemeProvider, and the settings UI.
 *
 * `mode` is the user's choice (light / dark / system). `resolved` is the
 * concrete theme actually painted — `system` resolves against the OS
 * `prefers-color-scheme` at apply-time and re-resolves when the OS flips.
 */

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** localStorage key — also hard-coded in THEME_INIT_SCRIPT below. Keep in sync. */
export const THEME_STORAGE_KEY = "rxpos.theme";
// migrate-on-read; allowlisted in the no-posvelo guard. Exported (test-only
// use) so the migration regression test can reference the exact legacy key
// without hard-coding the literal string itself.
export const LEGACY_THEME_STORAGE_KEY = "posvelo.theme";

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? getSystemTheme() : mode;
}

/** Toggle the `.dark` class + native `color-scheme` on <html>. */
export function applyResolvedTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    let v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === null) {
      const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      if (legacy === "light" || legacy === "dark" || legacy === "system") {
        window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
        window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        v = legacy;
      }
    }
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Private mode / storage disabled — fall through to default.
  }
  return "system";
}

export function writeStoredThemeMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private mode / storage disabled — silently ignore.
  }
}

/**
 * Inline script injected into <head> so the correct theme class is set
 * BEFORE first paint — eliminates the white flash on dark-mode loads.
 * Must stay dependency-free and reference the literal storage key.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}')||localStorage.getItem('${LEGACY_THEME_STORAGE_KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
