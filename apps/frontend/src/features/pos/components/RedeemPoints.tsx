"use client";

import { useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface RedeemPointsProps {
  availablePoints: number;
  redeemRate: number; // dollars per point
  minRedeemPoints: number;
  grandTotal: number;
  applied: number; // currently-applied redeem points
  onApply: (points: number) => void;
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** POS loyalty-redemption control (3H.5). Shows available points + the max
 *  redeemable value (capped at the sale total) and applies a redemption; the
 *  server re-validates + values it. */
export function RedeemPoints({ availablePoints, redeemRate, minRedeemPoints, grandTotal, applied, onApply }: RedeemPointsProps) {
  const [points, setPoints] = useState("");

  // Max points that keep the value ≤ the sale total AND ≤ what the customer holds.
  const maxByTotal = redeemRate > 0 ? Math.floor(grandTotal / redeemRate) : availablePoints;
  const maxPoints = Math.min(availablePoints, maxByTotal);
  const maxValue = Math.min(availablePoints * redeemRate, grandTotal);

  const entered = Number(points) || 0;
  const canApply = useMemo(
    () => entered >= minRedeemPoints && entered <= maxPoints,
    [entered, minRedeemPoints, maxPoints],
  );

  if (availablePoints < minRedeemPoints) return null; // not enough to redeem

  return (
    <div className="space-y-1 rounded border border-slate-200 p-2 dark:border-slate-800">
      <div className="flex items-center gap-2 text-sm">
        <Gift className="h-4 w-4 text-slate-400" />
        <span className="text-slate-500">
          {availablePoints} pts · redeem up to {money(maxValue)}
        </span>
      </div>
      {applied > 0 ? (
        <p className="flex items-center justify-between text-xs">
          <span className="text-emerald-600">
            Redeeming {applied} pts (−{money(applied * redeemRate)})
          </span>
          <button className="text-slate-400 underline" onClick={() => onApply(0)}>
            remove
          </button>
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Points to redeem"
            type="number"
            placeholder={`min ${minRedeemPoints}`}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
          <Button size="sm" disabled={!canApply} onClick={() => onApply(entered)}>
            Redeem
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPoints(String(maxPoints))}>
            Max
          </Button>
        </div>
      )}
    </div>
  );
}
