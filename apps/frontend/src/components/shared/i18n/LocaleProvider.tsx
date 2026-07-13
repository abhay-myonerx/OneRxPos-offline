"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setLocale } from "@/features/settings/state/ui-prefs.slice";
import { bcp47 } from "@/lib/i18n/locale";
import { readStoredLocale, writeStoredLocale } from "@/lib/i18n/locale-storage";
import i18n from "@/lib/i18n/i18n";

/**
 * Owns UI-language application for the whole app (mirrors ThemeProvider):
 *  - hydrates the chosen locale from localStorage on mount,
 *  - drives i18next's active language + <html lang> from uiPrefs.locale,
 *  - persists the chosen locale back to localStorage.
 * Wraps children in I18nextProvider so useTranslation works in both shells.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const locale = useAppSelector((s) => s.uiPrefs.locale);

  // Hydrate the stored choice once on mount.
  useEffect(() => {
    dispatch(setLocale(readStoredLocale()));
  }, [dispatch]);

  // Apply + persist whenever the chosen locale changes.
  useEffect(() => {
    void i18n.changeLanguage(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = bcp47(locale);
    }
    writeStoredLocale(locale);
  }, [locale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
