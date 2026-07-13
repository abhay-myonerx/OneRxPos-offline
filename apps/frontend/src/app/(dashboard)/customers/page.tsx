"use client";

import { useState } from "react";
import { useNavigate } from "@/shell/nav";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  UserCircle,
  Star,
  Filter,
  Eye,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Percent,
  Crown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import {
  useListCustomersQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useListGroupsQuery,
  useCreateGroupMutation,
  useUpdateGroupMutation,
  useDeleteGroupMutation,
  useAdjustPointsMutation,
} from "@/features/customers/api/customers.api";
import { formatMoney } from "@/lib/currency/format-money";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type {
  CreateCustomerInput,
  CreateGroupInput,
} from "@/features/customers/types/customer.types";

type ViewTab = "customers" | "groups";

const emptyCustomerForm: CreateCustomerInput = { name: "" };
const emptyGroupForm: CreateGroupInput = { name: "" };

/**
 * Customer list + customer group management on a two-tab layout.
 * Customers tab: paginated table with search, group/status/due filters, inline
 * create/edit, and a loyalty-points adjustment modal.
 * Groups tab: flat list of pricing groups (VIP, Wholesale, etc.) with discount
 * and tier metadata; customers in a deleted group are unassigned, not deleted.
 */
export default function CustomersPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ViewTab>("customers");

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [hasDue, setHasDue] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "currentBalance" | "loyaltyPoints">(
    "createdAt",
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState<CreateCustomerInput>(emptyCustomerForm);
  const [pointsModal, setPointsModal] = useState<string | null>(null);
  const [pointsForm, setPointsForm] = useState({ points: 0, notes: "" });

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<CreateGroupInput>(emptyGroupForm);

  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<{ id: string; name: string } | null>(
    null,
  );

  // ── Queries ──
  // Empty strings coerced to undefined so the backend treats them as "no filter".
  const { data, isLoading, error, refetch } = useListCustomersQuery({
    search,
    page,
    limit: 20,
    groupId: groupFilter || undefined,
    isActive: activeFilter === "" ? undefined : activeFilter === "true",
    hasDue: hasDue === "" ? undefined : hasDue === "true",
    sortBy,
    sortOrder,
  });
  // Groups are fetched unconditionally — they populate both the filter dropdown
  // on the Customers tab and the Groups tab list without a second round-trip.
  const { data: groups, isLoading: groupsLoading } = useListGroupsQuery();

  // ── Mutations ──
  const [createCustomer, { isLoading: creatingCustomer }] = useCreateCustomerMutation();
  const [updateCustomer, { isLoading: updatingCustomer }] = useUpdateCustomerMutation();
  const [deleteCustomer, { isLoading: deletingCustomer }] = useDeleteCustomerMutation();
  const [adjustPoints, { isLoading: adjusting }] = useAdjustPointsMutation();
  const [createGroup, { isLoading: creatingGroup }] = useCreateGroupMutation();
  const [updateGroup, { isLoading: updatingGroup }] = useUpdateGroupMutation();
  const [deleteGroup, { isLoading: deletingGroup }] = useDeleteGroupMutation();

  // ── Derived state ──
  const customers = data?.data || [];
  const pagination = data?.pagination;

  // Badge on the Filters button showing how many non-search filters are active.
  const activeFilterCount = [groupFilter, activeFilter, hasDue].filter(Boolean).length;

  const openCreateCustomer = () => {
    setCustomerForm(emptyCustomerForm);
    setEditCustomerId(null);
    setCustomerModalOpen(true);
  };
  const openEditCustomer = (c: (typeof customers)[0]) => {
    setCustomerForm({
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      taxId: c.taxId,
      groupId: c.groupId,
      creditLimit: parseFloat(c.creditLimit),
    });
    setEditCustomerId(c.id);
    setCustomerModalOpen(true);
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editCustomerId) {
        await updateCustomer({ id: editCustomerId, data: customerForm }).unwrap();
        showSuccess("Customer updated");
      } else {
        await createCustomer(customerForm).unwrap();
        showSuccess("Customer created");
      }
      setCustomerModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDeleteCustomerConfirm = async () => {
    if (!deleteCustomerTarget) return;
    try {
      await deleteCustomer(deleteCustomerTarget.id).unwrap();
      showSuccess("Customer deactivated");
      setDeleteCustomerTarget(null);
    } catch (err) {
      showApiError(err);
    }
  };

  // ── Handlers ──
  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against a zero-delta submit which would create a no-op ledger entry.
    if (!pointsModal || pointsForm.points === 0) return;
    try {
      const result = await adjustPoints({
        customerId: pointsModal,
        data: { points: pointsForm.points, notes: pointsForm.notes || null },
      }).unwrap();
      showSuccess(`Points adjusted. New balance: ${result.newBalance}`);
      setPointsModal(null);
    } catch (err) {
      showApiError(err);
    }
  };

  const setCustomerField = (key: keyof CreateCustomerInput, value: unknown) =>
    setCustomerForm({ ...customerForm, [key]: value });

  const openCreateGroup = () => {
    setGroupForm(emptyGroupForm);
    setEditGroupId(null);
    setGroupModalOpen(true);
  };
  const openEditGroup = (g: NonNullable<typeof groups>[0]) => {
    setGroupForm({
      name: g.name,
      discountPercent: parseFloat(g.discountPercent),
      pricingTier: g.pricingTier,
    });
    setEditGroupId(g.id);
    setGroupModalOpen(true);
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editGroupId) {
        await updateGroup({ id: editGroupId, data: groupForm }).unwrap();
        showSuccess("Group updated");
      } else {
        await createGroup(groupForm).unwrap();
        showSuccess("Group created");
      }
      setGroupModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDeleteGroupConfirm = async () => {
    if (!deleteGroupTarget) return;
    try {
      await deleteGroup(deleteGroupTarget.id).unwrap();
      showSuccess("Group deleted");
      setDeleteGroupTarget(null);
    } catch (err) {
      showApiError(err);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Customers"
        description={
          activeTab === "customers"
            ? `${pagination?.total || 0} customers`
            : `${groups?.length || 0} groups`
        }
        actions={
          <div className="flex gap-2">
            {activeTab === "customers" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  icon={<Filter className="h-4 w-4" />}
                >
                  Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
                </Button>
                <Button onClick={openCreateCustomer} icon={<Plus className="h-4 w-4" />}>
                  Add Customer
                </Button>
              </>
            ) : (
              <Button onClick={openCreateGroup} icon={<Plus className="h-4 w-4" />}>
                Add Group
              </Button>
            )}
          </div>
        }
      />

      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("customers")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "customers"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <UserCircle className="h-4 w-4" /> Customers
        </button>
        <button
          onClick={() => setActiveTab("groups")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "groups"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <Users className="h-4 w-4" /> Groups
        </button>
      </div>

      {activeTab === "customers" && (
        <Card padding={false}>
          {/* Search & filters */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Search by name, phone, email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                icon={<Search className="h-4 w-4" />}
                className="sm:max-w-xs"
              />
              <Select
                options={[
                  { value: "", label: "All Groups" },
                  ...(groups || []).map((g) => ({ value: g.id, label: g.name })),
                ]}
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setPage(1);
                }}
                className="sm:max-w-[180px]"
              />
            </div>
            {showFilters && (
              <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
                <Select
                  options={[
                    { value: "", label: "All Status" },
                    { value: "true", label: "Active" },
                    { value: "false", label: "Inactive" },
                  ]}
                  value={activeFilter}
                  onChange={(e) => {
                    setActiveFilter(e.target.value);
                    setPage(1);
                  }}
                  className="sm:max-w-[140px]"
                />
                <Select
                  options={[
                    { value: "", label: "Any Balance" },
                    { value: "true", label: "Has Due" },
                  ]}
                  value={hasDue}
                  onChange={(e) => {
                    setHasDue(e.target.value);
                    setPage(1);
                  }}
                  className="sm:max-w-[140px]"
                />
                <Select
                  options={[
                    { value: "createdAt", label: "Date" },
                    { value: "name", label: "Name" },
                    { value: "currentBalance", label: "Balance" },
                    { value: "loyaltyPoints", label: "Points" },
                  ]}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="sm:max-w-[140px]"
                />
                <Select
                  options={[
                    { value: "desc", label: "Descending" },
                    { value: "asc", label: "Ascending" },
                  ]}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                  className="sm:max-w-[120px]"
                />
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setGroupFilter("");
                      setActiveFilter("");
                      setHasDue("");
                      setPage(1);
                    }}
                    className="text-slate-500 dark:text-slate-400"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Customer table */}
          {customers.length === 0 ? (
            <Empty
              title={search || activeFilterCount > 0 ? "No matching customers" : "No customers yet"}
              message={
                search || activeFilterCount > 0
                  ? "Try different search or filters"
                  : "Add your first customer"
              }
              icon={<UserCircle className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
              action={
                !search && activeFilterCount === 0 ? (
                  <Button size="sm" onClick={openCreateCustomer}>
                    <Plus className="h-4 w-4" /> Add Customer
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Customer</Th>
                    <Th>Phone</Th>
                    <Th>Group</Th>
                    <Th>Balance</Th>
                    <Th>Points</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {customers.map((c) => (
                    <Tr
                      key={c.id}
                      onClick={() => navigate(`/customers/${c.id}`)}
                      className="cursor-pointer"
                    >
                      <Td>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                          {c.email && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              {c.email}
                            </p>
                          )}
                        </div>
                      </Td>
                      <Td className="text-sm">
                        {c.phone || <span className="text-slate-400 dark:text-slate-500">—</span>}
                      </Td>
                      <Td>
                        {c.group ? (
                          <Badge variant="info" className="text-[10px]">
                            {c.group.name}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </Td>
                      <Td className="tabular-nums">
                        {parseFloat(c.currentBalance) > 0 ? (
                          <span className="text-danger-600 font-medium">
                            {formatMoney(c.currentBalance)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                          <Star className="h-3 w-3" /> {c.loyaltyPoints.toLocaleString()}
                        </span>
                      </Td>
                      <Td>
                        <Badge variant={c.isActive ? "success" : "danger"}>
                          {c.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => navigate(`/customers/${c.id}`)}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditCustomer(c)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setPointsForm({ points: 0, notes: "" });
                              setPointsModal(c.id);
                            }}
                            title="Adjust Points"
                          >
                            <Star className="h-4 w-4 text-amber-500" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDeleteCustomerTarget({ id: c.id, name: c.name })}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-danger-500" />
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>

              {pagination && pagination.totalPages > 1 && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!pagination.hasMore}
                      onClick={() => setPage(page + 1)}
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {activeTab === "groups" && (
        <Card padding={false}>
          {groupsLoading ? (
            <div className="p-12">
              <Loading />
            </div>
          ) : !groups?.length ? (
            <Empty
              title="No customer groups"
              message="Create groups like VIP, Wholesale, Regular to organize customers and apply discounts"
              icon={<Users className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
              action={
                <Button size="sm" onClick={openCreateGroup}>
                  <Plus className="h-4 w-4" /> Add Group
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="group flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-400/15 flex items-center justify-center shrink-0">
                      <Crown className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {g.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Percent className="h-3 w-3" /> {g.discountPercent}% discount
                        </span>
                        {g.pricingTier && (
                          <Badge variant="outline" className="text-[10px]">
                            {g.pricingTier}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {g._count?.customers ?? 0} customer
                          {(g._count?.customers ?? 0) !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditGroup(g)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeleteGroupTarget({ id: g.id, name: g.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Modal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        title={editCustomerId ? "Edit Customer" : "New Customer"}
        size="lg"
      >
        <form onSubmit={handleCustomerSubmit} className="space-y-4">
          <FormField label="Name" required>
            <Input
              value={customerForm.name}
              onChange={(e) => setCustomerField("name", e.target.value)}
              placeholder="Full name"
              autoFocus
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Phone">
              <Input
                value={customerForm.phone || ""}
                onChange={(e) => setCustomerField("phone", e.target.value || null)}
                placeholder="+880-..."
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={customerForm.email || ""}
                onChange={(e) => setCustomerField("email", e.target.value || null)}
                placeholder="email@example.com"
              />
            </FormField>
          </div>
          <FormField label="Address">
            <Input
              value={customerForm.address || ""}
              onChange={(e) => setCustomerField("address", e.target.value || null)}
              placeholder="Full address"
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tax ID">
              <Input
                value={customerForm.taxId || ""}
                onChange={(e) => setCustomerField("taxId", e.target.value || null)}
              />
            </FormField>
            <FormField label="Credit Limit">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={customerForm.creditLimit ?? ""}
                onChange={(e) =>
                  setCustomerField(
                    "creditLimit",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
              />
            </FormField>
            <FormField label="Group">
              <Select
                options={(groups || []).map((g) => ({ value: g.id, label: g.name }))}
                placeholder="No group"
                value={customerForm.groupId || ""}
                onChange={(e) => setCustomerField("groupId", e.target.value || null)}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setCustomerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creatingCustomer || updatingCustomer}>
              {editCustomerId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title={editGroupId ? "Edit Group" : "New Customer Group"}
      >
        <form onSubmit={handleGroupSubmit} className="space-y-4">
          <FormField label="Group Name" required>
            <Input
              value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              placeholder="e.g. VIP Customers"
              autoFocus
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Discount (%)">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={groupForm.discountPercent ?? ""}
                onChange={(e) =>
                  setGroupForm({
                    ...groupForm,
                    discountPercent: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 10"
              />
            </FormField>
            <FormField label="Pricing Tier">
              <Select
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "premium", label: "Premium" },
                  { value: "wholesale", label: "Wholesale" },
                ]}
                placeholder="Select tier"
                value={groupForm.pricingTier || ""}
                onChange={(e) =>
                  setGroupForm({ ...groupForm, pricingTier: e.target.value || null })
                }
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setGroupModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creatingGroup || updatingGroup}>
              {editGroupId ? "Update" : "Create"} Group
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!pointsModal}
        onClose={() => setPointsModal(null)}
        title="Adjust Loyalty Points"
        size="sm"
      >
        <form onSubmit={handleAdjustPoints} className="space-y-4">
          <FormField label="Points" required>
            <Input
              type="number"
              value={pointsForm.points || ""}
              onChange={(e) =>
                setPointsForm({ ...pointsForm, points: parseInt(e.target.value) || 0 })
              }
              placeholder="Positive to add, negative to deduct"
            />
          </FormField>
          <FormField label="Notes">
            <Input
              value={pointsForm.notes}
              onChange={(e) => setPointsForm({ ...pointsForm, notes: e.target.value })}
              placeholder="e.g. Festival bonus"
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setPointsModal(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjusting} disabled={pointsForm.points === 0}>
              Adjust
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteCustomerTarget !== null}
        onClose={() => !deletingCustomer && setDeleteCustomerTarget(null)}
        onConfirm={handleDeleteCustomerConfirm}
        title="Deactivate Customer?"
        description={
          deleteCustomerTarget
            ? `"${deleteCustomerTarget.name}" will be deactivated and can no longer make purchases.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="danger"
        loading={deletingCustomer}
      />

      <ConfirmDialog
        open={deleteGroupTarget !== null}
        onClose={() => !deletingGroup && setDeleteGroupTarget(null)}
        onConfirm={handleDeleteGroupConfirm}
        title="Delete Group?"
        description={
          deleteGroupTarget
            ? `"${deleteGroupTarget.name}" will be deleted. Customers in this group will be unassigned.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deletingGroup}
      />
    </>
  );
}
