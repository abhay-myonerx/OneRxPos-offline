"use client";

import { NarcoticLogPage } from "@/features/pharmacy/components/NarcoticLogPage";
import { usePharmacyEnabled } from "@/features/pharmacy/useSectorEnabled";

export default function Page() {
  const pharmacyEnabled = usePharmacyEnabled();
  if (!pharmacyEnabled) {
    return (
      <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
        The pharmacy module is not enabled for this tenant.
      </div>
    );
  }
  return <NarcoticLogPage />;
}
