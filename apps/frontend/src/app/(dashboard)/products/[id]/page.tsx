"use client";

import { useState } from "react";
import { useParams, useNavigate } from "@/shell/nav";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Tag,
  Calendar,
  Shield,
  Weight,
  Copy,
  Layers,
  Check,
  Package,
  Boxes,
  Power,
  TrendingUp,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FormField } from "@/components/ui/form/form-field";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { ImageDropzone } from "@/features/media/components/upload/ImageDropzone";
import {
  useGetProductQuery,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useAddVariantMutation,
  useUpdateVariantMutation,
  useDeleteVariantMutation,
} from "@/features/products/api/products.api";
import { useListCategoriesQuery } from "@/features/products/api/categories.api";
import { useListLeviesQuery } from "@/features/levies/api/levies.api";
import { TAX_CATEGORY_OPTIONS } from "@/features/products/types/product.types";
import type { TaxCategory } from "rx-pos-shared";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDate } from "@/lib/date/format-date";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { useAuth } from "@/hooks/useAuth";
import { PERMISSIONS_V2 } from "@/lib/permissions/permissions-v2";
import { usePharmacyEnabled } from "@/features/pharmacy/useSectorEnabled";
import { DrugLinkSection } from "@/features/pharmacy/components/DrugLinkSection";
import { VendorSection } from "@/features/products/components/VendorSection";
import type { ProductVariant } from "@/features/products/types/product.types";

/**
 * Renders per-store stock for a single variant, with a low-stock warning badge
 * when quantity falls at or below the configured threshold.
 */
function VariantStockSummary({ variant }: { variant: ProductVariant }) {
  const rows = variant.storeStock;
  if (!rows?.length) {
    return <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {rows.map((s) => (
        <div
          key={`${s.storeId}-${s.variantId}`}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
        >
          <span className="text-slate-600 dark:text-slate-300">
            {s.store?.name ?? `${s.storeId.slice(0, 8)}…`}
          </span>
          <Badge
            variant={s.quantity <= s.lowStockThreshold ? "warning" : "success"}
            className="text-[10px]"
          >
            {s.quantity}
          </Badge>
        </div>
      ))}
    </div>
  );
}

/** Compact label/value row used throughout the detail cards. */
function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-sm text-slate-700 dark:text-slate-200 text-right">{children}</span>
    </div>
  );
}

interface VariantFormState {
  name: string;
  sku: string;
  barcode: string;
  costPrice: string;
  sellPrice: string;
}

const emptyVariant: VariantFormState = {
  name: "",
  sku: "",
  barcode: "",
  costPrice: "",
  sellPrice: "",
};

interface ProductFormState {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  categoryId: string;
  costPrice: string;
  sellPrice: string;
  weight: string;
  warrantyMonths: string;
  expiryDate: string;
  taxCategory: TaxCategory;
  taxInclusive: boolean;
  levyIds: string[];
}

