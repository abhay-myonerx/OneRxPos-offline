"use client";

import { useState, useEffect } from "react";
import { Save, DollarSign, Globe, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form/form-field";
import {
  useGetTenantSettingsQuery,
  useUpdateTenantSettingsMutation,
} from "@/features/tenant/api/tenant.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { TenantSettings } from "@/features/settings/types/settings.types";
import { DEFAULT_SETTINGS } from "@/features/settings/types/settings.types";
import { SectionTitle, SettingsCard, Divider } from "./shared";

const TIMEZONES = [
  { value: "Asia/Dhaka", label: "Asia/Dhaka (UTC+6)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (UTC+5:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+4)" },
  { value: "Europe/London", label: "Europe/London (UTC+0)" },
  { value: "America/New_York", label: "America/New_York (UTC-5)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (UTC-8)" },
  { value: "UTC", label: "UTC" },
];

const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2025)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2025)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2025-12-31)" },
];

const CURRENCIES = [
  { value: "BDT", label: "BDT — Bangladeshi Taka ($)" },
  { value: "USD", label: "USD — US Dollar ($)" },
  { value: "EUR", label: "EUR — Euro (€)" },
  { value: "GBP", label: "GBP — British Pound (£)" },
  { value: "INR", label: "INR — Indian Rupee (₹)" },
];

export function CurrencyTab() {
  const { data: tenantSettings } = useGetTenantSettingsQuery();
  const [updateSettings, { isLoading: saving }] = useUpdateTenantSettingsMutation();

  const [settings, setSettings] = useState<TenantSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!tenantSettings) return;
    const id = setTimeout(() => {
      setSettings({ ...DEFAULT_SETTINGS, ...tenantSettings });
    }, 0);
    return () => clearTimeout(id);
  }, [tenantSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings({
        currency: settings.currency,
        currencySymbol: settings.currencySymbol,
        currencyPosition: settings.currencyPosition,
        decimalPlaces: settings.decimalPlaces,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
      }).unwrap();
      showSuccess("Currency & regional settings saved");
    } catch (err) {
      showApiError(err);
    }
  };

  const formatAmount = (amount: number) => {
    const decimal = settings.decimalPlaces > 0 ? "." + "0".repeat(settings.decimalPlaces) : "";
    const num = amount.toLocaleString() + decimal;
    return settings.currencyPosition === "before"
      ? `${settings.currencySymbol}${num}`
      : `${num}${settings.currencySymbol}`;
  };

  const formatDate = () => {
    if (settings.dateFormat === "DD/MM/YYYY") return "05/04/2026";
    if (settings.dateFormat === "MM/DD/YYYY") return "04/05/2026";
    return "2026-04-05";
  };

  return (
    <div className="space-y-6">
      <SettingsCard>
        <SectionTitle
          icon={<DollarSign className="h-[18px] w-[18px]" />}
          title="Currency Settings"
          description="Configure how monetary values are displayed across the system"
        />
        <Divider className="mb-6" />

        <form onSubmit={handleSave} className="space-y-5">
          <FormField label="Currency">
            <Select
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              options={CURRENCIES}
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Symbol">
              <Input
                value={settings.currencySymbol}
                onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
                placeholder="$"
                className="text-center font-mono text-lg"
              />
            </FormField>
            <FormField label="Symbol Position">
              <Select
                value={settings.currencyPosition}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    currencyPosition: e.target.value as "before" | "after",
                  })
                }
                options={[
                  { value: "before", label: "Before amount" },
                  { value: "after", label: "After amount" },
                ]}
              />
            </FormField>
            <FormField label="Decimal Places">
              <Select
                value={String(settings.decimalPlaces)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    decimalPlaces: Number(e.target.value),
                  })
                }
                options={[
                  { value: "0", label: "None (100)" },
                  { value: "2", label: "2 digits (100.00)" },
                  { value: "3", label: "3 digits (100.000)" },
                ]}
              />
            </FormField>
          </div>

          <Divider className="!my-6" />

          <SectionTitle
            icon={<Globe className="h-[18px] w-[18px]" />}
            title="Regional Preferences"
            description="Timezone and date format for your business operations"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Timezone">
              <Select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                options={TIMEZONES}
              />
            </FormField>
            <FormField label="Date Format">
              <Select
                value={settings.dateFormat}
                onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
                options={DATE_FORMATS}
              />
            </FormField>
          </div>

          <div className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200/80 bg-white dark:bg-slate-900">
              <Eye className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Format Preview
              </span>
            </div>
            <div className="p-5 grid grid-cols-3 gap-6">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5 uppercase tracking-wide">
                  Price
                </p>
                <p className="text-lg font-medium text-slate-900 dark:text-slate-100 font-mono tracking-tight tabular-nums">
                  {formatAmount(1234)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5 uppercase tracking-wide">
                  Tax Amount
                </p>
                <p className="text-lg font-medium text-slate-900 dark:text-slate-100 font-mono tracking-tight tabular-nums">
                  {formatAmount(86)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5 uppercase tracking-wide">
                  Date
                </p>
                <p className="text-lg font-medium text-slate-900 dark:text-slate-100 font-mono tracking-tight tabular-nums">
                  {formatDate()}
                </p>
              </div>
            </div>
          </div>

          <Divider className="!mt-6" />

          <div className="flex justify-end pt-1">
            <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
              Save Currency & Regional
            </Button>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
