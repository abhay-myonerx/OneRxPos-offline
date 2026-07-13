"use client";

import { useState } from "react";
import { useParams, useNavigate } from "@/shell/nav";
import {
  ArrowLeft,
  TrendingUp,
  Users,
  Package,
  Store,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Hash,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import {
  useGetTenantByIdQuery,
  useChangeTenantPlanMutation,
  useChangeTenantStatusMutation,
} from "@/features/tenant/api/tenant.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PLAN_BADGE: Record<string, "default" | "success" | "warning" | "danger"> = {
  FREE: "default",
  STARTER: "warning",
  PRO: "success",
  ENTERPRISE: "success",
};
const STATUS_BADGE: Record<string, "default" | "success" | "warning" | "danger"> = {
  ACTIVE: "success",
  TRIAL: "warning",
  SUSPENDED: "danger",
  CANCELLED: "danger",
};

const PLAN_OPTIONS = [
  { value: "FREE", label: "FREE" },
  { value: "STARTER", label: "STARTER" },
  { value: "PRO", label: "PRO" },
  { value: "ENTERPRISE", label: "ENTERPRISE" },
];
const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "TRIAL", label: "Trial" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELLED", label: "Cancelled" },
];

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="text-slate-400 dark:text-slate-500 mt-0.5">{icon}</div>
      <div>
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">{value}</p>
      </div>
    </div>
  );
}

/**
 * SUPER_ADMIN tenant detail: view profile, usage counts, and perform
 * plan/status overrides. Destructive status changes (SUSPENDED / CANCELLED)
 * go through a confirmation dialog to prevent accidental tenant lockouts.
 */
