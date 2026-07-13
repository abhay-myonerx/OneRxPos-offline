"use client";

import { useState } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Filter,
  Eye,
  Upload,
  Package,
  LayoutGrid,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { Empty } from "@/components/shared/feedback/Empty";
import { ImageDropzone } from "@/features/media/components/upload/ImageDropzone";

import {
  useListProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useBulkImportMutation,
} from "@/features/products/api/products.api";

import { useListCategoriesQuery } from "@/features/products/api/categories.api";
import { useListLeviesQuery } from "@/features/levies/api/levies.api";
import { formatMoney } from "@/lib/currency/format-money";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ProductType } from "@/types/enums/status.enums";
import { useAuth } from "@/hooks/useAuth";
import { PERMISSIONS_V2 } from "@/lib/permissions/permissions-v2";

import type {
  CreateProductInput,
  UpdateProductInput,
  Product,
} from "@/features/products/types/product.types";
import { TAX_CATEGORY_OPTIONS } from "@/features/products/types/product.types";
import { Image } from "@/shell/media";

const emptyForm: CreateProductInput = {
  name: "",
  sku: "",
  costPrice: 0,
  sellPrice: 0,
  productType: ProductType.STANDARD,
  taxCategory: "STANDARD",
  taxInclusive: false,
  levyIds: [],
};

/**
 * Paginated product catalog with list/grid toggle, multi-filter search,
 * inline create/edit modal, bulk JSON import, and RBAC-gated actions.
 * Clicking a row navigates to the full product detail page.
 * Four independent permissions gate create / edit / delete / import — a user
 * may have edit rights without delete rights, so each is checked separately.
 */