/**
 * Full product detail view: pricing, metadata, per-store stock, and variant
 * management. Cost price and margin are hidden behind PRODUCTS_READ_COST so
 * cashier roles never see supplier pricing. Image updates are persisted
 * immediately via a standalone PATCH (no modal save needed).
 */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();

  // ── Permissions ──
  const canEdit = can(PERMISSIONS_V2.PRODUCTS_UPDATE);
  const canDelete = can(PERMISSIONS_V2.PRODUCTS_DELETE);
  const canViewCost = can(PERMISSIONS_V2.PRODUCTS_READ_COST);
  const canManageVariants = can(PERMISSIONS_V2.PRODUCTS_VARIANTS_MANAGE);

  // ── Queries & mutations ──
  const { data: product, isLoading, error, refetch } = useGetProductQuery(id);
  const pharmacyEnabled = usePharmacyEnabled();
  const { data: categories } = useListCategoriesQuery();
  const { data: leviesData } = useListLeviesQuery({ limit: 100, isActive: true });
  const levyOptions = (leviesData?.data || []).map((levy) => ({
    value: levy.id,
    label: `${levy.code} — ${levy.name}`,
  }));
  const [updateProduct, { isLoading: savingProduct }] = useUpdateProductMutation();
  const [deleteProduct, { isLoading: deletingProduct }] = useDeleteProductMutation();
  const [addVariant, { isLoading: addingVariant }] = useAddVariantMutation();
  const [updateVariant, { isLoading: updatingVariant }] = useUpdateVariantMutation();
  const [deleteVariant, { isLoading: deletingVariant }] = useDeleteVariantMutation();

  // ── Modal / form state ──
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editVariantId, setEditVariantId] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState<VariantFormState>(emptyVariant);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>({
    name: "",
    sku: "",
    barcode: "",
    description: "",
    categoryId: "",
    costPrice: "",
    sellPrice: "",
    weight: "",
    warrantyMonths: "",
    expiryDate: "",
    taxCategory: "STANDARD",
    taxInclusive: false,
    levyIds: [],
  });

  const [deleteProductOpen, setDeleteProductOpen] = useState(false);
  const [deleteVariantId, setDeleteVariantId] = useState<string | null>(null);

  const [copiedSku, setCopiedSku] = useState(false);

  const openEditProduct = () => {
    if (!product) return;
    setForm({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || "",
      description: product.description || "",
      categoryId: product.categoryId || "",
      costPrice: product.costPrice || "",
      sellPrice: product.sellPrice || "",
      weight: product.weight || "",
      warrantyMonths: product.warrantyMonths != null ? String(product.warrantyMonths) : "",
      expiryDate: product.expiryDate ? product.expiryDate.slice(0, 10) : "",
      taxCategory: product.taxCategory || "STANDARD",
      taxInclusive: product.taxInclusive ?? false,
      levyIds: (product.productLevies || []).map((pl) => pl.levyId),
    });
    setEditModalOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProduct({
        id,
        data: {
          name: form.name,
          sku: form.sku,
          barcode: form.barcode || null,
          description: form.description || null,
          categoryId: form.categoryId || null,
          costPrice: form.costPrice ? parseFloat(form.costPrice) : 0,
          sellPrice: form.sellPrice ? parseFloat(form.sellPrice) : 0,
          weight: form.weight ? parseFloat(form.weight) : null,
          warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths, 10) : null,
          expiryDate: form.expiryDate || null,
          taxCategory: form.taxCategory,
          taxInclusive: form.taxInclusive,
          levyIds: form.levyIds,
        },
      }).unwrap();
      showSuccess("Product updated");
      setEditModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const openAddVariant = () => {
    setVariantForm(emptyVariant);
    setEditVariantId(null);
    setVariantModalOpen(true);
  };

  const openEditVariant = (v: ProductVariant) => {
    setVariantForm({
      name: v.name,
      sku: v.sku,
      barcode: v.barcode || "",
      costPrice: v.costPrice || "",
      sellPrice: v.sellPrice || "",
    });
    setEditVariantId(v.id);
    setVariantModalOpen(true);
  };

  const handleVariantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        name: variantForm.name,
        sku: variantForm.sku,
        barcode: variantForm.barcode || null,
        costPrice: variantForm.costPrice ? parseFloat(variantForm.costPrice) : null,
        sellPrice: variantForm.sellPrice ? parseFloat(variantForm.sellPrice) : null,
      };

      if (editVariantId) {
        await updateVariant({ productId: id, variantId: editVariantId, data }).unwrap();
        showSuccess("Variant updated");
      } else {
        await addVariant({ productId: id, data }).unwrap();
        showSuccess("Variant added");
      }
      setVariantModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDeleteVariant = async () => {
    if (!deleteVariantId) return;
    try {
      await deleteVariant({ productId: id, variantId: deleteVariantId }).unwrap();
      showSuccess("Variant deleted");
      setDeleteVariantId(null);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDeleteProduct = async () => {
    try {
      await deleteProduct(id).unwrap();
      showSuccess("Product deleted");
      navigate("/products");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleToggleActive = async () => {
    if (!product) return;
    try {
      await updateProduct({ id, data: { isActive: !product.isActive } }).unwrap();
      showSuccess(product.isActive ? "Product deactivated" : "Product activated");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleImageUpdate = async (url: string | null) => {
    try {
      await updateProduct({ id, data: { image: url } }).unwrap();
      showSuccess("Image updated");
    } catch (err) {
      showApiError(err);
    }
  };

  const copySku = () => {
    if (product) {
      navigator.clipboard.writeText(product.sku);
      setCopiedSku(true);
      // Revert the checkmark icon after 2 s so the button doesn't stay "done".
      setTimeout(() => setCopiedSku(false), 2000);
    }
  };

  if (isLoading) return <Loading />;
  if (error || !product) return <ErrorDisplay message="Product not found" onRetry={refetch} />;

  // ── Derived state ──

  // Margin is computed here even when canViewCost is false; the value is simply
  // never rendered in that case, so no sensitive data leaks to the DOM.
  const margin = parseFloat(product.sellPrice) - parseFloat(product.costPrice);
  const marginPercent =
    parseFloat(product.costPrice) > 0
      ? ((margin / parseFloat(product.costPrice)) * 100).toFixed(1)
      : null;

  const isVariable = product.productType === "VARIABLE";
  const variantCount = product.variants?.length ?? 0;
  // VARIABLE products carry stock on each variant's storeStock array;
  // STANDARD products carry it on the product itself. Aggregate accordingly.
  const totalStock = isVariable
    ? (product.variants ?? []).reduce(
        (sum, v) => sum + (v.storeStock?.reduce((a, s) => a + s.quantity, 0) ?? 0),
        0,
      )
    : (product.storeStock ?? []).reduce((a, s) => a + s.quantity, 0);

  const categoryOptions = [
    { value: "", label: "No category" },
    ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: product.name }]}
        title={
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/products")}
              aria-label="Back to products"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <span>{product.name}</span>
              <Badge variant={product.isActive ? "success" : "danger"}>
                {product.isActive ? "Active" : "Inactive"}
              </Badge>
              <Badge variant="outline">{product.productType}</Badge>
            </div>
          </div>
        }
        actions={
          <>
            {canEdit && (
              <Button
                variant="secondary"
                onClick={openEditProduct}
                icon={<Pencil className="h-4 w-4" />}
              >
                Edit
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                onClick={handleToggleActive}
                loading={savingProduct}
                icon={<Power className="h-4 w-4" />}
              >
                {product.isActive ? "Deactivate" : "Activate"}
              </Button>
            )}
            {canDelete && (
              <Button
                variant="danger"
                onClick={() => setDeleteProductOpen(true)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            )}
          </>
        }
      />

      {/* SKU + category meta line */}
      <div className="flex flex-wrap items-center gap-3 -mt-3 mb-6 pl-12">
        <button
          onClick={copySku}
          className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <code className="text-xs bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">
            {product.sku}
          </code>
          {copiedSku ? (
            <Check className="h-3.5 w-3.5 text-success-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        {product.category && (
          <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            <Tag className="h-3.5 w-3.5" />
            {product.category.name}
          </span>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-400/10 text-primary-600 dark:text-primary-300 flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Sell Price
            </p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
              {formatMoney(product.sellPrice)}
            </p>
          </div>
        </Card>

        {canViewCost && (
          <Card className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success-50 dark:bg-success-500/10 text-success-600 dark:text-success-300 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Margin
              </p>
              <p className="text-lg font-semibold text-success-600 dark:text-success-300 tabular-nums truncate">
                {formatMoney(margin)}
                {marginPercent && (
                  <span className="text-xs font-normal text-slate-400 ml-1">{marginPercent}%</span>
                )}
              </p>
            </div>
          </Card>
        )}

        <Card className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning-50 dark:bg-warning-500/10 text-warning-600 dark:text-warning-300 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              In Stock
            </p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
              {totalStock}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Variants
            </p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
              {variantCount}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          {/* Image */}
          <Card>
            <CardHeader>
              <CardTitle>Product Image</CardTitle>
            </CardHeader>
            <ImageDropzone
              value={product.image}
              onUpload={(url) => handleImageUpdate(url)}
              onRemove={() => handleImageUpdate(null)}
            />
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
            </CardHeader>
            <div>
              {canViewCost && (
                <DetailRow label="Cost Price">
                  <span className="font-medium tabular-nums">{formatMoney(product.costPrice)}</span>
                </DetailRow>
              )}
              <DetailRow label="Sell Price">
                <span className="font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatMoney(product.sellPrice)}
                </span>
              </DetailRow>
              {canViewCost && (
                <DetailRow label="Margin">
                  <span className="font-medium text-success-600 dark:text-success-300 tabular-nums">
                    {formatMoney(margin)}
                    {marginPercent && (
                      <span className="text-xs text-slate-400 ml-1">({marginPercent}%)</span>
                    )}
                  </span>
                </DetailRow>
              )}
            </div>
          </Card>

          {pharmacyEnabled && (
            <DrugLinkSection
              productId={product.id}
              din={product.din ?? null}
              scheduleOverride={product.scheduleOverride ?? null}
            />
          )}

          {/* 3H.2 multi-vendor management */}
          <VendorSection productId={product.id} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Product details */}
          <Card>
            <CardHeader>
              <CardTitle>Product Details</CardTitle>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openEditProduct}
                  icon={<Pencil className="h-3.5 w-3.5" />}
                >
                  Edit
                </Button>
              )}
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <DetailRow label="Barcode">
                {product.barcode ? (
                  <span className="font-mono text-xs">{product.barcode}</span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </DetailRow>
              <DetailRow label="Category">
                {product.category?.name ?? (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </DetailRow>
              <DetailRow icon={Weight} label="Weight">
                {product.weight ? (
                  `${product.weight} kg`
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </DetailRow>
              <DetailRow icon={Shield} label="Warranty">
                {product.warrantyMonths != null ? (
                  `${product.warrantyMonths} months`
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </DetailRow>
              <DetailRow icon={Calendar} label="Expiry">
                {product.expiryDate ? (
                  formatDate(product.expiryDate)
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </DetailRow>
              <DetailRow label="Tax Group">
                {product.taxGroup?.name ?? (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                )}
              </DetailRow>
              <DetailRow label="Created">{formatDate(product.createdAt)}</DetailRow>
              <DetailRow label="Updated">{formatDate(product.updatedAt)}</DetailRow>
            </div>

            {product.description && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Description
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {product.description}
                </p>
              </div>
            )}
          </Card>

          {/* Product-level stock (standard / non-variable only) */}
          {!isVariable && product.storeStock && product.storeStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Stock by Store</CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {product.storeStock.map((s) => (
                  <div
                    key={s.storeId}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                  >
                    <span className="text-xs text-slate-700 dark:text-slate-200">
                      {s.store?.name ?? `${s.storeId.slice(0, 8)}...`}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge variant={s.quantity <= s.lowStockThreshold ? "warning" : "success"}>
                        Qty: {s.quantity}
                      </Badge>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Low: {s.lowStockThreshold}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Variants */}
          <Card padding={false}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                <h3 className="text-base font-medium text-slate-800 dark:text-slate-100">
                  Variants
                  {variantCount > 0 && (
                    <span className="text-sm font-normal text-slate-400 dark:text-slate-500 ml-2">
                      ({variantCount})
                    </span>
                  )}
                </h3>
              </div>
              {canManageVariants && (
                <Button size="sm" onClick={openAddVariant} icon={<Plus className="h-4 w-4" />}>
                  Add Variant
                </Button>
              )}
            </div>

            {!variantCount ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Package className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center">
                  <p className="text-slate-700 dark:text-slate-200 font-medium">No variants</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {isVariable
                      ? "Add size, color, or other variants"
                      : "Add variants to track multiple SKUs for this product"}
                  </p>
                </div>
                {canManageVariants && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openAddVariant}
                    icon={<Plus className="h-4 w-4" />}
                  >
                    Add First Variant
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Variant</Th>
                    <Th>SKU</Th>
                    <Th>Barcode</Th>
                    <Th>Stock</Th>
                    {canViewCost && <Th>Cost</Th>}
                    <Th>Price</Th>
                    <Th>Status</Th>
                    {canManageVariants && <Th className="text-right">Actions</Th>}
                  </Tr>
                </Thead>
                <Tbody>
                  {product.variants!.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {v.name}
                        </span>
                      </Td>
                      <Td>
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">
                          {v.sku}
                        </code>
                      </Td>
                      <Td>
                        {v.barcode || <span className="text-slate-400 dark:text-slate-500">—</span>}
                      </Td>
                      <Td className="max-w-[200px]">
                        <VariantStockSummary variant={v} />
                      </Td>
                      {canViewCost && (
                        <Td className="tabular-nums">
                          {v.costPrice ? (
                            formatMoney(v.costPrice)
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </Td>
                      )}
                      <Td className="font-medium tabular-nums">
                        {v.sellPrice ? (
                          formatMoney(v.sellPrice)
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </Td>
                      <Td>
                        <Badge variant={v.isActive ? "success" : "danger"}>
                          {v.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </Td>
                      {canManageVariants && (
                        <Td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditVariant(v)}
                              aria-label="Edit variant"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setDeleteVariantId(v.id)}
                              aria-label="Delete variant"
                            >
                              <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                            </Button>
                          </div>
                        </Td>
                      )}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>

      {/* Edit product modal */}
      {canEdit && (
        <Modal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title="Edit Product"
          size="xl"
        >
          <form onSubmit={handleProductSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                />
              </FormField>
              <FormField label="SKU" required>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Barcode">
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Category">
                <Select
                  options={categoryOptions}
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Cost Price" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                />
              </FormField>
              <FormField label="Sell Price" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.sellPrice}
                  onChange={(e) => setForm({ ...form, sellPrice: e.target.value })}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField label="Weight (kg)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.weight}
                  onChange={(e) => setForm({ ...form, weight: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Warranty (months)">
                <Input
                  type="number"
                  min="0"
                  value={form.warrantyMonths}
                  onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })}
                  placeholder="Optional"
                />
              </FormField>
              <FormField label="Expiry Date">
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Description">
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short product description"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Tax Category">
                <Select
                  options={TAX_CATEGORY_OPTIONS}
                  value={form.taxCategory}
                  onChange={(e) => setForm({ ...form, taxCategory: e.target.value as TaxCategory })}
                />
              </FormField>
              <FormField label="Levies" hint="Flat/percent surcharges applied on top of tax">
                <Select
                  multiple
                  searchable
                  clearable
                  options={levyOptions}
                  value={form.levyIds}
                  onValueChange={(value) => setForm({ ...form, levyIds: value as string[] })}
                  placeholder="No levies"
                />
              </FormField>
            </div>

            <Checkbox
              label="Prices include tax (tax-inclusive)"
              checked={form.taxInclusive}
              onChange={(e) => setForm({ ...form, taxInclusive: e.target.checked })}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button variant="outline" type="button" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={savingProduct}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Variant modal */}
      <Modal
        open={variantModalOpen}
        onClose={() => setVariantModalOpen(false)}
        title={editVariantId ? "Edit Variant" : "Add Variant"}
      >
        <form onSubmit={handleVariantSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Variant Name" required>
              <Input
                value={variantForm.name}
                onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                placeholder="e.g. Size L - Blue"
                autoFocus
              />
            </FormField>
            <FormField label="SKU" required>
              <Input
                value={variantForm.sku}
                onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                placeholder="e.g. POLO-L-BLUE"
              />
            </FormField>
          </div>

          <FormField label="Barcode">
            <Input
              value={variantForm.barcode}
              onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })}
              placeholder="Optional"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Cost Price">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={variantForm.costPrice}
                onChange={(e) => setVariantForm({ ...variantForm, costPrice: e.target.value })}
                placeholder="Override parent cost"
              />
            </FormField>
            <FormField label="Sell Price">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={variantForm.sellPrice}
                onChange={(e) => setVariantForm({ ...variantForm, sellPrice: e.target.value })}
                placeholder="Override parent price"
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setVariantModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={addingVariant || updatingVariant}>
              {editVariantId ? "Update" : "Add"} Variant
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm: delete product */}
      <ConfirmDialog
        open={deleteProductOpen}
        onClose={() => setDeleteProductOpen(false)}
        onConfirm={handleDeleteProduct}
        title="Delete product?"
        description="This product and all its variants will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        loading={deletingProduct}
      />

      {/* Confirm: delete variant */}
      <ConfirmDialog
        open={!!deleteVariantId}
        onClose={() => setDeleteVariantId(null)}
        onConfirm={handleDeleteVariant}
        title="Delete variant?"
        description="This variant will be permanently removed. This action cannot be undone."
        confirmLabel="Delete"
        loading={deletingVariant}
      />
    </>
  );
}
