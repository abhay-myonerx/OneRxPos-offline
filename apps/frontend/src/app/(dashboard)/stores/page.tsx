"use client";
import { useState } from "react";
import { Plus, Edit, Store, BarChart3, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import {
  useListStoresQuery,
  useCreateStoreMutation,
  useUpdateStoreMutation,
  useGetStoreStatsQuery,
} from "@/features/stores/api/stores.api";
import { StoreAttendanceConfigDialog } from "@/features/stores/components/StoreAttendanceConfigDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { formatMoney } from "@/lib/currency/format-money";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { CreateStoreInput, Store as StoreType } from "@/features/stores/types/store.types";
import { PROVINCE_OPTIONS } from "@/features/stores/types/store.types";

export default function StoresPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [statsId, setStatsId] = useState<string | null>(null);
  const [configStore, setConfigStore] = useState<StoreType | null>(null);
  const { can } = usePermissions();
  const canEditAttendance = can("stores.geolocation.update") || can("stores.ip-whitelist.update");
  const [form, setForm] = useState<CreateStoreInput>({ name: "", code: "" });
  const { data: stores, isLoading, isError, refetch } = useListStoresQuery({});
  const [create, { isLoading: creating }] = useCreateStoreMutation();
  const [update] = useUpdateStoreMutation();
  const { data: stats } = useGetStoreStatsQuery(statsId!, { skip: !statsId });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await update({ id: editId, data: form }).unwrap();
        showSuccess("Updated");
      } else {
        await create(form).unwrap();
        showSuccess("Store created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  if (isLoading) return <Loading />;
  if (isError) return <ErrorDisplay message="Failed to load stores." onRetry={() => refetch()} />;
  return (
    <>
      <PageHeader
        title="Stores"
        actions={
          <Button
            onClick={() => {
              setForm({ name: "", code: "" });
              setEditId(null);
              setModalOpen(true);
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            Add Store
          </Button>
        }
      />
      {!stores?.length ? (
        <Empty
          title="No stores"
          icon={<Store className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {stores.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                  <code className="text-xs text-slate-400 dark:text-slate-500">{s.code}</code>
                </div>
                <Badge variant={s.isActive ? "success" : "danger"}>
                  {s.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              {s.address && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{s.address}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mb-4">
                <span>{s._count?.users || 0} users</span>
                <span>{s._count?.sales || 0} sales</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setForm({
                      name: s.name,
                      code: s.code,
                      address: s.address || undefined,
                      phone: s.phone || undefined,
                      email: s.email || undefined,
                      province: s.province || undefined,
                    });
                    setEditId(s.id);
                    setModalOpen(true);
                  }}
                  icon={<Edit className="h-3.5 w-3.5" />}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatsId(s.id)}
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                >
                  Stats
                </Button>
                {canEditAttendance && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfigStore(s)}
                    icon={<MapPin className="h-3.5 w-3.5" />}
                  >
                    Attendance
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Store" : "New Store"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Store Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. MAIN"
              />
            </FormField>
          </div>
          <FormField label="Address">
            <Input
              value={form.address || ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </FormField>
          <FormField
            label="Province"
            required
            hint="Drives the tax rates applied at checkout (federal + provincial)."
          >
            <Select
              options={PROVINCE_OPTIONS}
              value={form.province || ""}
              onChange={(e) => setForm({ ...form, province: e.target.value as CreateStoreInput["province"] })}
              placeholder="Select a province"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Phone">
              <Input
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              {editId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
      {configStore && (
        <StoreAttendanceConfigDialog
          store={configStore}
          open={!!configStore}
          onClose={() => setConfigStore(null)}
        />
      )}
      <Modal open={!!statsId} onClose={() => setStatsId(null)} title="Store Stats">
        {stats && (
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Users", value: stats.users },
              { label: "Products in Stock", value: stats.productsInStock },
              { label: "Today's Sales", value: stats.todaySales },
              {
                label: "Today's Revenue",
                value: formatMoney(stats.todayRevenue),
              },
              { label: "Low Stock Items", value: stats.lowStockItems },
            ].map((k) => (
              <div key={k.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
                <p className="text-lg font-medium mt-1">{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