export default function ProductsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();

  // ── Permissions ──
  const canCreate = can(PERMISSIONS_V2.PRODUCTS_CREATE);
  const canEdit = can(PERMISSIONS_V2.PRODUCTS_UPDATE);
  const canDelete = can(PERMISSIONS_V2.PRODUCTS_DELETE);
  const canImport = can(PERMISSIONS_V2.PRODUCTS_IMPORT);

  // ── Filter / sort / pagination state ──
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "sellPrice">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);

  // ── Modal / form state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateProductInput>(emptyForm);
  const [bulkJson, setBulkJson] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // ── Queries ──
  // Empty string coerced to undefined so the backend treats it as "no filter".
  const { data, isLoading, error, refetch } = useListProductsQuery({
    search,
    page,
    limit: 20,
    categoryId: categoryFilter || undefined,
    productType: (typeFilter as ProductType) || undefined,
    isActive: activeFilter === "" ? undefined : activeFilter === "true",
    sortBy,
    sortOrder,
  });

  const { data: categories } = useListCategoriesQuery();
  const { data: leviesData } = useListLeviesQuery({ limit: 100, isActive: true });
  const levyOptions = (leviesData?.data || []).map((levy) => ({
    value: levy.id,
    label: `${levy.code} — ${levy.name}`,
  }));

  // ── Mutations ──
  const [createProduct, { isLoading: creating }] = useCreateProductMutation();
  const [updateProduct, { isLoading: updating }] = useUpdateProductMutation();
  const [deleteProduct, { isLoading: deletingProduct }] = useDeleteProductMutation();
  const [bulkImport, { isLoading: importing }] = useBulkImportMutation();

  // ── Derived state ──
  const products = data?.data || [];
  const pagination = data?.pagination;

  // Badge on the Filters button showing how many filters are active.
  const activeFilterCount = [categoryFilter, typeFilter, activeFilter].filter(Boolean).length;

  const setField = (key: keyof CreateProductInput, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreate = () => {
    if (!canCreate) return;
    setForm(emptyForm);
    setEditId(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    if (!canEdit) return;

    setForm({
      name: product.name,
      sku: product.sku,
      costPrice: parseFloat(product.costPrice),
      sellPrice: parseFloat(product.sellPrice),
      productType: product.productType,
      categoryId: product.categoryId || null,
      taxGroupId: product.taxGroupId || null,
      taxCategory: product.taxCategory || "STANDARD",
      taxInclusive: product.taxInclusive ?? false,
      levyIds: (product.productLevies || []).map((pl) => pl.levyId),
      description: product.description || null,
      barcode: product.barcode || null,
      image: product.image || null,
      weight: product.weight ? parseFloat(product.weight) : null,
      warrantyMonths: product.warrantyMonths || null,
      expiryDate: product.expiryDate || null,
    });

    setEditId(product.id);
    setModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      if (editId) {
        if (!canEdit) return;
        const updateData: UpdateProductInput = { ...form };
        await updateProduct({ id: editId, data: updateData }).unwrap();
        showSuccess("Product updated");
      } else {
        if (!canCreate) return;
        await createProduct(form).unwrap();
        showSuccess("Product created");
      }

      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleBulkImport = async () => {
    if (!canImport) return;

    try {
      const parsed = JSON.parse(bulkJson);
      // Accept both a bare array and a `{ products: [] }` envelope so buyers
      // can paste exports from other tools without pre-processing.
      const productsToImport = Array.isArray(parsed) ? parsed : parsed.products;

      if (!Array.isArray(productsToImport) || productsToImport.length === 0) {
        showApiError({
          data: { error: { message: "Provide a JSON array of products" } },
        });
        return;
      }

      await bulkImport({ products: productsToImport }).unwrap();
      showSuccess("Bulk import successful");
      setBulkModalOpen(false);
      setBulkJson("");
    } catch (err) {
      if (err instanceof SyntaxError) {
        showApiError({
          data: { error: { message: "Invalid JSON format" } },
        });
        return;
      }

      showApiError(err);
    }
  };

  // Resolve name from already-loaded page data so we don't need an extra fetch.
  const productPendingDelete = deleteConfirmId
    ? products.find((product) => product.id === deleteConfirmId)
    : undefined;

  const confirmDeleteProduct = async () => {
    if (!deleteConfirmId || !canDelete) return;

    try {
      await deleteProduct(deleteConfirmId).unwrap();
      showSuccess("Product deleted");
      setDeleteConfirmId(null);
    } catch (err) {
      showApiError(err);
    }
  };

  const clearFilters = () => {
    setCategoryFilter("");
    setTypeFilter("");
    setActiveFilter("");
    setPage(1);
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Products"
        description={`${pagination?.total || 0} products`}
        actions={
          <div className="flex gap-2">
            {canImport && (
              <Button
                variant="outline"
                onClick={() => setBulkModalOpen(true)}
                icon={<Upload className="h-4 w-4" />}
              >
                Bulk Import
              </Button>
            )}

            {canImport && (
              <Button
                variant="outline"
                onClick={() => navigate("/products/import")}
                icon={<Upload className="h-4 w-4" />}
              >
                Import File
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => setShowFilters((prev) => !prev)}
              icon={<Filter className="h-4 w-4" />}
            >
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </Button>

            {canCreate && (
              <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                Add Product
              </Button>
            )}
          </div>
        }
      />

      <div className="relative z-20 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <Input
              placeholder="Search by name, SKU..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              icon={<Search className="h-4 w-4" />}
              className="sm:max-w-xs"
            />

            <Select
              options={[
                { value: "", label: "All Categories" },
                ...(categories || []).map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
              className="sm:max-w-[180px]"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="List view"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === "list"
                  ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <LayoutList className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              aria-label="Grid view"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
            <Select
              options={[
                { value: "", label: "All Types" },
                ...Object.values(ProductType).map((type) => ({
                  value: type,
                  label: type,
                })),
              ]}
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
              className="sm:max-w-[160px]"
            />

            <Select
              options={[
                { value: "", label: "All Status" },
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
              value={activeFilter}
              onChange={(event) => {
                setActiveFilter(event.target.value);
                setPage(1);
              }}
              className="sm:max-w-[140px]"
            />

            <Select
              options={[
                { value: "createdAt", label: "Date Created" },
                { value: "name", label: "Name" },
                { value: "sellPrice", label: "Price" },
              ]}
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className="sm:max-w-[160px]"
            />

            <Select
              options={[
                { value: "desc", label: "Descending" },
                { value: "asc", label: "Ascending" },
              ]}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)}
              className="sm:max-w-[140px]"
            />

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={clearFilters}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>

      <Card padding={false}>
        {products.length === 0 ? (
          <Empty
            title="No products found"
            message={
              search || activeFilterCount > 0
                ? "Try different search terms or filters"
                : "Create your first product to get started"
            }
            action={
              !search && activeFilterCount === 0 && canCreate ? (
                <Button size="sm" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                  Add Product
                </Button>
              ) : undefined
            }
          />
        ) : viewMode === "list" ? (
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Type</Th>
                <Th>Category</Th>
                <Th>Cost</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>

            <Tbody>
              {products.map((product) => (
                <Tr
                  key={product.id}
                  onClick={() => navigate(`/products/${product.id}`)}
                  className="cursor-pointer"
                >
                  <Td>
                    <div className="flex items-center gap-3">
                      {product.image ? (
                        <Image
                          src={product.image}
                          alt={product.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-lg object-cover border border-slate-200 dark:border-slate-800 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                          {product.name}
                        </p>
                        {product.barcode && (
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            Barcode: {product.barcode}
                          </p>
                        )}
                      </div>
                    </div>
                  </Td>

                  <Td>
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">
                      {product.sku}
                    </code>
                  </Td>

                  <Td>
                    <Badge variant="outline">{product.productType}</Badge>
                  </Td>

                  <Td>
                    {product.category?.name || (
                      <span className="text-slate-400 dark:text-slate-500">—</span>
                    )}
                  </Td>

                  <Td className="tabular-nums">{formatMoney(product.costPrice)}</Td>

                  <Td className="font-medium tabular-nums">{formatMoney(product.sellPrice)}</Td>

                  <Td>
                    <Badge variant={product.isActive ? "success" : "danger"}>
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>

                  <Td className="text-right">
                    <div
                      className="flex items-center justify-end gap-1"
                      // Row has an onClick for navigation; stop propagation so
                      // the action buttons don't also trigger a page transition.
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="View product"
                        onClick={() => navigate(`/products/${product.id}`)}
                        icon={<Eye className="h-4 w-4" />}
                      />

                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit product"
                          onClick={() => openEdit(product)}
                          icon={<Edit className="h-4 w-4" />}
                        />
                      )}

                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Delete product"
                          onClick={() => setDeleteConfirmId(product.id)}
                          icon={<Trash2 className="h-4 w-4 text-danger-500" />}
                        />
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((product) => (
              <div
                key={product.id}
                onClick={() => navigate(`/products/${product.id}`)}
                className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer"
              >
                <div className="aspect-square bg-slate-50 dark:bg-slate-800/50 relative overflow-hidden">
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      width={200}
                      height={200}
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                    </div>
                  )}

                  <div className="absolute top-2 right-2">
                    <Badge
                      variant={product.isActive ? "success" : "danger"}
                      className="text-[10px]"
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/products/${product.id}`);
                      }}
                      className="h-8 w-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center"
                      title="View product"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEdit(product);
                        }}
                        className="h-8 w-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center"
                        title="Edit product"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {canDelete && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteConfirmId(product.id);
                        }}
                        className="h-8 w-8 bg-white dark:bg-slate-800 rounded-lg flex items-center justify-center"
                        title="Delete product"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {product.name}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                    {product.sku}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatMoney(product.sellPrice)}
                    </p>
                    {product.category && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 truncate max-w-[80px]">
                        {product.category.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {pagination.total} products · Page {pagination.page} of {pagination.totalPages}
            </p>

            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                title="Previous page"
                icon={<ChevronLeft className="h-4 w-4" />}
                disabled={pagination.page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              />

              <span className="px-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                {pagination.page}
              </span>

              <Button
                size="icon"
                variant="outline"
                title="Next page"
                icon={<ChevronRight className="h-4 w-4" />}
                disabled={!pagination.hasMore}
                onClick={() => setPage((prev) => prev + 1)}
              />
            </div>
          </div>
        )}
      </Card>

      {(canCreate || canEdit) && (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editId ? "Edit Product" : "New Product"}
          size="xl"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <FormField label="Product Image">
              <ImageDropzone
                value={form.image}
                onUpload={(url) => setField("image", url)}
                onRemove={() => setField("image", null)}
              />
            </FormField>

            <FormField label="Product Name" required>
              <Input value={form.name} onChange={(event) => setField("name", event.target.value)} />
            </FormField>

            <FormField label="SKU" required>
              <Input value={form.sku} onChange={(event) => setField("sku", event.target.value)} />
            </FormField>

            <FormField label="Cost Price" required>
              <Input
                type="number"
                value={form.costPrice || ""}
                onChange={(event) => setField("costPrice", parseFloat(event.target.value) || 0)}
              />
            </FormField>

            <FormField label="Sell Price" required>
              <Input
                type="number"
                value={form.sellPrice || ""}
                onChange={(event) => setField("sellPrice", parseFloat(event.target.value) || 0)}
              />
            </FormField>

            <FormField label="Tax Category">
              <Select
                options={TAX_CATEGORY_OPTIONS}
                value={form.taxCategory || "STANDARD"}
                onChange={(event) => setField("taxCategory", event.target.value)}
              />
            </FormField>

            <Checkbox
              label="Prices include tax (tax-inclusive)"
              checked={form.taxInclusive ?? false}
              onChange={(event) => setField("taxInclusive", event.target.checked)}
            />

            <FormField label="Levies" hint="Flat/percent surcharges applied on top of tax (e.g. eco fees)">
              <Select
                multiple
                searchable
                clearable
                options={levyOptions}
                value={form.levyIds || []}
                onValueChange={(value) => setField("levyIds", value as string[])}
                placeholder="No levies"
              />
            </FormField>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={creating || updating}>
                {editId ? "Update" : "Create"} Product
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {canImport && (
        <Modal
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          title="Bulk Import Products"
          size="lg"
        >
          <div className="space-y-4">
            <Textarea
              value={bulkJson}
              onChange={(event) => setBulkJson(event.target.value)}
              placeholder={`[
  {
    "name": "USB-C Cable 1m",
    "sku": "USB-C-1M",
    "productType": "STANDARD",
    "costPrice": 80,
    "sellPrice": 150
  }
]`}
              className="min-h-[240px] font-mono text-xs"
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setBulkModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleBulkImport}
                loading={importing}
                icon={<Upload className="h-4 w-4" />}
              >
                Import Products
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleteConfirmId !== null}
        onClose={() => !deletingProduct && setDeleteConfirmId(null)}
        onConfirm={confirmDeleteProduct}
        title="Delete this product?"
        description={
          productPendingDelete
            ? `"${productPendingDelete.name}" will be removed from your catalog. This cannot be undone.`
            : "This product will be removed from your catalog. This cannot be undone."
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deletingProduct}
      />
    </>
  );
}
