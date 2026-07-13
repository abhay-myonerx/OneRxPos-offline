"use client";

import { useState } from "react";
import { Search, Eye, RotateCcw, Ban, Receipt, Filter, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ReceiptPreviewModal } from "@/features/receipt/components/ReceiptPreviewModal";
import {
  useListSalesQuery,
  useGetSaleQuery,
  useVoidSaleMutation,
  useReturnSaleMutation,
} from "@/features/sales/api/sales.api";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import { formatMoney } from "@/lib/currency/format-money";
import { formatDateTime } from "@/lib/date/format-date";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { SaleStatus } from "@/types/enums/status.enums";

/**
 * Sales history page — lists all completed, voided, and partial transactions.
 *
 * Supports server-side filtering (invoice, status, store, date range, sort)
 * with cursor-style pagination. Managers can void a COMPLETED sale or initiate
 * a return on COMPLETED/PARTIAL sales. A detail modal shows the full line-item
 * breakdown; receipts can be reprinted from either the list or the detail view.
 */
export default function SalesPage() {
  // ── Filter / sort state ───────────────────────────────────────────────────

  const [invoiceNo, setInvoiceNo] = useState("");
  const [status, setStatus] = useState("");
  const [storeId, setStoreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "grandTotal">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [receiptInvoiceNo, setReceiptInvoiceNo] = useState<string>("");

  const { data, isLoading } = useListSalesQuery({
    page,
    limit: 20,
    status: (status as SaleStatus) || undefined,
    invoiceNo: invoiceNo || undefined,
    storeId: storeId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy,
    sortOrder,
  });
  const { data: stores } = useListStoresQuery({});
  // Fetch full sale detail (including line items and payments) only when a row
  // is expanded — `skip` prevents a request until detailId is set.

  const { data: saleDetail } = useGetSaleQuery(detailId!, { skip: !detailId });
  const [voidSale] = useVoidSaleMutation();
  const [returnSale] = useReturnSaleMutation();

  const sales = data?.data || [];
  const pagination = data?.pagination;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleVoid = async (id: string) => {
    const reason = prompt("Reason for voiding (optional):");
    try {
      await voidSale({ id, data: { notes: reason || null } }).unwrap();
      showSuccess("Sale voided");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleReturn = async (id: string) => {
    const notes = prompt("Return notes (optional):");
    try {
      await returnSale({ id, data: { notes: notes || null } }).unwrap();
      showSuccess("Sale returned");
    } catch (err) {
      showApiError(err);
    }
  };

  const openReceipt = (saleId: string, invoice: string) => {
    setReceiptSaleId(saleId);
    setReceiptInvoiceNo(invoice);
  };

  if (isLoading) return <Loading />;

  return (
    <>
      <PageHeader
        title="Sales"
        description={`${pagination?.total || 0} transactions`}
        actions={
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="h-4 w-4" />}
          >
            Filters
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by invoice no..."
              value={invoiceNo}
              onChange={(e) => {
                setInvoiceNo(e.target.value);
                setPage(1);
              }}
              icon={<Search className="h-4 w-4" />}
              className="sm:max-w-xs"
            />
            <Select
              options={[
                { value: "", label: "All Statuses" },
                ...Object.values(SaleStatus).map((s) => ({
                  value: s,
                  label: s,
                })),
              ]}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="sm:max-w-[180px]"
            />
            <Select
              options={[
                { value: "", label: "All Stores" },
                ...(stores || []).map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setPage(1);
              }}
              className="sm:max-w-[180px]"
            />
          </div>
          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  From:
                </span>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-[160px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  To:
                </span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-[160px]"
                />
              </div>
              <Select
                options={[
                  { value: "createdAt", label: "Sort by Date" },
                  { value: "grandTotal", label: "Sort by Amount" },
                ]}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="sm:max-w-[180px]"
              />
              <Select
                options={[
                  { value: "desc", label: "Newest First" },
                  { value: "asc", label: "Oldest First" },
                ]}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                className="sm:max-w-[160px]"
              />
            </div>
          )}
        </div>

        {sales.length === 0 ? (
          <Empty
            title="No sales"
            icon={<Receipt className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          />
        ) : (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Invoice</Th>
                  <Th>Store</Th>
                  <Th>Customer</Th>
                  <Th>Total</Th>
                  <Th>Paid</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {sales.map((s) => (
                  <Tr key={s.id}>
                    <Td>
                      <code className="text-xs font-medium bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                        {s.invoiceNo}
                      </code>
                    </Td>
                    <Td className="text-xs">{s.store?.name || "—"}</Td>
                    <Td>{s.customer?.name || "Walk-in"}</Td>
                    <Td className="font-medium">{formatMoney(s.grandTotal)}</Td>
                    <Td>{formatMoney(s.paidAmount)}</Td>
                    <Td>
                      {/* Non-zero due amount flags a PARTIAL payment — highlights in red for staff */}
                      {parseFloat(s.dueAmount) > 0 ? (
                        <span className="text-danger-600 font-medium">
                          {formatMoney(s.dueAmount)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={s.status} />
                    </Td>
                    <Td className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(s.createdAt)}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDetailId(s.id)}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openReceipt(s.id, s.invoiceNo)}
                          title="Print Receipt"
                        >
                          <Printer className="h-4 w-4 text-primary-500" />
                        </Button>
                        {s.status === "COMPLETED" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleVoid(s.id)}
                            title="Void"
                          >
                            <Ban className="h-4 w-4 text-danger-500" />
                          </Button>
                        )}
                        {(s.status === "COMPLETED" || s.status === "PARTIAL") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleReturn(s.id)}
                            title="Return"
                          >
                            <RotateCcw className="h-4 w-4 text-amber-500" />
                          </Button>
                        )}
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
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!pagination.hasMore}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Sale detail modal */}
      <Modal
        open={!!detailId}
        onClose={() => setDetailId(null)}
        title={`Sale ${saleDetail?.invoiceNo || ""}`}
        size="lg"
      >
        {saleDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Total</p>
                <p className="font-medium">{formatMoney(saleDetail.grandTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Paid</p>
                <p className="font-medium text-success-600">{formatMoney(saleDetail.paidAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Due</p>
                <p className="font-medium text-danger-600">{formatMoney(saleDetail.dueAmount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Status</p>
                <StatusBadge status={saleDetail.status} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Store</p>
                <p>{saleDetail.store?.name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Cashier</p>
                <p>
                  {saleDetail.cashier?.firstName} {saleDetail.cashier?.lastName}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500">Customer</p>
                <p>{saleDetail.customer?.name || "Walk-in"}</p>
              </div>
            </div>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 dark:text-slate-500">
                      Product
                    </th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Disc</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {saleDetail.items?.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <p>{item.product?.name}</p>
                        {item.variant && (
                          <p className="text-xs text-slate-400">{item.variant.name}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">
                        {parseFloat(item.discount) > 0 ? formatMoney(item.discount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {parseFloat(item.taxAmount) > 0 ? formatMoney(item.taxAmount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatMoney(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {saleDetail.payments && saleDetail.payments.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase mb-2">Payments</p>
                <div className="space-y-1">
                  {saleDetail.payments.map((p) => (
                    <div key={p.id} className="flex justify-between text-sm py-1">
                      <span className="text-slate-600">
                        {p.method.replace("_", " ")}
                        {p.referenceNo ? ` (${p.referenceNo})` : ""}
                      </span>
                      <span className="font-medium">{formatMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Print Receipt button inside detail modal */}
            <div className="pt-2 border-t border-slate-200 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                icon={<Printer className="h-4 w-4" />}
                onClick={() => {
                  setDetailId(null);
                  openReceipt(saleDetail.id, saleDetail.invoiceNo);
                }}
              >
                Print Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Receipt preview modal */}
      <ReceiptPreviewModal
        open={!!receiptSaleId}
        onClose={() => setReceiptSaleId(null)}
        saleId={receiptSaleId}
        invoiceNo={receiptInvoiceNo}
      />
    </>
  );
}
