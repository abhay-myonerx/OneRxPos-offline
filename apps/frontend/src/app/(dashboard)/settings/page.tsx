"use client";

/**
 * Tenant settings workspace: profile, currency, taxes, receipts, and compliance tabs.
 */

import { useState, Suspense } from "react";
import { useSearchParams, useNavigate } from "@/shell/nav";
import {
  Building2,
  DollarSign,
  Settings2,
  Receipt,
  ShieldCheck,
  Info,
  Palette,
  Barcode,
  Cpu,
  CreditCard,
  Pill,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { useGetMyTenantQuery, useGetTenantSettingsQuery } from "@/features/tenant/api/tenant.api";
import { useGetReceiptTemplateQuery } from "@/features/receipt/api/receipt.api";

import { GeneralTab } from "./_components/GeneralTab";
import { CurrencyTab } from "./_components/CurrencyTab";
import { TaxOperationsTab } from "./_components/TaxOperationsTab";
import { ReceiptTab } from "./_components/ReceiptTab";
import { AppearanceTab } from "./_components/AppearanceTab";
import { BarcodeLabelsTab } from "./_components/BarcodeLabelsTab";
import { HardwareTab } from "./_components/HardwareTab";
import { PaymentsTab } from "./_components/PaymentsTab";
import { PharmacyTab } from "./_components/PharmacyTab";

type SettingsTab =
  | "general"
  | "currency"
  | "tax"
  | "pharmacy"
  | "receipt"
  | "barcode"
  | "hardware"
  | "payments"
  | "appearance";

const TABS: {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "general",
    label: "Business",
    icon: <Building2 className="h-4 w-4" />,
    description: "Profile, stores & contact",
  },
  {
    id: "currency",
    label: "Regional",
    icon: <DollarSign className="h-4 w-4" />,
    description: "Currency, timezone & locale",
  },
  {
    id: "tax",
    label: "Tax & Operations",
    icon: <Settings2 className="h-4 w-4" />,
    description: "Tax rules & inventory",
  },
  {
    id: "pharmacy",
    label: "Pharmacy",
    icon: <Pill className="h-4 w-4" />,
    description: "Controlled-substance & Rx",
  },
  {
    id: "receipt",
    label: "Receipt",
    icon: <Receipt className="h-4 w-4" />,
    description: "Template & branding",
  },
  {
    id: "barcode",
    label: "Barcode Labels",
    icon: <Barcode className="h-4 w-4" />,
    description: "Learn Rx / vendor labels",
  },
  {
    id: "hardware",
    label: "Hardware",
    icon: <Cpu className="h-4 w-4" />,
    description: "Printers, drawers & scales",
  },
  {
    id: "payments",
    label: "Payments",
    icon: <CreditCard className="h-4 w-4" />,
    description: "Card processors & terminals",
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: <Palette className="h-4 w-4" />,
    description: "Theme & display",
  },
];

function SettingsPageInner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTab = (searchParams.get("tab") as SettingsTab) || "general";
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    TABS.some((t) => t.id === initialTab) ? initialTab : "general",
  );

  const { isLoading: loadingTenant } = useGetMyTenantQuery();
  const { isLoading: loadingSettings } = useGetTenantSettingsQuery();
  const { isLoading: loadingReceipt } = useGetReceiptTemplateQuery();

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    navigate(`/settings?tab=${tab}`, { replace: true, scroll: false });
  };

  const isLoading = loadingTenant || loadingSettings || loadingReceipt;

  if (isLoading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your business profile, preferences, and system configuration"
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Mobile: horizontal wrapping tab strip — NO scrollbar */}
        <div className="flex flex-wrap gap-1.5 lg:hidden">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:border-slate-600",
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop: vertical sidebar */}
        <nav className="hidden lg:block lg:w-[240px] shrink-0">
          <div className="lg:sticky lg:top-6 space-y-0.5">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "group relative w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-lg text-left transition-colors duration-150",
                    isActive
                      ? "bg-slate-50 text-slate-900 dark:bg-slate-800/60 dark:text-slate-100"
                      : "text-slate-600 hover:bg-slate-50/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-100",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-colors",
                      isActive ? "bg-primary-600" : "bg-transparent",
                    )}
                  />
                  <span
                    className={cn(
                      "shrink-0 transition-colors",
                      isActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600",
                    )}
                  >
                    {tab.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("text-[13px] truncate leading-tight", "font-medium")}>
                      {tab.label}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {tab.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "currency" && <CurrencyTab />}
          {activeTab === "tax" && <TaxOperationsTab />}
          {activeTab === "pharmacy" && <PharmacyTab />}
          {activeTab === "receipt" && <ReceiptTab />}
          {activeTab === "barcode" && <BarcodeLabelsTab />}
          {activeTab === "hardware" && <HardwareTab />}
          {activeTab === "payments" && <PaymentsTab />}
          {activeTab === "appearance" && <AppearanceTab />}
        </div>
      </div>

      <TenantFooter />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsPageInner />
    </Suspense>
  );
}

function TenantFooter() {
  const { data: tenant } = useGetMyTenantQuery();

  if (!tenant) return null;

  return (
    <div className="mt-10 pt-5 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
        <span>
          Tenant ID:{" "}
          <span className="font-mono text-slate-600">{tenant.id?.slice(0, 8)}&hellip;</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 text-slate-400" />
        <span>
          Slug: <span className="font-mono text-slate-600">@{tenant.slug}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5 text-slate-400" />
        <span>
          Member since:{" "}
          <span className="text-slate-600">
            {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}
