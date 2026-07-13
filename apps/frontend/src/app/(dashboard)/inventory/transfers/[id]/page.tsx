"use client";

import { useState } from "react";
import { Link, useParams } from "@/shell/nav";
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Package,
  Store as StoreIcon,
  Calendar,
  User as UserIcon,
  StickyNote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import {
  useGetTransferQuery,
  useShipTransferMutation,
  useReceiveTransferMutation,
  useCancelTransferMutation,
} from "@/features/inventory/api/inventory.api";
import { formatDateTime } from "@/lib/date/format-date";
import { showApiError, showSuccess } from "@/lib/api/error-handler";

type ActionKind = "ship" | "receive" | "cancel";

export default function TransferDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const {
    data: transfer,
    isLoading,
    isError,
  } = useGetTransferQuery(id, {
    skip: !id,
  });

  const [shipTransfer, { isLoading: shipping }] = useShipTransferMutation();
  const [receiveTransfer, { isLoading: receiving }] = useReceiveTransferMutation();
  const [cancelTransfer, { isLoading: cancelling }] = useCancelTransferMutation();

  const [confirmAction, setConfirmAction] = useState<ActionKind | null>(null);

  const working = shipping || receiving || cancelling;

  if (isLoading) return <Loading />;
  if (isError || !transfer) {
    return (
      <div className="space-y-4">
        <Link href="/inventory?tab=transfers">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>
            Back to transfers
          </Button>
        </Link>
        <Empty
          title="Transfer not found"
          message="It may have been deleted, or you may not have access to it."
        />
      </div>
    );
  }

  const runAction = async (action: ActionKind) => {
    try {
      if (action === "ship") {
        await shipTransfer(transfer.id).unwrap();
        showSuccess("Transfer shipped");
      } else if (action === "receive") {
        await receiveTransfer({ id: transfer.id }).unwrap();
        showSuccess("Transfer received");
      } else {
        await cancelTransfer(transfer.id).unwrap();
        showSuccess("Transfer cancelled");
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setConfirmAction(null);
    }
  };

  const isPending = transfer.status === "PENDING";
  const isInTransit = transfer.status === "IN_TRANSIT";
  const isReadOnly = !isPending && !isInTransit;

  const items = transfer.items || [];
  const totalUnits = items.reduce((sum, it) => sum + it.quantity, 0);

  return (
    <>
      <div className="mb-4">
        <button
          // window.history.back() works identically in both the Next and SPA
          // shells; @/shell/nav intentionally doesn't expose a back() helper
          // since this is the only call site (see Task 6 brief).
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <code className="text-base font-medium bg-slate-100 dark:bg-slate-800 dark:text-slate-200 px-2 py-1 rounded">
              {transfer.transferNumber}
            </code>
            <StatusBadge status={transfer.status} />
          </div>
        }
        description={`Created ${formatDateTime(transfer.createdAt)}`}
        actions={
          isReadOnly ? null : (
            <div className="flex gap-2">
              {isPending && (
                <Button
                  onClick={() => setConfirmAction("ship")}
                  icon={<Send className="h-4 w-4" />}
                  loading={shipping}
                  disabled={working}
                >
                  Ship
                </Button>
              )}
              {isInTransit && (
                <Button
                  onClick={() => setConfirmAction("receive")}
                  icon={<CheckCircle className="h-4 w-4" />}
                  loading={receiving}
                  disabled={working}
                >
                  Receive
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setConfirmAction("cancel")}
                icon={<XCircle className="h-4 w-4" />}
                loading={cancelling}
                disabled={working}
              >
                Cancel
              </Button>
            </div>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Card>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-500/15 text-primary-500 dark:text-primary-400 flex items-center justify-center shrink-0">
              <StoreIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium">
                From
              </p>
              <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                {transfer.fromStore?.name || "—"}
              </p>
              {transfer.fromStore?.code && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transfer.fromStore.code}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-success-500/15 text-green-500 dark:text-success-300 flex items-center justify-center shrink-0">
              <StoreIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium">
                To
              </p>
              <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                {transfer.toStore?.name || "—"}
              </p>
              {transfer.toStore?.code && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transfer.toStore.code}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Items */}
      <Card padding={false} className="mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Items ({items.length})
          </h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {totalUnits} unit{totalUnits === 1 ? "" : "s"} total
          </span>
        </div>
        {items.length === 0 ? (
          <Empty title="No items" />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Variant</Th>
                <Th className="text-right">Quantity</Th>
              </Tr>
            </Thead>
            <Tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td className="font-medium text-slate-800 dark:text-slate-100">
                    {item.product?.name || "—"}
                  </Td>
                  <Td className="text-xs text-slate-500 dark:text-slate-400">
                    {item.product?.sku || "—"}
                  </Td>
                  <Td className="text-xs text-slate-500 dark:text-slate-400">
                    {item.variant?.name || "—"}
                  </Td>
                  <Td className="text-right font-medium">{item.quantity}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      {/* Metadata */}
      <Card>
        <h2 className="font-medium text-slate-800 dark:text-slate-100 mb-3">Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5" />
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Created
              </dt>
              <dd className="text-slate-700 dark:text-slate-200">
                {formatDateTime(transfer.createdAt)}
              </dd>
            </div>
          </div>
          {transfer.completedAt && (
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5" />
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  {transfer.status === "CANCELLED" ? "Cancelled" : "Completed"}
                </dt>
                <dd className="text-slate-700 dark:text-slate-200">
                  {formatDateTime(transfer.completedAt)}
                </dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <UserIcon className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5" />
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Created by
              </dt>
              <dd className="text-slate-700 dark:text-slate-200 font-mono text-xs">
                {transfer.createdBy}
              </dd>
            </div>
          </div>
          {transfer.notes && (
            <div className="flex items-start gap-2 md:col-span-2">
              <StickyNote className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5" />
              <div>
                <dt className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  Notes
                </dt>
                <dd className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                  {transfer.notes}
                </dd>
              </div>
            </div>
          )}
        </dl>
      </Card>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && runAction(confirmAction)}
        loading={working}
        title={
          confirmAction === "ship"
            ? "Ship this transfer?"
            : confirmAction === "receive"
              ? "Receive this transfer?"
              : "Cancel this transfer?"
        }
        description={
          confirmAction === "ship"
            ? `Transfer ${transfer.transferNumber} will be marked as IN TRANSIT and stock will be deducted from ${transfer.fromStore?.name ?? "the source store"}.`
            : confirmAction === "receive"
              ? `Transfer ${transfer.transferNumber} will be marked as COMPLETED and stock will be added to ${transfer.toStore?.name ?? "the destination store"}.`
              : isInTransit
                ? `Transfer ${transfer.transferNumber} will be cancelled and stock will be returned to ${transfer.fromStore?.name ?? "the source store"}.`
                : `Transfer ${transfer.transferNumber} will be cancelled.`
        }
        confirmLabel={
          confirmAction === "ship"
            ? "Ship"
            : confirmAction === "receive"
              ? "Receive"
              : "Cancel transfer"
        }
        variant={confirmAction === "cancel" ? "danger" : "warning"}
      />
    </>
  );
}