export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: tenant, isLoading, error, refetch } = useGetTenantByIdQuery(id);
  const [changePlan, { isLoading: changingPlan }] = useChangeTenantPlanMutation();
  const [changeStatus, { isLoading: changingStatus }] = useChangeTenantStatusMutation();

  const [newPlan, setNewPlan] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleChangePlan = async () => {
    if (!newPlan || newPlan === tenant?.plan) return;
    try {
      await changePlan({ id, plan: newPlan }).unwrap();
      showSuccess(`Plan changed to ${newPlan}`);
      setNewPlan("");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleChangeStatus = async () => {
    if (!newStatus || newStatus === tenant?.status) return;
    try {
      await changeStatus({
        id,
        status: newStatus,
        reason: reason || undefined,
      }).unwrap();
      showSuccess(`Status changed to ${newStatus}`);
      setNewStatus("");
      setReason("");
    } catch (err) {
      showApiError(err);
    }
  };

  if (isLoading) return <Loading />;
  if (error || !tenant)
    return <ErrorDisplay onRetry={refetch} message="Failed to load tenant details." />;

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={`Tenant ID: ${tenant.id}`}
        breadcrumbs={[
          { label: "Super Admin" },
          { label: "All Tenants", href: "/admin/tenants" },
          { label: tenant.name },
        ]}
        actions={
          <Button
            variant="outline"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate("/admin/tenants")}
          >
            Back to Tenants
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Overview card */}
          <Card>
            <div className="flex items-start gap-4 mb-6">
              <div className="h-16 w-16 rounded-2xl bg-primary-50 dark:bg-primary-500/15 flex items-center justify-center shrink-0">
                <span className="text-2xl font-medium text-primary-700 dark:text-primary-300">
                  {tenant.name[0]?.toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-xl font-medium text-slate-800 dark:text-slate-100">
                      {tenant.name}
                    </h2>
                    <p className="text-sm text-slate-400 dark:text-slate-500 font-mono">
                      @{tenant.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={PLAN_BADGE[tenant.plan] ?? "default"}>{tenant.plan}</Badge>
                    <Badge variant={STATUS_BADGE[tenant.status] ?? "default"}>
                      {tenant.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={tenant.email} />
              <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={tenant.phone} />
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                value={tenant.address}
              />
              <InfoRow icon={<Hash className="h-4 w-4" />} label="Tenant ID" value={tenant.id} />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Created"
                value={new Date(tenant.createdAt).toLocaleString()}
              />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Last Updated"
                value={new Date(tenant.updatedAt).toLocaleString()}
              />
            </div>
          </Card>

          {/* Usage stats */}
          {tenant._count && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary-500" /> Usage Statistics
                </CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Stores",
                    value: tenant._count.stores,
                    icon: <Store className="h-5 w-5 text-primary-500" />,
                    bg: "bg-primary-50 dark:bg-primary-500/15",
                  },
                  {
                    label: "Users",
                    value: tenant._count.users,
                    icon: <Users className="h-5 w-5 text-primary-500" />,
                    bg: "bg-primary-50 dark:bg-primary-500/15",
                  },
                  {
                    label: "Products",
                    value: tenant._count.products,
                    icon: <Package className="h-5 w-5 text-emerald-500" />,
                    bg: "bg-emerald-50 dark:bg-emerald-500/15",
                  },
                  {
                    label: "Customers",
                    value: tenant._count.customers,
                    icon: <Users className="h-5 w-5 text-violet-500" />,
                    bg: "bg-violet-50 dark:bg-violet-500/15",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`${s.bg} rounded-xl p-4 flex flex-col items-center gap-2`}
                  >
                    {s.icon}
                    <p className="text-2xl font-medium text-slate-800 dark:text-slate-100">
                      {s.value}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Change Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4.5 w-4.5 text-primary-500" /> Change Plan
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <span className="text-xs text-slate-500 dark:text-slate-400">Current:</span>
                <Badge variant={PLAN_BADGE[tenant.plan] ?? "default"}>{tenant.plan}</Badge>
              </div>
              <FormField label="New Plan">
                <Select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value)}
                  options={PLAN_OPTIONS.filter((p) => p.value !== tenant.plan)}
                  placeholder="Select new plan…"
                />
              </FormField>
              <Button
                onClick={handleChangePlan}
                loading={changingPlan}
                disabled={!newPlan}
                icon={<ShieldCheck className="h-4 w-4" />}
                className="w-full"
              >
                Apply Plan Change
              </Button>
            </div>
          </Card>

          {/* Change Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4.5 w-4.5 text-primary-500" /> Change Status
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <span className="text-xs text-slate-500 dark:text-slate-400">Current:</span>
                <Badge variant={STATUS_BADGE[tenant.status] ?? "default"}>{tenant.status}</Badge>
              </div>
              <FormField label="New Status">
                <Select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  options={STATUS_OPTIONS.filter((s) => s.value !== tenant.status)}
                  placeholder="Select new status…"
                />
              </FormField>
              <FormField label="Reason (optional)">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Account verified"
                />
              </FormField>
              {/* SUSPENDED / CANCELLED warrant an extra confirmation step. */}
              <Button
                onClick={() => {
                  if (newStatus === "SUSPENDED" || newStatus === "CANCELLED") {
                    setConfirmOpen(true);
                  } else {
                    handleChangeStatus();
                  }
                }}
                loading={changingStatus}
                disabled={!newStatus}
                variant={
                  newStatus === "SUSPENDED" || newStatus === "CANCELLED" ? "danger" : "primary"
                }
                icon={<Activity className="h-4 w-4" />}
                className="w-full"
              >
                Apply Status Change
              </Button>
              <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => {
                  setConfirmOpen(false);
                  handleChangeStatus();
                }}
                title={`${newStatus === "SUSPENDED" ? "Suspend" : "Cancel"} Tenant?`}
                description={`This will ${newStatus === "SUSPENDED" ? "suspend" : "cancel"} access for "${tenant?.name}". ${reason ? `Reason: ${reason}` : "No reason provided."}`}
                confirmLabel={newStatus === "SUSPENDED" ? "Suspend" : "Cancel Account"}
                variant="danger"
                loading={changingStatus}
              />
            </div>
          </Card>

          {/* Settings preview */}
          {Object.keys(tenant.settings ?? {}).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tenant Settings</CardTitle>
              </CardHeader>
              <div className="space-y-2 text-xs">
                {Object.entries(tenant.settings).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex justify-between py-1.5 border-b border-slate-50 last:border-0"
                  >
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{key}</span>
                    <span className="text-slate-700 dark:text-slate-200 font-mono">
                      {String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
