"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setThemeMode } from "@/features/settings/state/ui-prefs.slice";

/**
 * Compact light/dark toggle for the header. Flips to the opposite of the
 * theme currently painted and pins it as an explicit choice (leaving
 * `system` mode). Fine-grained control (incl. "Match system") lives in
 * Settings → Appearance.
 */
export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const { t } = useTranslation("common");
  const resolved = useAppSelector((s) => s.uiPrefs.resolvedTheme);
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={() => dispatch(setThemeMode(isDark ? "light" : "dark"))}
      className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
      aria-label={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
      title={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
