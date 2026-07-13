"use client";

/**
 * Owns theme application for the whole app:
 *  - hydrates the chosen mode from localStorage on mount,
 *  - resolves `system` against the OS and paints the `.dark` class,
 *  - keeps Redux's `resolvedTheme` in sync for UI that needs it,
 *  - re-resolves live when the OS preference flips (system mode only),
 *  - persists the chosen mode back to localStorage.
 *
 * A no-flash inline script (THEME_INIT_SCRIPT, see app/layout.tsx) sets the
 * class before first paint; this provider then takes over and reconciles.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setThemeMode, setResolvedTheme } from "@/features/settings/state/ui-prefs.slice";
import {
  applyResolvedTheme,
  getSystemTheme,
  readStoredThemeMode,
  resolveTheme,
  writeStoredThemeMode,
} from "@/lib/theme/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((s) => s.uiPrefs.themeMode);

  // Hydrate the stored choice once on mount.
  useEffect(() => {
    dispatch(setThemeMode(readStoredThemeMode()));
  }, [dispatch]);

  // Apply + persist whenever the chosen mode changes.
  useEffect(() => {
    const resolved = resolveTheme(themeMode);
    applyResolvedTheme(resolved);
    dispatch(setResolvedTheme(resolved));
    writeStoredThemeMode(themeMode);
  }, [themeMode, dispatch]);

  // Follow live OS changes while in `system` mode.
  useEffect(() => {
    if (themeMode !== "system" || typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const resolved = getSystemTheme();
      applyResolvedTheme(resolved);
      dispatch(setResolvedTheme(resolved));
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode, dispatch]);

  return <>{children}</>;
}
