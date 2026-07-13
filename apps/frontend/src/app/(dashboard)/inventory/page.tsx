"use client";

import { useState } from "react";
import { Link, useSearchParams } from "@/shell/nav";
import {
  Search,
  AlertTriangle,
  Warehouse,
  ArrowRightLeft,
  Activity,
  Plus,
  Send,
  CheckCircle,
  XCircle,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Textarea } from "@/components/ui/textarea";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import {
  useListStockQuery,
  useGetLowStockQuery,
  useAdjustStockMutation,
  useListMovementsQuery,
  useListTransfersQuery,
  useCreateTransferMutation,
  useShipTransferMutation,
  useReceiveTransferMutation,
  useCancelTransferMutation,
} from "@/features/inventory/api/inventory.api";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import { useListProductsQuery } from "@/features/products/api/products.api";
import { ReorderSettings } from "@/features/products/components/ReorderSettings";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDateTime } from "@/lib/date/format-date";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { StockMovementType } from "@/types/enums/status.enums";
import type { AdjustStockInput } from "@/features/inventory/types/inventory.types";

type Tab = "stock" | "low" | "movements" | "transfers";

// Subset of movement types exposed for manual adjustments; purchase receipts
// and sale deductions are system-generated and intentionally excluded here.
const ADJUST_TYPES: StockMovementType[] = [
  StockMovementType.ADJUSTMENT_ADD,
  StockMovementType.ADJUSTMENT_SUB,
  StockMovementType.DAMAGE,
  StockMovementType.PURCHASE_IN,
];

/**
 * Inventory management page — four-tab view of stock health across all stores.
 *
 * Tabs: All Stock (quantity + value), Low Stock alerts, Movement audit log,
 * and inter-store Transfers with a ship → receive lifecycle.
 *
 * The active tab can be deep-linked via ?tab=<key> (e.g. from a dashboard alert).
 * All data queries are tenant-scoped on the backend; the store filter here is
 * an additional UX convenience for multi-store operators.
 */
