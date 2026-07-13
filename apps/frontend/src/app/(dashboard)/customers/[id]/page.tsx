"use client";

import { useState } from "react";
import { useParams, useNavigate } from "@/shell/nav";
import {
  ArrowLeft,
  Edit,
  UserCircle,
  Star,
  CreditCard,
  Receipt,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  TrendingDown,
  Wallet,
  Award,
  Hash,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { Empty } from "@/components/shared/feedback/Empty";
import {
  useGetCustomerQuery,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useGetCustomerLedgerQuery,
  useGetLoyaltyHistoryQuery,
  useAdjustPointsMutation,
  useListGroupsQuery,
} from "@/features/customers/api/customers.api";
import { formatMoney } from "@/lib/currency/format-money";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { UpdateCustomerInput } from "@/features/customers/types/customer.types";
import { CustomerStatement } from "@/features/customers/components/CustomerStatement";

type Tab = "overview" | "ledger" | "loyalty";

/**
 * Customer detail view with three tabs: contact/account overview, AR ledger
 * (sales + payments), and loyalty point history with manual adjustment.
 * Ledger and loyalty queries use RTK Query's `skip` option so they only fire
 * when the user actually opens those tabs — avoiding wasted fetches.
 */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: customer, isLoading, error, refetch } = useGetCustomerQuery(id);
  const { data: groups } = useListGroupsQuery();
  const [updateCustomer, { isLoading: updating }] = useUpdateCustomerMutation();
  const [deleteCustomer] = useDeleteCustomerMutation();
  const [adjustPoints, { isLoading: adjusting }] = useAdjustPointsMutation();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<UpdateCustomerInput>({});
  const [pointsForm, setPointsForm] = useState({ points: 0, notes: "" });

  // Ledger pagination is intentionally not wired to a setter — the backend
  // returns all entries for small accounts; extend if large customers require it.
  const [ledgerPage] = useState(1);
  const { data: ledger, isLoading: ledgerLoading } = useGetCustomerLedgerQuery(
    { id, page: ledgerPage, limit: 20 },
    { skip: activeTab !== "ledger" },
  );

  const [loyaltyPage, setLoyaltyPage] = useState(1);
  const { data: loyaltyData, isLoading: loyaltyLoading } = useGetLoyaltyHistoryQuery(
    { id, page: loyaltyPage, limit: 20 },
    { skip: activeTab !== "loyalty" },
  );

  const openEdit = () => {
    if (!customer) return;
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      taxId: customer.taxId,
      groupId: customer.groupId,
      creditLimit: parseFloat(customer.creditLimit),
      isActive: customer.isActive,
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateCustomer({ id, data: editForm }).unwrap();
      showSuccess("Customer updated");
      setEditModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Deactivate this customer?")) return;
    try {
      await deleteCustomer(id).unwrap();
      showSuccess("Customer deactivated");
      navigate("/customers");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleToggleActive = async () => {
    if (!customer) return;
    try {
      await updateCustomer({
        id,
        data: { isActive: !customer.isActive },
      }).unwrap();
      showSuccess(customer.isActive ? "Customer deactivated" : "Customer activated");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleAdjustPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pointsForm.points === 0) return;
    try {
      const result = await adjustPoints({
        customerId: id,
        data: { points: pointsForm.points, notes: pointsForm.notes || null },
      }).unwrap();
      showSuccess(`Points adjusted. New balance: ${result.newBalance}`);
      setPointsModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  if (isLoading) return <Loading />;
  if (error || !customer) return <ErrorDisplay message="Customer not found" onRetry={refetch} />;

  // ── Derived state ──
  // Positive currentBalance means the customer owes money (AR due).
  const hasDue = parseFloat(customer.currentBalance) > 0;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "overview",
      label: "Overview",
      icon: <UserCircle className="h-4 w-4" />,
    },
    { key: "ledger", label: "Ledger", icon: <Receipt className="h-4 w-4" /> },
    { key: "loyalty", label: "Loyalty", icon: <Award className="h-4 w-4" /> },
  ];

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-medium text-slate-900 dark:text-slate-100">
                {customer.name}
              </h1>
              <Badge variant={customer.isActive ? "success" : "danger"}>
                {customer.isActive ? "Active" : "Inactive"}
              </Badge>
              {customer.group && <Badge variant="info">{customer.group.name}</Badge>}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
              {customer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {customer.email}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPointsForm({ points: 0, notes: "" });
              setPointsModalOpen(true);
            }}
            icon={<Star className="h-4 w-4" />}
          >
            Adjust Points
          </Button>
          <Button variant="outline" onClick={openEdit} icon={<Edit className="h-4 w-4" />}>
            Edit
          </Button>
          <Button variant="outline" onClick={handleToggleActive}>
            {customer.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="danger" onClick={handleDelete} icon={<Trash2 className="h-4 w-4" />}>
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-400/15 flex items-center justify-center shrink-0">
              <Wallet className="h-5 w-5 text-primary-600 dark:text-primary-300" />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Credit Limit
              </p>
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                {formatMoney(customer.creditLimit)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${hasDue ? "bg-danger-50 dark:bg-danger-500/15" : "bg-success-50 dark:bg-success-500/15"}`}
            >
              <CreditCard
                className={`h-5 w-5 ${hasDue ? "text-danger-600 dark:text-danger-300" : "text-success-600 dark:text-success-300"}`}
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Due Balance
              </p>
              <p
                className={`text-lg font-medium tabular-nums ${hasDue ? "text-danger-600 dark:text-danger-300" : "text-slate-900 dark:text-slate-100"}`}
              >
                {formatMoney(customer.currentBalance)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-warning-500/15 flex items-center justify-center shrink-0">
              <Star className="h-5 w-5 text-amber-600 dark:text-warning-300" />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Loyalty Points
              </p>
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                {customer.loyaltyPoints.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <Receipt className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Total Sales
              </p>
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                {customer._count?.sales ?? 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
            </CardHeader>
            <div className="space-y-4">
              {customer.phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Phone
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{customer.phone}</p>
                  </div>
                </div>
              )}
              {customer.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Email
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{customer.email}</p>
                  </div>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Address
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{customer.address}</p>
                  </div>
                </div>
              )}
              {customer.taxId && (
                <div className="flex items-start gap-3">
                  <Hash className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Tax ID
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200 font-mono">
                      {customer.taxId}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {customer.group && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-slate-500 dark:text-slate-400">Customer Group</span>
                  <div className="text-right">
                    <Badge variant="info">{customer.group.name}</Badge>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {customer.group.discountPercent}% discount ·{" "}
                      {customer.group.pricingTier || "standard"} tier
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">Member Since</span>
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {new Date(customer.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">Last Updated</span>
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {new Date(customer.updatedAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-sm text-slate-500 dark:text-slate-400">Status</span>
                <Badge variant={customer.isActive ? "success" : "danger"}>
                  {customer.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* LEDGER TAB */}
      {activeTab === "ledger" && (
        <div className="space-y-6">
          <CustomerStatement customerId={id} />
          <Card padding={false}>
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">
              Account Ledger
            </h3>
            {ledger && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Balance:{" "}
                <span
                  className={
                    parseFloat(ledger.customer.currentBalance) > 0
                      ? "text-danger-600 dark:text-danger-300 font-medium"
                      : "text-slate-700 dark:text-slate-200"
                  }
                >
                  {formatMoney(ledger.customer.currentBalance)}
                </span>
                {" · "}Credit Limit: {formatMoney(ledger.customer.creditLimit)}
              </p>
            )}
          </div>

          {ledgerLoading ? (
            <div className="p-12">
              <Loading message="Loading ledger..." />
            </div>
          ) : !ledger || (ledger.sales.length === 0 && ledger.payments.length === 0) ? (
            <Empty
              title="No transactions"
              message="This customer has no sales or payment records yet"
              icon={<Receipt className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
            />
          ) : (
            <div className="space-y-6 p-6">
              {/* Sales */}
              {ledger.sales.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" /> Sales ({ledger.sales.length})
                  </h4>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Invoice</Th>
                        <Th>Total</Th>
                        <Th>Paid</Th>
                        <Th>Due</Th>
                        <Th>Status</Th>
                        <Th>Date</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {ledger.sales.map((s) => (
                        <Tr key={s.id}>
                          <Td>
                            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                              {s.invoiceNo}
                            </code>
                          </Td>
                          <Td className="tabular-nums">{formatMoney(s.totalAmount)}</Td>
                          <Td className="tabular-nums text-success-600">
                            {formatMoney(s.paidAmount)}
                          </Td>
                          <Td className="tabular-nums">
                            {parseFloat(s.dueAmount) > 0 ? (
                              <span className="text-danger-600 font-medium">
                                {formatMoney(s.dueAmount)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </Td>
                          <Td>
                            <Badge
                              variant={
                                s.status === "COMPLETED"
                                  ? "success"
                                  : s.status === "PARTIAL"
                                    ? "warning"
                                    : "danger"
                              }
                            >
                              {s.status}
                            </Badge>
                          </Td>
                          <Td className="text-xs">{new Date(s.createdAt).toLocaleDateString()}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}

              {/* Payments */}
              {ledger.payments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                    <CreditCard className="h-4 w-4" /> Payments ({ledger.payments.length})
                  </h4>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Amount</Th>
                        <Th>Method</Th>
                        <Th>Sale</Th>
                        <Th>Date</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {ledger.payments.map((p) => (
                        <Tr key={p.id}>
                          <Td className="font-medium tabular-nums text-success-600">
                            {formatMoney(p.amount)}
                          </Td>
                          <Td>
                            <Badge variant="outline">{p.method}</Badge>
                          </Td>
                          <Td>
                            {p.saleId ? (
                              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                                {p.saleId.slice(0, 8)}...
                              </code>
                            ) : (
                              "—"
                            )}
                          </Td>
                          <Td className="text-xs">{new Date(p.createdAt).toLocaleDateString()}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          )}
          </Card>
        </div>
      )}

      {/* LOYALTY TAB */}
      {activeTab === "loyalty" && (
        <Card padding={false}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-100">
                Loyalty History
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Current balance:{" "}
                <span className="font-medium text-amber-600">
                  {customer.loyaltyPoints.toLocaleString()} points
                </span>
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setPointsForm({ points: 0, notes: "" });
                setPointsModalOpen(true);
              }}
              icon={<Star className="h-4 w-4" />}
            >
              Adjust Points
            </Button>
          </div>

          {loyaltyLoading ? (
            <div className="p-12">
              <Loading message="Loading loyalty history..." />
            </div>
          ) : !loyaltyData || loyaltyData.data.length === 0 ? (
            <Empty
              title="No loyalty history"
              message="No loyalty point transactions yet"
              icon={<Award className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
            />
          ) : (
            <>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Type</Th>
                    <Th>Points</Th>
                    <Th>Notes</Th>
                    <Th>Date</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {loyaltyData.data.map((tx) => (
                    <Tr key={tx.id}>
                      <Td>
                        <Badge
                          variant={
                            tx.type === "EARNED"
                              ? "success"
                              : tx.type === "REDEEMED"
                                ? "info"
                                : tx.type === "ADJUSTED"
                                  ? "warning"
                                  : "danger"
                          }
                        >
                          {tx.type}
                        </Badge>
                      </Td>
                      <Td>
                        <span
                          className={`flex items-center gap-1 font-medium tabular-nums ${tx.points >= 0 ? "text-success-600" : "text-danger-600"}`}
                        >
                          {tx.points >= 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {tx.points >= 0 ? "+" : ""}
                          {tx.points}
                        </span>
                      </Td>
                      <Td className="text-sm text-slate-600 dark:text-slate-300">
                        {tx.notes || "—"}
                      </Td>
                      <Td className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(tx.createdAt).toLocaleString()}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>

              {loyaltyData.pagination.totalPages > 1 && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Page {loyaltyData.pagination.page} of {loyaltyData.pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loyaltyData.pagination.page <= 1}
                      onClick={() => setLoyaltyPage(loyaltyPage - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!loyaltyData.pagination.hasMore}
                      onClick={() => setLoyaltyPage(loyaltyPage + 1)}
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

      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer"
        size="lg"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <FormField label="Name" required>
            <Input
              value={editForm.name || ""}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Phone">
              <Input
                value={editForm.phone || ""}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value || null })}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value || null })}
              />
            </FormField>
          </div>
          <FormField label="Address">
            <Input
              value={editForm.address || ""}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value || null })}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Tax ID">
              <Input
                value={editForm.taxId || ""}
                onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value || null })}
              />
            </FormField>
            <FormField label="Credit Limit">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.creditLimit ?? ""}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    creditLimit: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
              />
            </FormField>
            <FormField label="Group">
              <Select
                options={(groups || []).map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
                placeholder="No group"
                value={editForm.groupId || ""}
                onChange={(e) => setEditForm({ ...editForm, groupId: e.target.value || null })}
              />
            </FormField>
          </div>
          <FormField label="Status">
            <Select
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
              value={String(editForm.isActive ?? true)}
              onChange={(e) =>
                setEditForm({
                  ...editForm,
                  isActive: e.target.value === "true",
                })
              }
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={updating}>
              Update Customer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={pointsModalOpen}
        onClose={() => setPointsModalOpen(false)}
        title="Adjust Loyalty Points"
        size="sm"
      >
        <form onSubmit={handleAdjustPoints} className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Current balance:{" "}
            <span className="font-medium text-amber-600 dark:text-warning-300">
              {customer.loyaltyPoints.toLocaleString()} points
            </span>
          </p>
          <FormField label="Points" required>
            <Input
              type="number"
              value={pointsForm.points || ""}
              onChange={(e) =>
                setPointsForm({
                  ...pointsForm,
                  points: parseInt(e.target.value) || 0,
                })
              }
              placeholder="Positive to add, negative to deduct"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {pointsForm.points !== 0 && (
                <>
                  New balance:{" "}
                  <span className="font-medium">
                    {(customer.loyaltyPoints + pointsForm.points).toLocaleString()}
                  </span>
                </>
              )}
            </p>
          </FormField>
          <FormField label="Notes">
            <Input
              value={pointsForm.notes}
              onChange={(e) => setPointsForm({ ...pointsForm, notes: e.target.value })}
              placeholder="e.g. Festival bonus, Manual correction"
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setPointsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjusting} disabled={pointsForm.points === 0}>
              {pointsForm.points >= 0 ? "Add" : "Deduct"} Points
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
