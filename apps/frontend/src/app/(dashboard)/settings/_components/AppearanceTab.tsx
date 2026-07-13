"use client";

/**
 * Appearance settings — theme selection (light / dark / system).
 *
 * Writes to the ui-prefs slice; the ThemeProvider resolves and persists
 * the choice (localStorage) and paints it across the app. The preference
 * is per-device here — employees can also persist it to their account
 * from My Profile → Preferences so it follows them across devices.
 */

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setThemeMode } from "@/features/settings/state/ui-prefs.slice";
import type { ThemeMode } from "@/lib/theme/theme";
import { SectionTitle, SettingsCard } from "./shared";

const OPTIONS: {
  value: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "light",
    label: "Light",
    description: "Bright surfaces, ideal for well-lit spaces.",
    icon: <Sun className="h-5 w-5" />,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Dimmed surfaces that are easier on the eyes.",
    icon: <Moon className="h-5 w-5" />,
  },
  {
    value: "system",
    label: "Match system",
    description: "Follow your device's appearance setting.",
    icon: <Monitor className="h-5 w-5" />,
  },
];

export function AppearanceTab() {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((s) => s.uiPrefs.themeMode);
  const resolvedTheme = useAppSelector((s) => s.uiPrefs.resolvedTheme);

  return (
    <SettingsCard>
      <SectionTitle
        icon={<Palette className="h-4 w-4" />}
        title="Theme"
        description="Choose how RX POS looks on this device."
      />

      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const active = themeMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => dispatch(setThemeMode(opt.value))}
              className={cn(
                "relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2",
                active
                  ? "border-primary-500 bg-primary-50/60 dark:border-primary-400 dark:bg-primary-400/10"
                  : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/40",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  active
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-400/20 dark:text-primary-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                {opt.icon}
              </span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {opt.label}
              </span>
              <span className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                {opt.description}
              </span>
              {active && (
                <Check
                  className="absolute right-3 top-3 h-4 w-4 text-primary-600 dark:text-primary-400"
                  strokeWidth={2.5}
                />
              )}
            </button>
          );
        })}
      </div>

      {themeMode === "system" && (
        <p className="mt-4 text-[12px] text-slate-500 dark:text-slate-400">
          Currently following your system:{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {resolvedTheme === "dark" ? "Dark" : "Light"}
          </span>
          .
        </p>
      )}
    </SettingsCard>
  );
}
