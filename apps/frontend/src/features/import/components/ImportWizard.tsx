"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { showApiError } from "@/lib/api/error-handler";
import { parseSpreadsheet } from "../lib/parse-spreadsheet";
import { autoMapHeaders, applyMapping, targetFields, type ImportMode } from "../lib/auto-map";
import { useImportCatalogMutation } from "../api/import.api";
import type { ImportResult } from "../types/import.types";

type Step = "upload" | "map" | "preview";

const ACTION_VARIANT: Record<string, "success" | "info" | "warning" | "danger"> = {
  create: "success",
  update: "info",
  skip: "warning",
  error: "danger",
};

export function ImportWizard() {
  const [mode, setMode] = useState<ImportMode>("PRODUCTS");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [createMissing, setCreateMissing] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [committed, setCommitted] = useState(false);
  const [importCatalog, { isLoading }] = useImportCatalogMutation();

  const onFile = async (file: File) => {
    try {
      const parsed = await parseSpreadsheet(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapHeaders(parsed.headers, mode));
      setStep("map");
    } catch (e) {
      showApiError(e);
    }
  };

  const options = () => ({
    updateExisting,
    ...(mode === "PRODUCTS" ? { createMissingCategories: createMissing } : {}),
    ...(mode === "VENDOR_PRICELIST" && supplierId ? { supplierId } : {}),
  });

  const run = async (dryRun: boolean) => {
    try {
      const mapped = applyMapping(rows, mapping);
      const res = await importCatalog({ mode, rows: mapped, options: options(), dryRun }).unwrap();
      setResult(res);
      if (!dryRun) setCommitted(true);
      else setStep("preview");
    } catch (e) {
      showApiError(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4" /> Import catalog
        </CardTitle>
      </CardHeader>

      <div className="space-y-4 p-4">
        {step === "upload" && (
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mr-2 text-slate-500">Mode</span>
              <select
                aria-label="Import mode"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={mode}
                onChange={(e) => setMode(e.target.value as ImportMode)}
              >
                <option value="PRODUCTS">Product catalog</option>
                <option value="VENDOR_PRICELIST">Vendor price-list</option>
              </select>
            </label>
            {mode === "VENDOR_PRICELIST" && (
              <label className="block text-sm">
                <span className="mr-2 text-slate-500">Supplier ID</span>
                <input
                  aria-label="Supplier ID"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                />
              </label>
            )}
            <input aria-label="Spreadsheet file" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <Checkbox label="Update products that already exist" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
            {mode === "PRODUCTS" && (
              <Checkbox label="Create missing categories" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
            )}
            <Table>
              <Thead>
                <Tr>
                  <Th>Column</Th>
                  <Th>Maps to</Th>
                </Tr>
              </Thead>
              <Tbody>
                {headers.map((h) => (
                  <Tr key={h}>
                    <Td>{h}</Td>
                    <Td>
                      <select
                        aria-label={`Map ${h}`}
                        className="h-8 rounded border border-input bg-background px-2 text-sm"
                        value={mapping[h] ?? ""}
                        onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                      >
                        <option value="">Ignore</option>
                        {targetFields(mode).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <Button onClick={() => run(true)} disabled={isLoading}>
              Preview ({rows.length} rows)
            </Button>
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Create {result.summary.create}</Badge>
              <Badge variant="info">Update {result.summary.update}</Badge>
              <Badge variant="warning">Skip {result.summary.skip}</Badge>
              <Badge variant="danger">Error {result.summary.error}</Badge>
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Row</Th>
                  <Th>Action</Th>
                  <Th>Messages</Th>
                </Tr>
              </Thead>
              <Tbody>
                {result.rows.slice(0, 100).map((r) => (
                  <Tr key={r.index}>
                    <Td>{r.index + 1}</Td>
                    <Td>
                      <Badge variant={ACTION_VARIANT[r.action]}>{r.action}</Badge>
                    </Td>
                    <Td>{r.messages.join("; ")}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {committed ? (
              <p className="text-sm text-emerald-600">
                Import complete — {result.summary.create} created, {result.summary.update} updated.
              </p>
            ) : (
              <Button onClick={() => run(false)} disabled={isLoading || result.summary.create + result.summary.update === 0}>
                Commit import
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
