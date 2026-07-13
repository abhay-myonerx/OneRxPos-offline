"use client";
import { useState } from "react";
import { Plus, Eye, ShoppingBag, Ban, CreditCard, PackageCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import {
  useListPurchasesQuery,
  useGetPurchaseQuery,
  useCreatePurchaseMutation,
  useReceiveGoodsMutation,
  useAddPurchasePaymentMutation,
  useCancelPurchaseMutation,
} from "@/features/purchases/api/purchases.api";
import { useListSuppliersQuery } from "@/features/suppliers/api/suppliers.api";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import { useListProductsQuery } from "@/features/products/api/products.api";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDate } from "@/lib/date/format-date";
import { PurchaseStatus, PaymentMethod } from "@/types/enums/status.enums";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type {
  CreatePurchaseInput,
  AddPurchasePaymentInput,
} from "@/features/purchases/types/purchase.types";

export default function PurchasesPage() {
  const [status, setStatus] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);
  const [createModal, setCreateModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payModal, setPayModal] = useState<string | null>(null);
  const [payForm, setPayForm] = useState<AddPurchasePaymentInput>({
    amount: 0,
    method: PaymentMethod.CASH,
  });
  const [form, setForm] = useState<CreatePurchaseInput>({
    supplierId: "",
    storeId: "",
    items: [{ productId: "", orderedQty: 1, unitCost: 0 }],
  });

  const { data, isLoading } = useListPurchasesQuery({
    status: (status as PurchaseStatus) || undefined,
    supplierId: supplierFilter || undefined,
    page,
    limit: 20,
  });
  const { data: detail } = useGetPurchaseQuery(detailId!, { skip: !detailId });
  const { data: suppliers } = useListSuppliersQuery({});
  const { data: stores } = useListStoresQuery({});
  const { data: productData } = useListProductsQuery({
    limit: 100,
    isActive: true,
  });
  const [createPO, { isLoading: creating }] = useCreatePurchaseMutation();
  const [receiveGoods] = useReceiveGoodsMutation();
  const [addPayment, { isLoading: paying }] = useAddPurchasePaymentMutation();
  const [cancelPO] = useCancelPurchaseMutation();

  const purchases = data?.data || [];
  const pagination = data?.pagination;
  const products = productData?.data || [];
  const supplierList = suppliers?.data || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanItems = form.items.filter((i) => i.productId && i.orderedQty > 0 && i.unitCost >= 0);
    if (cleanItems.length === 0) {
      showApiError({ data: { error: { message: "Add at least one item" } } });
      return;
    }
    try {
      await createPO({ ...form, items: cleanItems }).unwrap();
      showSuccess("Purchase order created");
      setCreateModal(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleReceiveAll = async (poId: string) => {
    if (!detail?.items) return;
    try {
      await receiveGoods({
        id: poId,
        data: {
          items: detail.items
            .filter((i) => i.receivedQty < i.orderedQty)
            .map((i) => ({
              purchaseItemId: i.id,
              receivedQty: i.orderedQty - i.receivedQty,
            })),
        },
      }).unwrap();
      showSuccess("Goods received");
    } catch (err) {
      showApiError(err);
    }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    try {
      await addPayment({ id: payModal, data: payForm }).unwrap();
      showSuccess("Payment recorded");
      setPayModal(null);
    } catch (err) {
      showApiError(err);
    }
  };

  if (isLoading) return <Loading />;
  return (
    <>
      <PageHeader
        title="Purchase Orders"
        description={`${pagination?.total || 0} orders`}
        actions={
          <Button
            onClick={() => {
              setForm({
                supplierId: "",
                storeId: "",
                items: [{ productId: "", orderedQty: 1, unitCost: 0 }],
              });
              setCreateModal(true);
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            New PO
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
          <Select
            options={[
              { value: "", label: "All Statuses" },
              ...Object.values(PurchaseStatus).map((s) => ({
                value: s,
                label: s,
              })),
            ]}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-[180px]"
          />
          <Select
            options={[
              { value: "", label: "All Suppliers" },
              ...supplierList.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={supplierFilter}
            onChange={(e) => {
              setSupplierFilter(e.target.value);
              setPage(1);
            }}
            className="sm:max-w-[200px]"
          />
        </div>

        {!purchases.length ? (
          <Empty
            title="No purchase orders"
            icon={<ShoppingBag className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>PO #</Th>
                <Th>Supplier</Th>
                <Th>Store</Th>
                <Th>Total</Th>
                <Th>Paid</Th>
                <Th>Status</Th>
                <Th>Date</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {purchases.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <code className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {p.purchaseNo}
                    </code>
                  </Td>
                  <Td>{p.supplier?.name || "—"}</Td>
                  <Td>{p.store?.name || "—"}</Td>
                  <Td className="font-medium">{formatMoney(p.grandTotal)}</Td>
                  <Td>{formatMoney(p.paidAmount)}</Td>
                  <Td>
                    <StatusBadge status={p.status} />
                  </Td>
                  <Td className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(p.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDetailId(p.id)}
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(p.status === "DRAFT" || p.status === "ORDERED" || p.status === "PARTIAL") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setPayForm({ amount: 0, method: PaymentMethod.CASH });
                          setPayModal(p.id);
                        }}
                        title="Pay"
                      >
                        <CreditCard className="h-4 w-4 text-primary-500" />
                      </Button>
                    )}
                    {p.status !== "RECEIVED" && p.status !== "CANCELLED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (confirm("Cancel this PO?"))
                            try {
                              await cancelPO(p.id).unwrap();
                              showSuccess("Cancelled");
                            } catch (err) {
                              showApiError(err);
                            }
                        }}
                        title="Cancel"
                      >
                        <Ban className="h-4 w-4 text-danger-500" />
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create PO Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="New Purchase Order"
        size="xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Supplier" required>
              <Select
                options={supplierList.map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                placeholder="Select supplier"
                value={form.supplierId}
                onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              />
            </FormField>
            <FormField label="Store" required>
              <Select
                options={(stores || []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                placeholder="Select store"
                value={form.storeId}
                onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Expected Date">
              <Input
                type="date"
                value={form.expectedDate ? String(form.expectedDate).split("T")[0] : ""}
                onChange={(e) => setForm({ ...form, expectedDate: e.target.value || null })}
              />
            </FormField>
            <FormField label="Shipping Cost">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.shippingCost ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shippingCost: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
            />
          </FormField>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Items</p>
            {form.items.map((item, i) => (
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
                      const items = [...form.items];
                      items[i] = { ...items[i], productId: e.target.value };
                      setForm({ ...form, items });
                    }}
                  />
                </div>
                <div className="w-20">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 block">
                    Qty
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={item.orderedQty}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[i] = {
                        ...items[i],
                        orderedQty: parseInt(e.target.value) || 1,
                      };
                      setForm({ ...form, items });
                    }}
                  />
                </div>
                <div className="w-28">
                  <label className="text-[10px] text-slate-400 dark:text-slate-500 block">
                    Unit Cost
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitCost || ""}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[i] = {
                        ...items[i],
                        unitCost: parseFloat(e.target.value) || 0,
                      };
                      setForm({ ...form, items });
                    }}
                  />
                </div>
                {form.items.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        items: form.items.filter((_, j) => j !== i),
                      })
                    }
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  items: [...form.items, { productId: "", orderedQty: 1, unitCost: 0 }],
                })
              }
              icon={<Plus className="h-4 w-4" />}
            >
              Add Item
            </Button>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create PO
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`PO ${detail?.purchaseNo || ""}`}
        size="lg"
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Total</p>
                <p className="font-medium">{formatMoney(detail.grandTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Paid</p>
                <p className="font-medium text-success-600 dark:text-success-300">
                  {formatMoney(detail.paidAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Status</p>
                <StatusBadge status={detail.status} />
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Supplier</p>
                <p className="text-sm">{detail.supplier?.name}</p>
              </div>
            </div>
            <Table>
              <Thead>
                <Tr>
                  <Th>Product</Th>
                  <Th>Ordered</Th>
                  <Th>Received</Th>
                  <Th>Unit Cost</Th>
                  <Th>Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {detail.items?.map((item) => (
                  <Tr key={item.id}>
                    <Td className="font-medium">
                      {item.product?.name}
                      {item.variant ? (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {" "}
                          / {item.variant.name}
                        </span>
                      ) : (
                        ""
                      )}
                    </Td>
                    <Td>{item.orderedQty}</Td>
                    <Td>{item.receivedQty}</Td>
                    <Td>{formatMoney(item.unitCost)}</Td>
                    <Td className="font-medium">{formatMoney(item.lineTotal)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {(detail.status === "ORDERED" || detail.status === "PARTIAL") && (
              <Button
                onClick={() => handleReceiveAll(detail.id)}
                icon={<PackageCheck className="h-4 w-4" />}
              >
                Receive All Remaining
              </Button>
            )}
          </div>
        )}
      </Modal>

      {/* Payment Modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Add Payment" size="sm">
        <form onSubmit={handlePay} className="space-y-4">
          <FormField label="Amount" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={payForm.amount || ""}
              onChange={(e) =>
                setPayForm({
                  ...payForm,
                  amount: parseFloat(e.target.value) || 0,
                })
              }
            />
          </FormField>
          <FormField label="Method" required>
            <Select
              options={["CASH", "CARD", "MOBILE_BANKING", "OTHER"].map((m) => ({
                value: m,
                label: m.replace("_", " "),
              }))}
              value={payForm.method}
              onChange={(e) =>
                setPayForm({
                  ...payForm,
                  method: e.target.value as PaymentMethod,
                })
              }
            />
          </FormField>
          <FormField label="Reference No">
            <Input
              value={payForm.referenceNo || ""}
              onChange={(e) => setPayForm({ ...payForm, referenceNo: e.target.value || null })}
            />
          </FormField>
          <FormField label="Notes">
            <Input
              value={payForm.notes || ""}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value || null })}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setPayModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={paying}>
              Record Payment
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
