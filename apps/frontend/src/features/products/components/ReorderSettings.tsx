"use client";

import { RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useGetTenantSettingsQuery,
  useUpdateTenantSettingsMutation,
} from "@/features/tenant/api/tenant.api";

/**
 * Auto-reorder toggles (3H.2) bound to the tenant `reorder` settings namespace.
 * Both default off. `autoReorderEnabled` drafts a PO for the preferred vendor on
 * low stock; `autoEmailReorder` also emails that PO to the vendor (via 3H.1).
 */
export function ReorderSettings() {
  const { data: settings } = useGetTenantSettingsQuery();
  const [update, { isLoading }] = useUpdateTenantSettingsMutation();

  const reorder = settings?.reorder ?? { autoReorderEnabled: false, autoEmailReorder: false };

  const save = async (patch: Partial<typeof reorder>) => {
    try {
      await update({ reorder: { ...reorder, ...patch } }).unwrap();
      showSuccess("Reorder settings saved");
    } catch (e) {
      showApiError(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Auto-reorder
        </CardTitle>
      </CardHeader>
      <div className="space-y-3 p-4">
        <Checkbox
          label="Automatically draft a purchase order when a product hits its reorder point"
          checked={reorder.autoReorderEnabled}
          disabled={isLoading}
          onChange={(e) => save({ autoReorderEnabled: e.target.checked })}
        />
        <Checkbox
          label="Also email the drafted purchase order to the preferred vendor"
          checked={reorder.autoEmailReorder}
          disabled={isLoading || !reorder.autoReorderEnabled}
          onChange={(e) => save({ autoEmailReorder: e.target.checked })}
        />
        <p className="text-xs text-muted-foreground">
          Reorder uses each product&apos;s preferred vendor and reorder quantity. Drafted POs stay in
          Draft for review unless auto-email is on.
        </p>
      </div>
    </Card>
  );
}
