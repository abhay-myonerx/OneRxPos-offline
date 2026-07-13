"use client";

import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setLocale } from "@/features/settings/state/ui-prefs.slice";
import { LOCALES, type Locale } from "@/lib/i18n/locale";

/** Compact EN | FR language toggle for the header (mirrors ThemeToggle). */
export function LocaleSwitcher() {
  const { t } = useTranslation("common");
  const dispatch = useAppDispatch();
  const active = useAppSelector((s) => s.uiPrefs.locale);

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5"
    >
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          onClick={() => dispatch(setLocale(l))}
          aria-pressed={active === l}
          className={
            "px-2.5 py-1 text-xs font-medium rounded-md transition-colors " +
            (active === l
              ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")
          }
        >
          {t(`language.${l}`)}
        </button>
      ))}
    </div>
  );
}
