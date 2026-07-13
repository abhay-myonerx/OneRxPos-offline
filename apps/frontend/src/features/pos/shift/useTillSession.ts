"use client";

import { useCallback } from "react";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useCurrentShiftQuery,
  useOpenShiftMutation,
  useCloseShiftMutation,
  useRecordCashMovementMutation,
  useLazyShiftSummaryQuery,
  type ShiftDto,
} from "./shift.api";
import type { DenominationCounts } from "./helpers/denominations";

/**
 * Till-session (cashier shift) state + actions (Phase 1.4). Fetches the caller's
 * open shift for the active store and exposes open / close / paid-in-out. Used by
 * `useRingUp` for the open-till gate + the `shiftId` on checkout, and by
 * `TillStatusBar` for the UI.
 */
export function useTillSession(storeId: string | null) {
  const { data: shift, isLoading } = useCurrentShiftQuery(
    { storeId: storeId ?? "" },
    { skip: !storeId },
  );
  const [openShift, { isLoading: opening }] = useOpenShiftMutation();
  const [closeShift, { isLoading: closing }] = useCloseShiftMutation();
  const [recordCashMovement] = useRecordCashMovementMutation();
  const [fetchSummary] = useLazyShiftSummaryQuery();

  const isOpen = !!shift && !shift.closedAt;
  const shiftId = isOpen ? shift!.id : null;

  const open = useCallback(
    async (openingCounts: DenominationCounts) => {
      if (!storeId) return;
      try {
        await openShift({ storeId, openingCounts }).unwrap();
        showSuccess("Till opened");
      } catch (e) {
        showApiError(e);
        throw e;
      }
    },
    [storeId, openShift],
  );

  const close = useCallback(
    async (closingCounts: DenominationCounts): Promise<ShiftDto | null> => {
      if (!shiftId) return null;
      try {
        const closed = await closeShift({ id: shiftId, closingCounts }).unwrap();
        showSuccess("Till closed");
        return closed;
      } catch (e) {
        showApiError(e);
        throw e;
      }
    },
    [shiftId, closeShift],
  );

  const paidInOut = useCallback(
    async (type: "PAID_IN" | "PAID_OUT", amount: number, reason?: string) => {
      if (!shiftId) return;
      try {
        await recordCashMovement({ id: shiftId, type, amount, reason }).unwrap();
        showSuccess(type === "PAID_IN" ? "Cash paid in" : "Cash paid out");
      } catch (e) {
        showApiError(e);
        throw e;
      }
    },
    [shiftId, recordCashMovement],
  );

  return {
    shift: isOpen ? shift! : null,
    shiftId,
    isOpen,
    isLoading,
    opening,
    closing,
    open,
    close,
    paidInOut,
    fetchSummary,
  };
}

export type TillSession = ReturnType<typeof useTillSession>;
