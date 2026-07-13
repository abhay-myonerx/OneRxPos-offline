"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Loading } from "@/components/shared/feedback/Loading";
import { formatMoney } from "@/lib/currency/format-money";
import { useGetArAgingReportQuery } from "../api/reports.api";

/** AR aging report (3H.6): open receivables per customer split into
 *  Current / 31–60 / 61–90 / 90+, as of a chosen date, with CSV export. */
export function ArAgingReport() {
  const [asOf, setAsOf] = useState("");
  const { data, isLoading } = useGetArAgingReportQuery(asOf ? { asOf } : {});

  const exportHref = `/api/v1/reports/export/ar-aging${asOf ? `?asOf=${encodeURIComponent(asOf)}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mr-2 text-slate-500">As of</span>
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="As of date" />
        </label>
        <a href={exportHref}>
          <Button variant="outline">Export CSV</Button>
        </a>
      </div>

      {isLoading ? (
        <Loading />
      ) : !data || data.rows.length === 0 ? (
        <Card>
          <p className="p-4 text-sm text-slate-500">No outstanding receivables.</p>
        </Card>
      ) : (
        <Card padding={false}>
          <Table>
            <Thead>
              <Tr>
                <Th>Customer</Th>
                <Th className="text-right">Current</Th>
                <Th className="text-right">31–60</Th>
                <Th className="text-right">61–90</Th>
                <Th className="text-right">90+</Th>
                <Th className="text-right">Total</Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.rows.map((r) => (
                <Tr key={r.customerId}>
                  <Td>{r.customerName}</Td>
                  <Td className="text-right">{formatMoney(r.current)}</Td>
                  <Td className="text-right">{formatMoney(r.d31_60)}</Td>
                  <Td className="text-right">{formatMoney(r.d61_90)}</Td>
                  <Td className="text-right">{formatMoney(r.d90plus)}</Td>
                  <Td className="text-right font-medium">{formatMoney(r.total)}</Td>
                </Tr>
              ))}
              <Tr>
                <Td className="font-semibold">Total</Td>
                <Td className="text-right font-semibold">{formatMoney(data.summary.current)}</Td>
                <Td className="text-right font-semibold">{formatMoney(data.summary.d31_60)}</Td>
                <Td className="text-right font-semibold">{formatMoney(data.summary.d61_90)}</Td>
                <Td className="text-right font-semibold">{formatMoney(data.summary.d90plus)}</Td>
                <Td className="text-right font-semibold">{formatMoney(data.summary.total)}</Td>
              </Tr>
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
