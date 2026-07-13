"use client";

import { useState } from "react";
import { Lock, Unlock, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency/format-money";
import type { TillSession } from "../useTillSession";
import { OpenTillModal } from "./OpenTillModal";
import { CloseTillModal } from "./CloseTillModal";
import { CashMovementModal } from "./CashMovementModal";

export interface TillStatusBarProps {
  session: TillSession;
  disabled?: boolean;
}

/**
 * Till status + controls (Phase 1.4). Closed → "Open till"; open → shows the
 * opening float + open-since and offers Cash in/out and Close. Owns its modals.
 */
export function TillStatusBar({ session, disabled }: TillStatusBarProps) {
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [cashModal, setCashModal] = useState(false);

  const { isOpen, shift } = session;

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm">
        {isOpen ? (
          <>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <Unlock className="h-4 w-4" /> Till open
            </span>
            {shift && (
              <span className="text-slate-500 dark:text-slate-400">
                float {formatMoney(shift.openingCash)} · since{" "}
                {new Date(shift.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCashModal(true)} className="text-xs h-7">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Cash in/out
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCloseModal(true)} className="text-xs h-7">
                <Lock className="h-3.5 w-3.5" /> Close till
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
              <Lock className="h-4 w-4" /> Till closed
            </span>
            <div className="ml-auto">
              <Button size="sm" onClick={() => setOpenModal(true)} disabled={disabled} className="text-xs h-7">
                <Unlock className="h-3.5 w-3.5" /> Open till
              </Button>
            </div>
          </>
        )}
      </div>

      <OpenTillModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        onOpenTill={session.open}
        loading={session.opening}
      />
      <CloseTillModal open={closeModal} onClose={() => setCloseModal(false)} session={session} />
      <CashMovementModal
        open={cashModal}
        onClose={() => setCashModal(false)}
        onSubmit={session.paidInOut}
      />
    </>
  );
}
