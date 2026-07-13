"use client";

import { useState } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Building2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Users,
  Package,
  Store,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { useListAllTenantsQuery } from "@/features/tenant/api/tenant.api";
import type { Tenant } from "@/features/tenant/types/tenant.types";

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

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "TRIAL", label: "Trial" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELLED", label: "Cancelled" },
];

/**
 * SUPER_ADMIN-only tenant list with server-side pagination and status filter.
 * Client-side search filters the current page only (name/email/slug) — a
 * full cross-page text search would need a dedicated query param on the API.
 * Changing the status filter resets `page` to 1 so the displayed count stays
 * consistent with the filtered total.
 */
export default function AdminTenantsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, error, refetch } = useListAllTenantsQuery({
    status: status || undefined,
    page,
    limit: 20,
  });

  const tenants: Tenant[] = data?.data ?? [];
  const pagination = data?.pagination;

  // Search filters only the current page; a full-text search across all
  // tenants would require a separate query param — acceptable for SUPER_ADMIN use.
  const filtered = search
    ? tenants.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.email.toLowerCase().includes(search.toLowerCase()) ||
          t.slug.toLowerCase().includes(search.toLowerCase()),
      )
    : tenants;

  if (isLoading) return <Loading />;
  if (error)
    return (
      <ErrorDisplay
        onRetry={refetch}
        message="Failed to load tenants. Ensure you have SUPER_ADMIN permissions."
      />
    );

  return (
    <>
      <PageHeader
        title="Tenant Management"
        description="Super Admin — manage all tenants across the platform"
        breadcrumbs={[{ label: "Super Admin" }, { label: "Tenant Management" }]}
      />

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Total Tenants",
            value: pagination?.total ?? tenants.length,
            color: "text-primary-600 dark:text-primary-300",
            bg: "bg-primary-50 dark:bg-primary-500/15",
          },
          {
            label: "Active",
            value: tenants.filter((t) => t.status === "ACTIVE").length,
            color: "text-emerald-600 dark:text-emerald-300",
            bg: "bg-emerald-50 dark:bg-emerald-500/15",
          },
          {
            label: "Trial",
            value: tenants.filter((t) => t.status === "TRIAL").length,
            color: "text-amber-600 dark:text-amber-300",
            bg: "bg-amber-50 dark:bg-amber-500/15",
          },
          {
            label: "Suspended",
            value: tenants.filter((t) => t.status === "SUSPENDED").length,
            color: "text-red-600 dark:text-red-300",
            bg: "bg-red-50 dark:bg-red-500/15",
          },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white`}>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
            <p className={`text-2xl font-medium mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-500" />
            All Tenants
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Search name, email, slug…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                options={STATUS_OPTIONS}
                className="w-40"
              />
            </div>
          </div>
        </CardHeader>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tenants found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Tenant
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Contact
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Plan
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Usage
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Created
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary-50 dark:bg-primary-500/15 flex items-center justify-center shrink-0">
                          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                            {tenant.name[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">
                            {tenant.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                            @{tenant.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-slate-700 dark:text-slate-200">{tenant.email}</p>
                      {tenant.phone && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{tenant.phone}</p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={PLAN_BADGE[tenant.plan] ?? "default"}>{tenant.plan}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={STATUS_BADGE[tenant.status] ?? "default"}>
                        {tenant.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      {tenant._count ? (
                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Store className="h-3 w-3" />
                            {tenant._count.stores}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {tenant._count.users}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {tenant._count.products}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Eye className="h-4 w-4" />}
                        onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} tenants
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<ChevronLeft className="h-4 w-4" />}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
