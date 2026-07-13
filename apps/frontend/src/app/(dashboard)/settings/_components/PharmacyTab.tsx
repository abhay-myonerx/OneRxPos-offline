"use client";

import { useState, useEffect } from "react";
import { Save, Pill, ShieldCheck, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGetTenantSettingsQuery,
  useUpdateTenantSettingsMutation,
} from "@/features/tenant/api/tenant.api";
import { usePharmacyEnabled } from "@/features/pharmacy/useSectorEnabled";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { EnabledSectors } from "@/features/settings/types/settings.types";
import { SectionTitle, SettingsCard, Divider, Toggle, InfoBanner } from "./shared";

/**
 * Pharmacy sector settings. The pharmacy sector is opt-in per tenant (sectors
 * default OFF); until it is enabled, controlled-substance schedule enforcement,
 * Rx-at-till, and the narcotic register are inert and their UI is hidden. This
 * tab is the single place a tenant turns pharmacy mode on/off — it writes
 * `settings.enabledSectors.pharmacy` and refetches /auth/me so the pharmacy UI
 * gating (useSectorEnabled) flips immediately.
 */
export function PharmacyTab() {
  const { data: tenantSettings } = useGetTenantSettingsQuery();
  const [updateSettings, { isLoading: saving }] = useUpdateTenantSettingsMutation();
  // Live, authoritative flag (read off /auth/me — the same source enforcement uses).
  const liveEnabled = usePharmacyEnabled();

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(!!tenantSettings?.enabledSectors?.pharmacy);
  }, [tenantSettings]);

  const dirty = enabled !== !!tenantSettings?.enabledSectors?.pharmacy;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Backend shallow-merges the `enabledSectors` object wholesale, so send
      // the full desired map (preserving any other sector flags).
      const nextSectors: EnabledSectors = {
        ...(tenantSettings?.enabledSectors ?? {}),
        pharmacy: enabled,
      };
      await updateSettings({ enabledSectors: nextSectors }).unwrap();
      showSuccess(enabled ? "Pharmacy mode enabled" : "Pharmacy mode disabled");
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsCard>
        <SectionTitle
          icon={<Pill className="h-[18px] w-[18px]" />}
          title="Pharmacy Mode"
          description="Turn on controlled-substance compliance and prescription features for this store."
        />
        <Divider className="mb-5" />

        <form onSubmit={handleSave} className="space-y-5">
          <Toggle
            label="Enable Pharmacy Mode"
            description="Activates schedule enforcement, Rx-at-till, and the narcotic register."
            checked={enabled}
            onChange={setEnabled}
          />

          {enabled ? (
            <InfoBanner
              variant="success"
              icon={<ShieldCheck className="h-4 w-4" />}
              title="What pharmacy mode enforces"
              description="Scheduled products (NEEDS_RX / NARCOTIC) cannot be sold without a linked prescription — checkout is blocked until an Rx is attached or a manager consult override is granted. Narcotic products appear in the perpetual narcotic register, and pharmacy reports (narcotic, Rx-sales, schedules) become available."
            />
          ) : (
            <InfoBanner
              variant="warning"
              icon={<Info className="h-4 w-4" />}
              title="Pharmacy features are currently off"
              description="Controlled-substance schedule enforcement and prescription features are inactive. Regular retail checkout is unaffected. Enable this only for a licensed pharmacy."
            />
          )}

          <Divider className="!mt-6" />

          <div className="flex items-center justify-between pt-1">
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Status:{" "}
              <span
                className={
                  liveEnabled
                    ? "font-medium text-success-600"
                    : "font-medium text-slate-500 dark:text-slate-400"
                }
              >
                {liveEnabled ? "Pharmacy mode active" : "Retail mode (pharmacy off)"}
              </span>
            </p>
            <Button
              type="submit"
              loading={saving}
              disabled={!dirty}
              icon={<Save className="h-4 w-4" />}
            >
              Save Settings
            </Button>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