export default function InventoryPage() {
  const [searchParams] = useSearchParams();
  // Support deep-linking to a specific tab from external links (e.g. low-stock alerts)
  const initialTab = ((): Tab => {
    const t = searchParams.get("tab");
    return t === "low" || t === "movements" || t === "transfers" ? t : "stock";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [page, setPage] = useState(1);
  const [adjustModal, setAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState<AdjustStockInput>({
    storeId: "",
    productId: "",
    quantityChange: 0,
    type: StockMovementType.ADJUSTMENT_ADD,
  });
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromStoreId: "",
    toStoreId: "",
    notes: "",
    items: [{ productId: "", quantity: 1 }] as {
      productId: string;
      quantity: number;
    }[],
  });

  // ── Transfer state ────────────────────────────────────────────────────────

  // Confirmation dialog for ship / receive / cancel — each of these mutates
  // stock in one or two stores and cannot be undone via the UI.
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    action: "ship" | "receive" | "cancel";
    transferNumber: string;
  } | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: stockData, isLoading } = useListStockQuery({
    storeId: storeFilter || undefined,
    search: search || undefined,
    page,
    limit: 20,
  });
  // Low-stock data is always fetched so the badge count in the tab label stays
  // current regardless of which tab is active.
  const { data: lowData } = useGetLowStockQuery({
    storeId: storeFilter || undefined,
  });
  // Movements and transfers are deferred until their tab is selected to avoid
  // unnecessary network traffic when the user is only viewing stock levels.
  const { data: movData } = useListMovementsQuery(
    { storeId: storeFilter || undefined, page, limit: 20 },
    { skip: tab !== "movements" },
  );
  const { data: transData } = useListTransfersQuery(
    { storeId: storeFilter || undefined },
    { skip: tab !== "transfers" },
  );
  const { data: stores } = useListStoresQuery({});
  const { data: productData } = useListProductsQuery({
    limit: 100,
    isActive: true,
  });
  const [adjustStock, { isLoading: adjusting }] = useAdjustStockMutation();
  const [createTransfer, { isLoading: creatingTransfer }] = useCreateTransferMutation();
  const [shipTransfer] = useShipTransferMutation();
  const [receiveTransfer] = useReceiveTransferMutation();
  const [cancelTransfer] = useCancelTransferMutation();

  const stock = stockData?.data || [];
  const lowStock = lowData?.data || [];
  const movements = movData?.data || [];
  const transfers = transData?.data || [];
  const products = productData?.data || [];

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adjustStock(adjustForm).unwrap();
      showSuccess("Stock adjusted");
      setAdjustModal(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTransfer({
        fromStoreId: transferForm.fromStoreId,
        toStoreId: transferForm.toStoreId,
        notes: transferForm.notes || null,
        items: transferForm.items.filter((i) => i.productId && i.quantity > 0),
      }).unwrap();
      showSuccess("Transfer created");
      setTransferModal(false);
    } catch (err) {
      showApiError(err);
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const runTransferAction = async (id: string, action: "ship" | "receive" | "cancel") => {
    try {
      if (action === "ship") {
        // Ship: deducts stock from source store, sets status to IN_TRANSIT
        await shipTransfer(id).unwrap();
        showSuccess("Transfer shipped");
      } else if (action === "receive") {
        // Receive: adds stock at destination store, sets status to COMPLETED
        await receiveTransfer({ id }).unwrap();
        showSuccess("Transfer received");
      } else {
        // Cancel from IN_TRANSIT restores source stock; from PENDING it is a no-op on stock
        await cancelTransfer(id).unwrap();
        showSuccess("Transfer cancelled");
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setConfirmAction(null);
    }
  };

  if (isLoading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Manage stock across stores"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAdjustForm({
                  storeId: storeFilter || stores?.[0]?.id || "",
                  productId: "",
                  quantityChange: 0,
                  type: StockMovementType.ADJUSTMENT_ADD,
                });
                setAdjustModal(true);
              }}
              icon={<Plus className="h-4 w-4" />}
            >
              Adjust Stock
            </Button>
            <Button
              onClick={() => {
                setTransferForm({
                  fromStoreId: "",
                  toStoreId: "",
                  notes: "",
                  items: [{ productId: "", quantity: 1 }],
                });
                setTransferModal(true);
              }}
              icon={<ArrowRightLeft className="h-4 w-4" />}
            >
              New Transfer
            </Button>
          </div>
        }
      />

      <div className="mb-4">
        <ReorderSettings />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          {
            key: "stock" as Tab,
            label: "All Stock",
            icon: <Warehouse className="h-4 w-4" />,
          },
          {
            key: "low" as Tab,
            label: `Low Stock (${lowStock.length})`,
            icon: <AlertTriangle className="h-4 w-4" />,
          },
          {
            key: "movements" as Tab,
            label: "Movements",
            icon: <Activity className="h-4 w-4" />,
          },
          {
            key: "transfers" as Tab,
            label: "Transfers",
            icon: <ArrowRightLeft className="h-4 w-4" />,
          },
        ].map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            icon={t.icon}
          >
            {t.label}
          </Button>
        ))}
        <Select
          options={[
            { value: "", label: "All Stores" },
            ...(stores || []).map((s) => ({ value: s.id, label: s.name })),
          ]}
          value={storeFilter}
          onChange={(e) => {
            setStoreFilter(e.target.value);
            setPage(1);
          }}
          className="ml-auto max-w-[180px]"
        />
      </div>

      <Card padding={false}>
        {tab === "stock" && (
          <>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <Input
                placeholder="Search by product..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4" />}
                className="max-w-xs"
              />
            </div>
            {stock.length === 0 ? (
              <Empty title="No stock data" />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Product</Th>
                    <Th>Store</Th>
                    <Th>Quantity</Th>
                    <Th>Threshold</Th>
                    <Th>Cost Value</Th>
                    <Th>Sell Value</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {stock.map((s) => (
                    <Tr key={s.id}>
                      <Td>
                        <div>
                          <p className="font-medium">{s.product?.name}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {s.product?.sku}
                            {s.variant ? ` / ${s.variant.name}` : ""}
                          </p>
                        </div>
                      </Td>
                      <Td>{s.store?.name || "—"}</Td>
                      <Td className="font-medium">{s.quantity}</Td>
                      <Td>{s.lowStockThreshold}</Td>
                      <Td>
                        {/* Inventory value = unit cost × on-hand qty; informational only, not synced to a ledger */}
                        {formatMoney(parseFloat(s.product?.costPrice || "0") * s.quantity)}
                      </Td>
                      <Td>{formatMoney(parseFloat(s.product?.sellPrice || "0") * s.quantity)}</Td>
                      <Td>
                        {s.quantity === 0 ? (
                          <Badge variant="danger">Out of Stock</Badge>
                        ) : s.quantity <= s.lowStockThreshold ? (
                          <Badge variant="warning">Low</Badge>
                        ) : (
                          <Badge variant="success">In Stock</Badge>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </>
        )}

        {tab === "low" &&
          (lowStock.length === 0 ? (
            <Empty title="No low stock items" message="All products are well stocked" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Product</Th>
                  <Th>Store</Th>
                  <Th>Quantity</Th>
                  <Th>Threshold</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {lowStock.map((s) => (
                  <Tr key={s.id}>
                    <Td className="font-medium">
                      {s.product?.name}
                      <p className="text-xs text-slate-400 dark:text-slate-500">{s.product?.sku}</p>
                    </Td>
                    <Td>{s.store?.name || "—"}</Td>
                    <Td className="font-medium">{s.quantity}</Td>
                    <Td>{s.lowStockThreshold}</Td>
                    <Td>
                      <Badge variant={s.quantity === 0 ? "danger" : "warning"}>
                        {s.quantity === 0 ? "Out" : "Low"}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ))}

        {tab === "movements" &&
          (movements.length === 0 ? (
            <Empty title="No stock movements" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Product</Th>
                  <Th>Type</Th>
                  <Th>Change</Th>
                  <Th>After</Th>
                  <Th>By</Th>
                  <Th>Notes</Th>
                  <Th>Date</Th>
                </Tr>
              </Thead>
              <Tbody>
                {movements.map((m) => (
                  <Tr key={m.id}>
                    <Td className="font-medium">
                      {m.product?.name}
                      <p className="text-xs text-slate-400 dark:text-slate-500">{m.product?.sku}</p>
                    </Td>
                    <Td>
                      <Badge variant={m.quantityChange > 0 ? "success" : "danger"}>
                        {m.type.replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td
                      className={`font-medium ${m.quantityChange > 0 ? "text-success-600" : "text-danger-600"}`}
                    >
                      {m.quantityChange > 0 ? "+" : ""}
                      {m.quantityChange}
                    </Td>
                    <Td>{m.quantityAfter}</Td>
                    <Td className="text-xs">
                      {m.user ? `${m.user.firstName} ${m.user.lastName}` : "—"}
                    </Td>
                    <Td className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                      {m.notes || "—"}
                    </Td>
                    <Td className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(m.createdAt)}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ))}

        {tab === "transfers" &&
          (transfers.length === 0 ? (
            <Empty title="No transfers" />
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Transfer #</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {transfers.map((t) => (
                  <Tr key={t.id}>
                    <Td>
                      <Link href={`/inventory/transfers/${t.id}`} className="inline-block">
                        <code className="text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded transition-colors">
                          {t.transferNumber}
                        </code>
                      </Link>
                    </Td>
                    <Td>{t.fromStore?.name || "—"}</Td>
                    <Td>{t.toStore?.name || "—"}</Td>
                    <Td>
                      <StatusBadge status={t.status} />
                    </Td>
                    <Td className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(t.createdAt)}
                    </Td>
                    <Td className="text-right">
                      <Link href={`/inventory/transfers/${t.id}`}>
                        <Button variant="ghost" size="icon" title="View details">
                          <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        </Button>
                      </Link>
                      {t.status === "PENDING" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfirmAction({
                                id: t.id,
                                action: "ship",
                                transferNumber: t.transferNumber,
                              })
                            }
                            title="Ship"
                          >
                            <Send className="h-4 w-4 text-primary-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfirmAction({
                                id: t.id,
                                action: "cancel",
                                transferNumber: t.transferNumber,
                              })
                            }
                            title="Cancel"
                          >
                            <XCircle className="h-4 w-4 text-danger-500" />
                          </Button>
                        </>
                      )}
                      {t.status === "IN_TRANSIT" && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfirmAction({
                                id: t.id,
                                action: "receive",
                                transferNumber: t.transferNumber,
                              })
                            }
                            title="Receive"
                          >
                            <CheckCircle className="h-4 w-4 text-success-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setConfirmAction({
                                id: t.id,
                                action: "cancel",
                                transferNumber: t.transferNumber,
                              })
                            }
                            title="Cancel (restores source stock)"
                          >
                            <XCircle className="h-4 w-4 text-danger-500" />
                          </Button>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ))}
      </Card>

      {/* Adjust Stock Modal */}
      <Modal open={adjustModal} onClose={() => setAdjustModal(false)} title="Adjust Stock">
        <form onSubmit={handleAdjust} className="space-y-4">
          <FormField label="Store" required>
            <Select
              options={(stores || []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              placeholder="Select store"
              value={adjustForm.storeId}
              onChange={(e) => setAdjustForm({ ...adjustForm, storeId: e.target.value })}
            />
          </FormField>
          <FormField label="Product" required>
            <Select
              searchable
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.sku})`,
              }))}
              placeholder="Select product"
              value={adjustForm.productId}
              onChange={(e) => setAdjustForm({ ...adjustForm, productId: e.target.value })}
            />
          </FormField>
          <FormField label="Adjustment Type" required>
            <Select
              options={ADJUST_TYPES.map((t) => ({
                value: t,
                label: t.replace(/_/g, " "),
              }))}
              value={adjustForm.type}
              onChange={(e) =>
                setAdjustForm({
                  ...adjustForm,
                  type: e.target.value as StockMovementType,
                })
              }
            />
          </FormField>
          <FormField label="Quantity Change" required>
            <Input
              type="number"
              value={adjustForm.quantityChange || ""}
              onChange={(e) =>
                setAdjustForm({
                  ...adjustForm,
                  quantityChange: parseInt(e.target.value) || 0,
                })
              }
              placeholder="Positive to add, negative to remove"
            />
          </FormField>
          <FormField label="Notes">
            <Textarea
              value={adjustForm.notes || ""}
              onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value || null })}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setAdjustModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjusting}>
              Adjust
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Modal */}
      <Modal
        open={transferModal}
        onClose={() => setTransferModal(false)}
        title="Create Stock Transfer"
        size="lg"
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="From Store" required>
              <Select
                options={(stores || []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                placeholder="Source"
                value={transferForm.fromStoreId}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    fromStoreId: e.target.value,
                  })
                }
              />
            </FormField>
            <FormField label="To Store" required>
              <Select
                // Exclude the source store so a transfer can't be created to itself
                options={(stores || [])
                  .filter((s) => s.id !== transferForm.fromStoreId)
                  .map((s) => ({ value: s.id, label: s.name }))}
                placeholder="Destination"
                value={transferForm.toStoreId}
                onChange={(e) =>
                  setTransferForm({
                    ...transferForm,
                    toStoreId: e.target.value,
                  })
                }
              />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea
              value={transferForm.notes}
              onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
            />
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Items</p>
            {transferForm.items.map((item, i) => (
              <div key={i} className="flex gap-3 items-end">
                <div className="flex-1">
                  <Select
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.sku})`,
                    }))}
                    placeholder="Product"
                    value={item.productId}
                    onChange={(e) => {
                      const items = [...transferForm.items];
                      items[i] = { ...items[i], productId: e.target.value };
                      setTransferForm({ ...transferForm, items });
                    }}
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const items = [...transferForm.items];
                      items[i] = {
                        ...items[i],
                        quantity: parseInt(e.target.value) || 1,
                      };
                      setTransferForm({ ...transferForm, items });
                    }}
                  />
                </div>
                {transferForm.items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() =>
                      setTransferForm({
                        ...transferForm,
                        items: transferForm.items.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <XCircle className="h-4 w-4 text-danger-500" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                setTransferForm({
                  ...transferForm,
                  items: [...transferForm.items, { productId: "", quantity: 1 }],
                })
              }
              icon={<Plus className="h-4 w-4" />}
            >
              Add Item
            </Button>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setTransferModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creatingTransfer}>
              Create Transfer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirmation dialog for ship / receive / cancel */}
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && runTransferAction(confirmAction.id, confirmAction.action)}
        title={
          confirmAction?.action === "ship"
            ? "Ship this transfer?"
            : confirmAction?.action === "receive"
              ? "Receive this transfer?"
              : "Cancel this transfer?"
        }
        description={
          confirmAction?.action === "ship"
            ? `Transfer ${confirmAction.transferNumber} will be marked as in transit and stock will be deducted from the source store.`
            : confirmAction?.action === "receive"
              ? `Transfer ${confirmAction?.transferNumber} will be marked as completed and stock will be added to the destination store.`
              : `Transfer ${confirmAction?.transferNumber} will be cancelled. If it was already shipped, the stock will be returned to the source store.`
        }
        confirmLabel={
          confirmAction?.action === "ship"
            ? "Ship"
            : confirmAction?.action === "receive"
              ? "Receive"
              : "Cancel transfer"
        }
        variant={confirmAction?.action === "cancel" ? "danger" : "warning"}
      />
    </>
  );
}
