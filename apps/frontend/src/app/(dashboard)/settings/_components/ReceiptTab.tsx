"use client";

/**
 * Receipt template editor: branding, header/footer, line items, barcode, QR, preview.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Save,
  Building2,
  Type,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  GripVertical,
  Globe,
  FileText,
  Printer,
  QrCode,
  X,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form/form-field";
import {
  useGetReceiptTemplateQuery,
  useUpsertReceiptTemplateMutation,
} from "@/features/receipt/api/receipt.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type {
  ReceiptDisplayOptions,
  ReceiptCustomField,
} from "@/features/receipt/types/receipt.types";
import { DEFAULT_DISPLAY_OPTIONS } from "@/features/receipt/types/receipt.types";
import { SectionTitle, SettingsCard, Divider, Toggle } from "./shared";
import { cn } from "@/lib/utils/cn";
import { ImageDropzone } from "@/features/media/components/upload/ImageDropzone";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary/cloudinary.helpers";

type Section = "branding" | "content" | "display" | "fields";

const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "branding",
    label: "Branding",
    icon: <Building2 className="h-3.5 w-3.5" />,
  },
  { id: "content", label: "Content", icon: <Type className="h-3.5 w-3.5" /> },
  { id: "display", label: "Display", icon: <Eye className="h-3.5 w-3.5" /> },
  {
    id: "fields",
    label: "Custom Fields",
    icon: <FileText className="h-3.5 w-3.5" />,
  },
];

const generateBarcodeSegments = () =>
  Array.from({ length: 35 }).map(() => ({
    width: Math.random() > 0.5 ? 2 : 1,
    height: 18 + Math.random() * 8,
  }));

export function ReceiptTab() {
  const { data: template } = useGetReceiptTemplateQuery();
  const [upsert, { isLoading: saving }] = useUpsertReceiptTemplateMutation();
  const [section, setSection] = useState<Section>("branding");
  const [showPreview, setShowPreview] = useState(false);

  const [name, setName] = useState("Default Receipt");
  const [logoUrl, setLogoUrl] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [website, setWebsite] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [termsText, setTermsText] = useState("");
  const [thankYouMsg, setThankYouMsg] = useState("Thank you for your purchase!");
  const [opts, setOpts] = useState<ReceiptDisplayOptions>(DEFAULT_DISPLAY_OPTIONS);
  const [fields, setFields] = useState<ReceiptCustomField[]>([]);

  // Logo replacement via hidden file input
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // Defer hydration by one tick so the state batch lands in the next
  // render cycle, preventing a flash where the form briefly shows stale
  // defaults before the fetched template values overwrite them.
  useEffect(() => {
    if (!template) return;
    const id = setTimeout(() => {
      setName(template.name || "Default Receipt");
      setLogoUrl(template.logoUrl || "");
      setBusinessName(template.businessName || "");
      setBusinessAddress(template.businessAddress || "");
      setBusinessPhone(template.businessPhone || "");
      setBusinessEmail(template.businessEmail || "");
      setTaxId(template.taxId || "");
      setWebsite(template.website || "");
      setHeaderText(template.headerText || "");
      setFooterText(template.footerText || "");
      setTermsText(template.termsText || "");
      setThankYouMsg(template.thankYouMsg || "Thank you for your purchase!");
      setOpts({ ...DEFAULT_DISPLAY_OPTIONS, ...template.displayOptions });
      setFields(template.customFields || []);
    }, 0);
    return () => clearTimeout(id);
  }, [template]);

  const toggle = (key: keyof ReceiptDisplayOptions) => setOpts((p) => ({ ...p, [key]: !p[key] }));

  const addField = () => {
    if (fields.length >= 10) return;
    setFields([...fields, { label: "", value: "" }]);
  };

  const barcodeSegments = useMemo(() => generateBarcodeSegments(), []);

  // Handle logo file change (for "Change" button)
  const handleLogoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) return;
      if (file.size > 5 * 1024 * 1024) return;

      setLogoUploading(true);
      try {
        const url = await uploadToCloudinary(file);
        // Cleanup old logo
        if (logoUrl && logoUrl.includes("res.cloudinary.com")) {
          deleteFromCloudinary(logoUrl);
        }
        setLogoUrl(url);
      } catch {
        // silent fail
      } finally {
        setLogoUploading(false);
      }
    },
    [logoUrl],
  );

  const handleLogoRemove = useCallback(() => {
    if (logoUrl && logoUrl.includes("res.cloudinary.com")) {
      deleteFromCloudinary(logoUrl);
    }
    setLogoUrl("");
  }, [logoUrl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsert({
        name,
        logoUrl: logoUrl || null,
        businessName: businessName || null,
        businessAddress: businessAddress || null,
        businessPhone: businessPhone || null,
        businessEmail: businessEmail || null,
        taxId: taxId || null,
        website: website || null,
        headerText: headerText || null,
        footerText: footerText || null,
        termsText: termsText || null,
        thankYouMsg: thankYouMsg || null,
        displayOptions: opts,
        customFields: fields.filter((f) => f.label.trim()),
      }).unwrap();
      showSuccess("Receipt template saved");
    } catch (err) {
      showApiError(err);
    }
  };

  // renderReceipt is a plain function rather than a nested component so that it
  // can close over `opts`, `fields`, etc. without violating the Rules of Hooks.
  // It renders the same JSX tree for both the in-panel thumbnail and the full
  // modal preview; `large=true` switches font size classes.
  const renderReceipt = (large = false) => (
    <div
      className={cn(
        "bg-white rounded-md border border-slate-200 font-mono text-slate-700 overflow-hidden w-full",
        large
          ? opts.fontSize === "small"
            ? "text-[10px]"
            : opts.fontSize === "large"
              ? "text-[14px]"
              : "text-[12px]"
          : opts.paperSize === "58mm"
            ? "max-w-[180px] text-[8px]"
            : opts.paperSize === "A4"
              ? "max-w-full text-[11px]"
              : "max-w-[240px] text-[9px]",
        !large && opts.fontSize === "small"
          ? "text-[8px]"
          : !large && opts.fontSize === "large"
            ? "text-[11px]"
            : "",
      )}
    >
      <div className="px-4 py-4 space-y-0.5">
        {opts.showLogo && logoUrl && (
          <div className="text-center pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt=""
              className="max-h-10 mx-auto"
              style={{ objectFit: "contain" }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        {businessName && (
          <p className="text-center font-medium text-sm leading-tight">{businessName}</p>
        )}
        {opts.showStoreAddress && businessAddress && (
          <p className="text-center text-slate-500 leading-tight">{businessAddress}</p>
        )}
        {businessPhone && <p className="text-center text-slate-500">Tel: {businessPhone}</p>}
        {businessEmail && <p className="text-center text-slate-500">{businessEmail}</p>}
        {website && <p className="text-center text-slate-400">{website}</p>}
        {taxId && <p className="text-center text-slate-400">TIN: {taxId}</p>}
        {headerText && <p className="text-center italic text-slate-400 pt-1">{headerText}</p>}

        <div className="!my-2 border-t border-dashed border-slate-200" />

        <div className="flex justify-between text-slate-500">
          <span>INV-001234</span>
          <span>05/04/2026</span>
        </div>
        {opts.showCashierName && <p className="text-slate-400">Cashier: John Doe</p>}
        {opts.showCustomerInfo && <p className="text-slate-400">Customer: Walk-in</p>}

        <div className="!my-2 border-t border-dashed border-slate-200" />

        <div className="space-y-1">
          <div className="flex justify-between">
            <span>Widget Pro x2</span>
            <span>$500.00</span>
          </div>
          {opts.showItemSku && <p className="text-slate-400 pl-2">SKU: WDG-001</p>}
          <div className="flex justify-between">
            <span>Cable USB-C x1</span>
            <span>$250.00</span>
          </div>
        </div>

        <div className="!my-2 border-t border-dashed border-slate-200" />

        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>$750.00</span>
          </div>
          {opts.showDiscountColumn && (
            <div className="flex justify-between text-success-600">
              <span>Discount</span>
              <span>-$50.00</span>
            </div>
          )}
          {opts.showTaxBreakdown && (
            <div className="flex justify-between text-slate-400">
              <span>Tax (0%)</span>
              <span>$0.00</span>
            </div>
          )}
          <div className="flex justify-between font-medium border-t border-slate-300 pt-1 mt-1">
            <span>Total</span>
            <span>$700.00</span>
          </div>
          {opts.showDueAmount && (
            <div className="flex justify-between text-slate-400">
              <span>Due</span>
              <span>$0.00</span>
            </div>
          )}
        </div>

        {opts.showPaymentDetails && (
          <>
            <div className="!my-2 border-t border-dashed border-slate-200" />
            <div className="flex justify-between text-slate-500">
              <span>Paid (Cash)</span>
              <span>$700.00</span>
            </div>
          </>
        )}

        {opts.showLoyaltyPoints && (
          <p className="text-center text-slate-400 pt-1">Points earned: +7</p>
        )}

        {fields.filter((f) => f.label).length > 0 && (
          <>
            <div className="!my-2 border-t border-dashed border-slate-200" />
            {fields
              .filter((f) => f.label)
              .map((f, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-500">{f.label}:</span>
                  <span>{f.value}</span>
                </div>
              ))}
          </>
        )}

        {termsText && (
          <>
            <div className="!my-2 border-t border-dashed border-slate-200" />
            <p className="text-center text-slate-400 leading-tight">{termsText}</p>
          </>
        )}

        <div className="!my-2 border-t border-dashed border-slate-200" />
        {thankYouMsg && <p className="text-center font-medium pt-0.5">{thankYouMsg}</p>}
        {footerText && <p className="text-center text-slate-400">{footerText}</p>}

        {opts.showBarcode && (
          <div className="pt-3 flex justify-center">
            <div className="flex gap-px items-end">
              {barcodeSegments.map((seg, i) => (
                <div
                  key={i}
                  className="bg-slate-700 rounded-[0.5px]"
                  style={{ width: seg.width, height: seg.height }}
                />
              ))}
            </div>
          </div>
        )}

        {opts.showQrCode && (
          <div className="pt-3 flex justify-center">
            <div className="h-16 w-16 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-center">
              <QrCode className="h-8 w-8 text-slate-300" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSave}>
      {/* Hidden file input for logo replacement */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleLogoFileChange}
      />

      {/* Section nav + action buttons */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex flex-wrap gap-0 border-b border-slate-200/80 dark:border-slate-800 flex-1 min-w-0">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "relative flex items-center gap-2 px-3 sm:px-4 py-2.5 text-[13px] font-medium transition-colors whitespace-nowrap",
                  active
                    ? "text-slate-900 dark:text-slate-100"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200",
                )}
              >
                {s.icon}
                <span>{s.label}</span>
                {active && (
                  <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-primary-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 shrink-0 pb-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Eye className="h-4 w-4" />}
            onClick={() => setShowPreview(true)}
          >
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button type="submit" size="sm" loading={saving} icon={<Save className="h-4 w-4" />}>
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </div>

      {/* Form content */}
      <div className="max-w-2xl space-y-5">
        {section === "branding" && (
          <SettingsCard>
            <SectionTitle
              icon={<Building2 className="h-[18px] w-[18px]" />}
              title="Business Branding"
              description="Identity shown at the top of every printed receipt"
            />
            <Divider className="mb-5" />
            <div className="space-y-4">
              <FormField label="Template Name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Default Receipt"
                />
              </FormField>

              <FormField label="Business Logo">
                {logoUrl ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 p-4 max-w-md">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center shrink-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoUrl}
                          alt="Business logo"
                          className="max-h-full max-w-full p-1.5"
                          style={{ objectFit: "contain" }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">
                          Logo uploaded
                        </p>
                        <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5 mb-3">
                          Displayed on printed receipts
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            loading={logoUploading}
                            icon={<RefreshCw className="h-3.5 w-3.5" />}
                            onClick={() => logoInputRef.current?.click()}
                          >
                            Change
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleLogoRemove}
                            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md">
                    <ImageDropzone
                      value={null}
                      onUpload={(url) => setLogoUrl(url)}
                      onRemove={() => setLogoUrl("")}
                    />
                  </div>
                )}
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Recommended: 300×100px, JPG/PNG/WebP up to 5MB
                </p>
              </FormField>

              <FormField label="Business Name">
                <Input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your Store Name"
                />
              </FormField>
              <FormField label="Address">
                <Textarea
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  placeholder="123 Main Street, City"
                  rows={2}
                />
              </FormField>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Phone">
                  <Input
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    placeholder="+880-1711-000000"
                  />
                </FormField>
                <FormField label="Email">
                  <Input
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    placeholder="info@store.com"
                  />
                </FormField>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Tax ID / TIN">
                  <Input
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="TIN-123456789"
                  />
                </FormField>
                <FormField label="Website">
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="www.store.com"
                    icon={<Globe className="h-4 w-4" />}
                  />
                </FormField>
              </div>
            </div>
          </SettingsCard>
        )}

        {section === "content" && (
          <SettingsCard>
            <SectionTitle
              icon={<Type className="h-[18px] w-[18px]" />}
              title="Receipt Content"
              description="Customize the text printed on your receipts"
            />
            <Divider className="mb-5" />
            <div className="space-y-4">
              <FormField label="Header Text">
                <Textarea
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  placeholder="Tagline or promo message"
                  rows={2}
                />
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                  Displayed below business info
                </p>
              </FormField>
              <FormField label="Thank You Message">
                <Input
                  value={thankYouMsg}
                  onChange={(e) => setThankYouMsg(e.target.value)}
                  placeholder="Thank you for your purchase!"
                />
              </FormField>
              <FormField label="Footer Text">
                <Textarea
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="Follow us on social media"
                  rows={2}
                />
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                  Printed at the very bottom
                </p>
              </FormField>
              <FormField label="Terms &amp; Conditions">
                <Textarea
                  value={termsText}
                  onChange={(e) => setTermsText(e.target.value)}
                  placeholder="Returns accepted within 7 days with receipt"
                  rows={3}
                />
              </FormField>
            </div>
          </SettingsCard>
        )}

        {section === "display" && (
          <SettingsCard>
            <SectionTitle
              icon={<Eye className="h-[18px] w-[18px]" />}
              title="Display Options"
              description="Control what appears on your printed receipts"
            />
            <Divider className="mb-5" />

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Header
              </p>
              <Toggle
                label="Business Logo"
                checked={opts.showLogo}
                onChange={() => toggle("showLogo")}
                compact
              />
              <Toggle
                label="Store Name"
                checked={opts.showStoreName}
                onChange={() => toggle("showStoreName")}
                compact
              />
              <Toggle
                label="Store Address"
                checked={opts.showStoreAddress}
                onChange={() => toggle("showStoreAddress")}
                compact
              />
              <Toggle
                label="Cashier Name"
                checked={opts.showCashierName}
                onChange={() => toggle("showCashierName")}
                compact
              />
              <Toggle
                label="Customer Info"
                checked={opts.showCustomerInfo}
                onChange={() => toggle("showCustomerInfo")}
                compact
              />
            </div>

            <Divider className="my-4" />

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Items &amp; Totals
              </p>
              <Toggle
                label="Item SKU"
                checked={opts.showItemSku}
                onChange={() => toggle("showItemSku")}
                compact
              />
              <Toggle
                label="Item Barcode"
                checked={opts.showItemBarcode}
                onChange={() => toggle("showItemBarcode")}
                compact
              />
              <Toggle
                label="Discount Column"
                checked={opts.showDiscountColumn}
                onChange={() => toggle("showDiscountColumn")}
                compact
              />
              <Toggle
                label="Tax Column"
                checked={opts.showTaxColumn}
                onChange={() => toggle("showTaxColumn")}
                compact
              />
              <Toggle
                label="Tax Breakdown"
                checked={opts.showTaxBreakdown}
                onChange={() => toggle("showTaxBreakdown")}
                compact
              />
              <Toggle
                label="Due Amount"
                checked={opts.showDueAmount}
                onChange={() => toggle("showDueAmount")}
                compact
              />
            </div>

            <Divider className="my-4" />

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Footer
              </p>
              <Toggle
                label="Payment Details"
                checked={opts.showPaymentDetails}
                onChange={() => toggle("showPaymentDetails")}
                compact
              />
              <Toggle
                label="Loyalty Points"
                checked={opts.showLoyaltyPoints}
                onChange={() => toggle("showLoyaltyPoints")}
                compact
              />
              <Toggle
                label="Barcode"
                description="Invoice barcode"
                checked={opts.showBarcode}
                onChange={() => toggle("showBarcode")}
                compact
              />
              <Toggle
                label="QR Code"
                checked={opts.showQrCode}
                onChange={() => toggle("showQrCode")}
                compact
              />
            </div>

            <Divider className="my-4" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Paper Size">
                <Select
                  value={opts.paperSize}
                  onChange={(e) =>
                    setOpts({
                      ...opts,
                      paperSize: e.target.value as ReceiptDisplayOptions["paperSize"],
                    })
                  }
                  options={[
                    { value: "58mm", label: "58mm — Thermal Small" },
                    { value: "80mm", label: "80mm — Thermal Standard" },
                    { value: "A4", label: "A4 — Full Page" },
                  ]}
                />
              </FormField>
              <FormField label="Font Size">
                <Select
                  value={opts.fontSize}
                  onChange={(e) =>
                    setOpts({
                      ...opts,
                      fontSize: e.target.value as ReceiptDisplayOptions["fontSize"],
                    })
                  }
                  options={[
                    { value: "small", label: "Small" },
                    { value: "medium", label: "Medium" },
                    { value: "large", label: "Large" },
                  ]}
                />
              </FormField>
            </div>
          </SettingsCard>
        )}

        {section === "fields" && (
          <SettingsCard>
            <SectionTitle
              icon={<FileText className="h-[18px] w-[18px]" />}
              title="Custom Fields"
              description="Add extra information printed on every receipt (max 10)"
            />
            <Divider className="mb-5" />

            {fields.length === 0 ? (
              <div className="text-center py-12 px-6">
                <div className="mx-auto h-14 w-14 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center mb-4">
                  <EyeOff className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  No custom fields
                </p>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">
                  Add details like WiFi password, social handles, or promo codes
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addField}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Add First Field
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {fields.map((f, i) => (
                  <div
                    key={i}
                    className="group flex items-start gap-2.5 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 mt-2.5 shrink-0 cursor-grab" />
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Input
                        value={f.label}
                        onChange={(e) =>
                          setFields(
                            fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                          )
                        }
                        placeholder="Label"
                        className="text-sm"
                      />
                      <Input
                        value={f.value}
                        onChange={(e) =>
                          setFields(
                            fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                          )
                        }
                        placeholder="Value"
                        className="text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFields(fields.filter((_, j) => j !== i))}
                      className="p-2 rounded-md text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {fields.length < 10 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addField}
                    icon={<Plus className="h-4 w-4" />}
                  >
                    Add Field
                  </Button>
                )}
              </div>
            )}
          </SettingsCard>
        )}
      </div>

      {/* Receipt Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="relative bg-slate-100 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              maxWidth: opts.paperSize === "A4" ? 540 : opts.paperSize === "80mm" ? 380 : 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 sticky top-0 bg-slate-100 z-10 rounded-t-2xl">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                  <Printer className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Receipt Preview</p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {opts.paperSize} &middot; {opts.fontSize}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="h-8 w-8 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-slate-600" />
              </button>
            </div>

            <div className="p-6 flex justify-center">{renderReceipt(true)}</div>
          </div>
        </div>
      )}
    </form>
  );
}
