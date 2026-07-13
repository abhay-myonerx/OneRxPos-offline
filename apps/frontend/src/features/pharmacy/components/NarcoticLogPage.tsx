"use client";

import { useState } from "react";
import { ShieldAlert, ClipboardCheck, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/container";
import { formatDate } from "@/lib/date/format-date";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import { useListUsersQuery } from "@/features/users/api/users.api";
import { useAuth } from "@/hooks/useAuth";
import {
  useListNarcoticProductsQuery,
  useNarcoticLogQuery,
  useRecordNarcoticCountMutation,
  useRecordNarcoticAdjustmentMutation,
  type NarcoticProductDto,
} from "../narcotic.api";

/**
 * Narcotic Log (Phase 2.4) — perpetual controlled-substance count derived from
 * the StockMovement ledger, with physical-count reconciliation and loss/theft/
 * destruction records. PII-free (the only person referenced is a staff witness).
 */
export function NarcoticLogPage() {
  const { user } = useAuth();
  const { data: storesData } = useListStoresQuery({});
  const stores = storesData ?? [];
  const [storeId, setStoreId] = useState<string>(user?.storeId ?? "");
  const effectiveStore = storeId || stores[0]?.id || "";

  const { data: products = [] } = useListNarcoticProductsQuery(
    { storeId: effectiveStore },
    { skip: !effectiveStore },
  );
  const [selected, setSelected] = useState<NarcoticProductDto | null>(null);
  const { data: log = [] } = useNarcoticLogQuery(
    { storeId: effectiveStore, productId: selected?.productId },
    { skip: !effectiveStore || !selected },
  );

  const { data: usersData } = useListUsersQuery({ limit: 50 });
  const witnesses = usersData?.data ?? [];

  const [recordCount] = useRecordNarcoticCountMutation();
  const [recordAdjustment] = useRecordNarcoticAdjustmentMutation();
  const [countOpen, setCountOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  return (
    <>
      <PageHeader title="Narcotic Log" />

      <div className="mb-4 max-w-xs">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Store</label>
        <Select
          options={stores.map((s) => ({ value: s.id, label: s.name }))}
          value={effectiveStore}
          onChange={(e) => {
            setStoreId(e.target.value);
            setSelected(null);
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldAlert className="h-4 w-4 text-amber-600" /> Controlled drugs
            </CardTitle>
          </CardHeader>
          {products.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No narcotic-scheduled products at this store.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {products.map((p) => (
                <button
                  key={p.productId}
                  onClick={() => setSelected(p)}
                  className={`w-full text-left px-2 py-2 flex items-center justify-between gap-2 rounded ${
                    selected?.productId === p.productId ? "bg-primary-50 dark:bg-primary-400/15" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</span>
                    {p.din && <span className="block text-[11px] font-mono text-slate-400">DIN {p.din}</span>}
                  </span>
                  <Badge variant="info" className="tabular-nums shrink-0">
                    {p.onHand}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              {selected ? `Perpetual log — ${selected.name}` : "Select a drug"}
            </CardTitle>
          </CardHeader>
          {selected ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  On hand: <span className="font-semibold tabular-nums">{selected.onHand}</span>
                </span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCountOpen(true)} className="text-xs h-7">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Record count
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)} className="text-xs h-7">
                    <AlertTriangle className="h-3.5 w-3.5" /> Loss / theft / destruction
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Date</Th>
                      <Th>Event</Th>
                      <Th className="text-right">Change</Th>
                      <Th className="text-right">Balance</Th>
                      <Th>Note</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {log.map((e) => (
                      <Tr key={e.id}>
                        <Td className="whitespace-nowrap text-xs">{formatDate(e.createdAt)}</Td>
                        <Td>
                          {e.kind === "count" ? (
                            <span className={e.discrepancy ? "text-danger-600 font-medium" : ""}>
                              Count {e.countedQty} vs {e.expectedQty}
                              {e.discrepancy ? ` (${e.discrepancy! > 0 ? "+" : ""}${e.discrepancy})` : " ✓"}
                            </span>
                          ) : (
                            (e.referenceType || e.type)
                          )}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {e.kind === "movement" && e.quantityChange != null
                            ? `${e.quantityChange > 0 ? "+" : ""}${e.quantityChange}`
                            : "—"}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {e.kind === "movement" ? e.quantityAfter : "—"}
                        </Td>
                        <Td className="text-xs text-slate-500 truncate max-w-[10rem]">{e.notes ?? ""}</Td>
                      </Tr>
                    ))}
                    {log.length === 0 && (
                      <Tr>
                        <Td colSpan={5} className="text-center text-sm text-slate-400 py-4">
                          No movements yet.
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-4">Choose a controlled drug to view its perpetual log.</p>
          )}
        </Card>
      </div>

      {selected && (
        <CountModal
          open={countOpen}
          onClose={() => setCountOpen(false)}
          expected={selected.onHand}
          witnesses={witnesses}
          onSubmit={async (countedQty, witnessUserId, notes) => {
            try {
              await recordCount({ storeId: effectiveStore, productId: selected.productId, countedQty, witnessUserId, notes }).unwrap();
              showSuccess("Count recorded");
              setCountOpen(false);
            } catch (e) {
              showApiError(e);
            }
          }}
        />
      )}
      {selected && (
        <AdjustModal
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
          witnesses={witnesses}
          onSubmit={async (eventType, quantity, witnessUserId, notes) => {
            try {
              await recordAdjustment({ storeId: effectiveStore, productId: selected.productId, eventType, quantity, witnessUserId, notes }).unwrap();
              showSuccess("Recorded");
              setAdjustOpen(false);
            } catch (e) {
              showApiError(e);
            }
          }}
        />
      )}
    </>
  );
}

interface WitnessOpt {
  id: string;
  firstName: string;
  lastName: string;
}

function WitnessSelect({ witnesses, value, onChange }: { witnesses: WitnessOpt[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select
      options={[
        { value: "", label: "No witness" },
        ...witnesses.map((w) => ({ value: w.id, label: `${w.firstName} ${w.lastName}` })),
      ]}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function CountModal({
  open,
  onClose,
  expected,
  witnesses,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  expected: number;
  witnesses: WitnessOpt[];
  onSubmit: (countedQty: number, witnessUserId: string | undefined, notes: string | undefined) => void;
}) {
  const [counted, setCounted] = useState("");
  const [witness, setWitness] = useState("");
  const [notes, setNotes] = useState("");
  const n = parseInt(counted, 10);
  const valid = Number.isFinite(n) && n >= 0;
  const diff = valid ? n - expected : null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record physical count"
      description="Count the drug and compare against the expected on-hand."
      size="sm"
      primaryAction={{ label: "Save count", onClick: () => onSubmit(n, witness || undefined, notes || undefined), disabled: !valid }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Expected on hand</span>
          <span className="font-semibold tabular-nums">{expected}</span>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Counted quantity</label>
          <Input type="number" min={0} aria-label="Counted quantity" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
        </div>
        {diff != null && (
          <p className={`text-sm font-medium ${diff === 0 ? "text-emerald-600" : "text-danger-600"}`}>
            {diff === 0 ? "Balanced ✓" : `Discrepancy: ${diff > 0 ? "+" : ""}${diff}`}
          </p>
        )}
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Witness (staff)</label>
          <WitnessSelect witnesses={witnesses} value={witness} onChange={setWitness} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Notes</label>
          <Input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({
  open,
  onClose,
  witnesses,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  witnesses: WitnessOpt[];
  onSubmit: (eventType: "LOSS" | "THEFT" | "DESTRUCTION", quantity: number, witnessUserId: string | undefined, notes: string | undefined) => void;
}) {
  const [eventType, setEventType] = useState<"LOSS" | "THEFT" | "DESTRUCTION">("DESTRUCTION");
  const [qty, setQty] = useState("");
  const [witness, setWitness] = useState("");
  const [notes, setNotes] = useState("");
  const n = parseInt(qty, 10);
  const valid = Number.isFinite(n) && n > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Loss / theft / destruction"
      description="Record a controlled-substance reduction. This adjusts stock and the perpetual log."
      size="sm"
      primaryAction={{ label: "Record", onClick: () => onSubmit(eventType, n, witness || undefined, notes || undefined), disabled: !valid }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Type</label>
          <Select
            options={[
              { value: "DESTRUCTION", label: "Destruction (witnessed)" },
              { value: "LOSS", label: "Loss" },
              { value: "THEFT", label: "Theft" },
            ]}
            value={eventType}
            onChange={(e) => setEventType(e.target.value as "LOSS" | "THEFT" | "DESTRUCTION")}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Quantity removed</label>
          <Input type="number" min={1} aria-label="Quantity removed" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Witness (staff)</label>
          <WitnessSelect witnesses={witnesses} value={witness} onChange={setWitness} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">Notes</label>
          <Input aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
