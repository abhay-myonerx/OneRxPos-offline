"use client";

import { useState, useEffect } from "react";
import { Save, Building2, Store, Package, Users, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form/form-field";
import { useGetMyTenantQuery, useUpdateMyTenantMutation } from "@/features/tenant/api/tenant.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { SectionTitle, SettingsCard, Divider } from "./shared";

const PLAN_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  FREE: "default",
  STARTER: "warning",
  PRO: "success",
  ENTERPRISE: "success",
};
const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  TRIAL: "warning",
  SUSPENDED: "danger",
  CANCELLED: "danger",
};

export function GeneralTab() {
  const { data: tenant } = useGetMyTenantQuery();
  const [updateTenant, { isLoading: saving }] = useUpdateMyTenantMutation();

  const [form, setForm] = useState({ name: "", phone: "", address: "" });

  useEffect(() => {
    if (!tenant) return;
    const id = setTimeout(() => {
      setForm({
        name: tenant.name,
        phone: tenant.phone || "",
        address: tenant.address || "",
      });
    }, 0);
    return () => clearTimeout(id);
  }, [tenant]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateTenant(form).unwrap();
      showSuccess("Business profile saved");
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <div className="space-y-6">
      {tenant && (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-slate-700 dark:text-slate-200" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] font-medium text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                  {tenant.name}
                </h2>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                  @{tenant.slug} · {tenant.email}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={PLAN_COLORS[tenant.plan] ?? "default"}>{tenant.plan}</Badge>
              <Badge variant={STATUS_COLORS[tenant.status] ?? "default"}>{tenant.status}</Badge>
            </div>
          </div>

          {tenant._count && (
            <>
              <Divider className="my-5" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200/60 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-200/60 dark:border-slate-800">
                {[
                  {
                    label: "Stores",
                    value: tenant._count.stores,
                    icon: <Store className="h-4 w-4" />,
                  },
                  {
                    label: "Team Members",
                    value: tenant._count.users,
                    icon: <Users className="h-4 w-4" />,
                  },
                  {
                    label: "Products",
                    value: tenant._count.products,
                    icon: <Package className="h-4 w-4" />,
                  },
                  {
                    label: "Customers",
                    value: tenant._count.customers,
                    icon: <Users className="h-4 w-4" />,
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white dark:bg-slate-900 p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 mb-2">
                      {stat.icon}
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </span>
                    </div>
                    <p className="text-[22px] font-medium text-slate-900 dark:text-slate-100 tracking-tight tabular-nums">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <SettingsCard>
        <SectionTitle
          icon={<Building2 className="h-[18px] w-[18px]" />}
          title="Business Profile"
          description="Your organization's core information visible across the platform"
        />
        <Divider className="mb-6" />

        <form onSubmit={handleSave} className="space-y-5">
          <FormField label="Business Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your business name"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Email Address">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Input
                  type="email"
                  value={tenant?.email || ""}
                  disabled
                  className="pl-10 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
              </div>
            </FormField>
            <FormField label="Phone Number">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+880-1711-000001"
                  className="pl-10"
                />
              </div>
            </FormField>
          </div>

          <FormField label="Business Address">
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street, City, Country"
                rows={2}
                className="pl-10"
              />
            </div>
          </FormField>

          <Divider className="!mt-6" />

          <div className="flex justify-end pt-1">
            <Button type="submit" loading={saving} icon={<Save className="h-4 w-4" />}>
              Save Profile
            </Button>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}
