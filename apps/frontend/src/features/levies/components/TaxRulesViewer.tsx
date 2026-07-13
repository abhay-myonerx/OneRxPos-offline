"use client";

import { Fragment, useMemo, useState } from "react";
import { getProvinceProfile } from "rx-pos-shared";
import type { ProvinceCode, TaxComponent } from "rx-pos-shared";
import { Select } from "@/components/ui/select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FormField } from "@/components/ui/form/form-field";
import { PROVINCE_OPTIONS } from "@/features/stores/types/store.types";

interface CodeGroup {
  code: string;
  totalRatePct: number;
  components: TaxComponent[];
}

/** Groups components sharing a code (e.g. Ontario's HST is modeled as a
 * federal 5% slice + a provincial 8% slice so provincial relief can zero
 * only its portion) so the viewer can show both the combined rate merchants
 * recognize and the underlying axis breakdown the pricing engine uses. */
function groupByCode(components: TaxComponent[]): CodeGroup[] {
  const order: string[] = [];
  const byCode = new Map<string, TaxComponent[]>();
  for (const c of components) {
    if (!byCode.has(c.code)) {
      byCode.set(c.code, []);
      order.push(c.code);
    }
    byCode.get(c.code)!.push(c);
  }
  return order.map((code) => {
    const comps = byCode.get(code)!;
    const totalRatePct = comps.reduce((sum, c) => sum + parseFloat(c.ratePct), 0);
    return { code, totalRatePct, components: comps };
  });
}

function formatBase(base: TaxComponent["base"]): string {
  if (base === "ON_NET") return "Net";
  return `Net + ${base.onNetPlus.join(", ")}`;
}

function formatRate(ratePct: number): string {
  // Drop a trailing ".0" (13.0 -> 13) but keep meaningful decimals (9.975).
  return `${parseFloat(ratePct.toFixed(3))}%`;
}

export interface TaxRulesViewerProps {
  /** Controlled province. Uncontrolled (internal state, defaulting to ON) if omitted. */
  province?: ProvinceCode;
  onProvinceChange?: (province: ProvinceCode) => void;
  /** Injectable "as of" date for deterministic tests; defaults to `new Date()`. */
  at?: Date;
}

/**
 * Read-only viewer for the shared pricing engine's per-province tax profile
 * (`rx-pos-shared` `getProvinceProfile`). These rates are facts sourced from
 * the shared package's effective-dated tables — this component has NO
 * editing controls by design; changing a rate means shipping a new
 * `rx-pos-shared` release, not an admin action.
 */
export function TaxRulesViewer({
  province: controlledProvince,
  onProvinceChange,
  at,
}: TaxRulesViewerProps) {
  const [internalProvince, setInternalProvince] = useState<ProvinceCode>("ON");
  const province = controlledProvince ?? internalProvince;
  const asOf = at ?? new Date();

  const profile = useMemo(() => getProvinceProfile(province, asOf), [province, asOf]);
  const groups = useMemo(() => groupByCode(profile.components), [profile]);

  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const next = e.target.value as ProvinceCode;
    if (controlledProvince === undefined) setInternalProvince(next);
    onProvinceChange?.(next);
  };

  return (
    <div className="space-y-3">
      <FormField label="Province" className="max-w-xs">
        <Select
          options={PROVINCE_OPTIONS}
          value={province}
          onChange={handleChange}
        />
      </FormField>

      <Table>
        <Thead>
          <Tr>
            <Th>Code</Th>
            <Th>Axis</Th>
            <Th>Rate</Th>
            <Th>Base</Th>
          </Tr>
        </Thead>
        <Tbody>
          {groups.map((group) => (
            <Fragment key={group.code}>
              {group.components.length > 1 ? (
                // Combined-code header row (e.g. HST) plus its axis breakdown.
                <>
                  <Tr className="bg-slate-50/60 dark:bg-slate-800/30">
                    <Td className="font-semibold">{group.code}</Td>
                    <Td className="text-slate-400 dark:text-slate-500">Combined</Td>
                    <Td className="font-semibold">{formatRate(group.totalRatePct)}</Td>
                    <Td>—</Td>
                  </Tr>
                  {group.components.map((c) => (
                    <Tr key={`${group.code}-${c.axis}`}>
                      <Td className="pl-8 text-xs text-slate-400 dark:text-slate-500">
                        {group.code}
                      </Td>
                      <Td>{c.axis}</Td>
                      <Td>{formatRate(parseFloat(c.ratePct))}</Td>
                      <Td>{formatBase(c.base)}</Td>
                    </Tr>
                  ))}
                </>
              ) : (
                <Tr>
                  <Td className="font-medium">{group.code}</Td>
                  <Td>{group.components[0].axis}</Td>
                  <Td>{formatRate(parseFloat(group.components[0].ratePct))}</Td>
                  <Td>{formatBase(group.components[0].base)}</Td>
                </Tr>
              )}
            </Fragment>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
