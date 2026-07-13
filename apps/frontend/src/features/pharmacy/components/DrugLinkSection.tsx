"use client";

import { useState } from "react";
import { Pill, Search, Link2, Link2Off } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useLazySearchDrugProductsQuery,
  useGetDrugProductQuery,
  useLinkProductDrugMutation,
  useSetScheduleOverrideMutation,
  SCHEDULE_LABELS,
  type DrugScheduleCategory,
  type DrugProductDto,
} from "../drug.api";

export interface DrugLinkSectionProps {
  productId: string;
  din: string | null;
  scheduleOverride: DrugScheduleCategory | null;
}

const CATEGORY_VARIANT: Record<DrugScheduleCategory, "danger" | "warning" | "info" | "success"> = {
  NEEDS_RX: "danger",
  NARCOTIC: "warning",
  BEHIND_COUNTER: "info",
  OPEN: "success",
};

function ScheduleBadge({ category, overridden }: { category: DrugScheduleCategory; overridden?: boolean }) {
  return (
    <Badge variant={CATEGORY_VARIANT[category]} className="text-[11px]">
      {SCHEDULE_LABELS[category]}
      {overridden ? " (override)" : ""}
    </Badge>
  );
}

/**
 * Drug identity (DIN) for a product (Phase 2.1). Search the shared DPD catalog,
 * link a DIN (many UPCs → one drug), and see/override the drug's schedule. Only
 * rendered when the pharmacy sector is enabled. Does not touch price/inventory.
 */
export function DrugLinkSection({ productId, din, scheduleOverride }: DrugLinkSectionProps) {
  const [search, setSearch] = useState("");
  const [triggerSearch, { data: results, isFetching }] = useLazySearchDrugProductsQuery();
  const { data: linked } = useGetDrugProductQuery({ din: din ?? "" }, { skip: !din });
  const [linkDrug, { isLoading: linking }] = useLinkProductDrugMutation();
  const [setOverride] = useSetScheduleOverrideMutation();

  const runSearch = () => {
    if (search.trim().length >= 2) triggerSearch({ search: search.trim(), limit: 25 });
  };

  const link = async (d: DrugProductDto) => {
    try {
      await linkDrug({ id: productId, din: d.din }).unwrap();
      showSuccess(`Linked to ${d.brandName} (DIN ${d.din})`);
      setSearch("");
    } catch (e) {
      showApiError(e);
    }
  };

  const unlink = async () => {
    try {
      await linkDrug({ id: productId, din: null }).unwrap();
      showSuccess("Drug unlinked");
    } catch (e) {
      showApiError(e);
    }
  };

  const changeOverride = async (value: string) => {
    const next = (value || null) as DrugScheduleCategory | null;
    try {
      await setOverride({ id: productId, scheduleOverride: next }).unwrap();
      showSuccess("Schedule updated");
    } catch (e) {
      showApiError(e);
    }
  };

  const effective: DrugScheduleCategory | null = scheduleOverride ?? linked?.scheduleCategory ?? null;

  return (
    <Card className="p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Pill className="h-4 w-4 text-primary-600" /> Drug identity (DIN)
        </CardTitle>
      </CardHeader>

      {din && linked ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                  {linked.brandName}{" "}
                  <span className="font-mono text-xs text-slate-500">DIN {linked.din}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {[linked.company, linked.form, linked.route].filter(Boolean).join(" · ")}
                </p>
                {linked.activeIngredients?.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {linked.activeIngredients.map((i) => `${i.name}${i.strength ? ` ${i.strength}` : ""}`).join(", ")}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={unlink} disabled={linking} className="shrink-0 text-xs h-7">
                <Link2Off className="h-3.5 w-3.5" /> Unlink
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Schedule</span>
            {effective && <ScheduleBadge category={effective} overridden={!!scheduleOverride} />}
            <Select
              className="ml-auto w-48"
              value={scheduleOverride ?? ""}
              onChange={(e) => changeOverride(e.target.value)}
              options={[
                { value: "", label: `Auto (${linked ? SCHEDULE_LABELS[linked.scheduleCategory] : "catalog"})` },
                { value: "NEEDS_RX", label: SCHEDULE_LABELS.NEEDS_RX },
                { value: "NARCOTIC", label: SCHEDULE_LABELS.NARCOTIC },
                { value: "BEHIND_COUNTER", label: SCHEDULE_LABELS.BEHIND_COUNTER },
                { value: "OPEN", label: SCHEDULE_LABELS.OPEN },
              ]}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Link this product to a Health Canada drug (DIN) to classify its schedule.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Search drugs"
              placeholder="Search by DIN, brand, or ingredient"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <Button variant="outline" onClick={runSearch} disabled={isFetching}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
          {results && results.length > 0 && (
            <div className="max-h-56 overflow-y-auto space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
              {results.map((d) => (
                <div
                  key={d.din}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                      {d.brandName} <span className="font-mono text-[11px] text-slate-500">DIN {d.din}</span>
                    </p>
                  </div>
                  <ScheduleBadge category={d.scheduleCategory} />
                  <Button size="sm" onClick={() => link(d)} disabled={linking} className="text-xs h-7 shrink-0">
                    <Link2 className="h-3.5 w-3.5" /> Link
                  </Button>
                </div>
              ))}
            </div>
          )}
          {results && results.length === 0 && !isFetching && (
            <p className="text-xs text-slate-400 py-2">No drugs found — try a DIN or brand name.</p>
          )}
        </div>
      )}
    </Card>
  );
}
