"use client";

import { useState } from "react";
import { Truck, Star, Trash2, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useGetProductVendorsQuery,
  useAddProductVendorMutation,
  useRemoveProductVendorMutation,
  useSetPreferredVendorMutation,
} from "../api/products.api";
import { useListSuppliersQuery } from "@/features/suppliers/api/suppliers.api";

export interface VendorSectionProps {
  productId: string;
}

/**
 * Multi-vendor management for a product (3H.2). Link several suppliers with a
 * per-vendor cost / SKU / lead-time / reorder-qty, flag one as preferred, and
 * see which is cheapest. Feeds the PO vendor-pick and the auto-reorder trigger.
 */
export function VendorSection({ productId }: VendorSectionProps) {
  const { data: vendors = [] } = useGetProductVendorsQuery(productId);
  const { data: suppliersResp } = useListSuppliersQuery({ limit: 200 });
  const [addVendor, { isLoading: adding }] = useAddProductVendorMutation();
  const [removeVendor] = useRemoveProductVendorMutation();
  const [setPreferred] = useSetPreferredVendorMutation();

  const suppliers = suppliersResp?.data ?? [];
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const [form, setForm] = useState({ supplierId: "", costPrice: "", supplierSku: "", reorderQty: "" });

  const submit = async () => {
    if (!form.supplierId || form.costPrice === "") return;
    try {
      await addVendor({
        productId,
        data: {
          supplierId: form.supplierId,
          costPrice: Number(form.costPrice),
          supplierSku: form.supplierSku || null,
          reorderQty: form.reorderQty ? Number(form.reorderQty) : null,
        },
      }).unwrap();
      showSuccess(`Added ${supplierName(form.supplierId)} as a vendor`);
      setForm({ supplierId: "", costPrice: "", supplierSku: "", reorderQty: "" });
    } catch (e) {
      showApiError(e);
    }
  };

  const prefer = async (supplierId: string) => {
    try {
      await setPreferred({ productId, supplierId }).unwrap();
      showSuccess(`Preferred vendor set`);
    } catch (e) {
      showApiError(e);
    }
  };

  const remove = async (supplierId: string) => {
    try {
      await removeVendor({ productId, supplierId }).unwrap();
    } catch (e) {
      showApiError(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-4 w-4" /> Vendors
        </CardTitle>
      </CardHeader>

      {vendors.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">No vendors linked yet.</p>
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>Supplier</Th>
              <Th>Cost</Th>
              <Th>SKU</Th>
              <Th>Reorder qty</Th>
              <Th>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {vendors.map((v) => (
              <Tr key={v.id} className={v.isCheapest ? "bg-success/5" : undefined}>
                <Td>
                  {supplierName(v.supplierId)}{" "}
                  {v.isPreferred && (
                    <Badge variant="info" className="ml-1 text-[11px]">
                      Preferred
                    </Badge>
                  )}
                  {v.isCheapest && (
                    <Badge variant="success" className="ml-1 text-[11px]">
                      Cheapest
                    </Badge>
                  )}
                </Td>
                <Td>{Number(v.costPrice).toFixed(2)}</Td>
                <Td>{v.supplierSku ?? "—"}</Td>
                <Td>{v.reorderQty ?? "—"}</Td>
                <Td className="text-right">
                  {!v.isPreferred && (
                    <Button size="sm" variant="ghost" onClick={() => prefer(v.supplierId)} aria-label="Set preferred">
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(v.supplierId)} aria-label="Remove vendor">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <div className="flex flex-wrap items-end gap-2 p-4">
        {/* Native select — simple, accessible supplier picker. */}
        <select
          aria-label="Supplier"
          className="h-9 w-48 rounded-md border border-input bg-background px-2 text-sm"
          value={form.supplierId}
          onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
        >
          <option value="">Select supplier…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Cost"
          type="number"
          placeholder="Cost"
          value={form.costPrice}
          onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
        />
        <Input
          aria-label="Vendor SKU"
          placeholder="Vendor SKU"
          value={form.supplierSku}
          onChange={(e) => setForm({ ...form, supplierSku: e.target.value })}
        />
        <Input
          aria-label="Reorder qty"
          type="number"
          placeholder="Reorder qty"
          value={form.reorderQty}
          onChange={(e) => setForm({ ...form, reorderQty: e.target.value })}
        />
        <Button onClick={submit} disabled={adding || !form.supplierId || form.costPrice === ""}>
          <Plus className="mr-1 h-4 w-4" /> Add vendor
        </Button>
      </div>
    </Card>
  );
}
