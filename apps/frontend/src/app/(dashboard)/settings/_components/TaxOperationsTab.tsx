"use client";

import { useState, useEffect } from "react";
import { Save, Percent, Package, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import {
  useGetTenantSettingsQuery,
  useUpdateTenantSettingsMutation,
} from "@/features/tenant/api/tenant.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { TenantSettings } from "@/features/settings/types/settings.types";
import { DEFAULT_SETTINGS } from "@/features/settings/types/settings.types";
import { SectionTitle, SettingsCard, Divider, Toggle } from "./shared";

export function TaxOperationsTab() {
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
        taxEnabled: settings.taxEnabled,
        defaultTaxRate: settings.defaultTaxRate,
        lowStockThreshold: settings.lowStockThreshold,
        allowNegativeStock: settings.allowNegativeStock,
        enableLoyalty: settings.enableLoyalty,
      }).unwrap();
      showSuccess("Settings saved successfully");
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard>
        <SectionTitle
          icon={<Percent className="h-[18px] w-[18px]" />}
          title="Tax Configuration"
          description="Enable and configure tax calculation for sales transactions"
        />
        <Divider className="mb-5" />

        <form onSubmit={handleSave} className="space-y-5">
          <Toggle
            label="Enable Tax"
            description="Automatically apply tax to all sales transactions"
            checked={settings.taxEnabled}
            onChange={(v) => setSettings({ ...settings, taxEnabled: v })}
          />

          {settings.taxEnabled && (
            <div className="ml-1 pl-4 border-l border-slate-200 dark:border-slate-800">
              <FormField label="Default Tax Rate">
                <div className="relative max-w-[200px]">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={settings.defaultTaxRate}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultTaxRate: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    className="pr-10 font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500 font-medium">
                    %
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Applied when no product-specific rate is set
                </p>
              </FormField>
            </div>
          )}

          <Divider className="!my-6" />

          <SectionTitle
            icon={<Package className="h-[18px] w-[18px]" />}
            title="Inventory Behavior"
            description="Configure stock management rules"
          />

          <FormField label="Low Stock Alert Threshold">
            <div className="relative max-w-[200px]">
              <Input
                type="number"
                min={0}
                value={settings.lowStockThreshold}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    lowStockThreshold: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="5"
                className="pr-14 font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 dark:text-slate-500">
                units
              </span>
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1.5">
              Products below this quantity will trigger a low-stock warning
            </p>
          </FormField>

          <Toggle
            label="Allow Negative Stock"
            description="Permit sales to proceed even when product inventory is depleted"
            checked={settings.allowNegativeStock}
            onChange={(v) => setSettings({ ...settings, allowNegativeStock: v })}
          />

          <Divider className="!my-6" />

          <SectionTitle
            icon={<Heart className="h-[18px] w-[18px]" />}
            title="Loyalty Program"
            description="Reward customers with points on every purchase"
          />

          <Toggle
            label="Enable Loyalty Rewards"
            description="Customers earn points that can be redeemed for discounts"
            checked={settings.enableLoyalty}
            onChange={(v) => setSettings({ ...settings, enableLoyalty: v })}
          />

          <Divider className="!mt-6" />

          <div className="flex justify-end pt-1">
            <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
              Save Settings
            </Button>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
