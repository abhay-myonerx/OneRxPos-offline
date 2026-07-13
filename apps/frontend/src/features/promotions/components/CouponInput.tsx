"use client";

import { useState } from "react";
import { Ticket, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useValidateCouponMutation } from "../api/promotions.api";
import type { CouponValidationResult } from "../types/promotion.types";

export interface CouponInputProps {
  items?: { productId: string; quantity: number; unitPrice: number; variantId?: string | null; discount?: number }[];
  customerId?: string | null;
  /** Called with the accepted code (or null when cleared) so the till threads it
   *  into checkout, where the server applies it authoritatively. */
  onApplied: (code: string | null) => void;
}

/** Till coupon entry (3H.4). Validates a code against the cart via the server;
 *  on success reports the code up so checkout carries it. */
export function CouponInput({ items, customerId, onApplied }: CouponInputProps) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CouponValidationResult | null>(null);
  const [validate, { isLoading }] = useValidateCouponMutation();

  const apply = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const res = await validate({ code: trimmed, items, customerId }).unwrap();
      setResult(res);
      onApplied(res.valid ? trimmed : null);
    } catch {
      setResult({ valid: false, reason: "Could not validate coupon" });
      onApplied(null);
    }
  };

  const clear = () => {
    setCode("");
    setResult(null);
    onApplied(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-slate-400" />
        <Input aria-label="Coupon code" placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button size="sm" onClick={apply} disabled={isLoading || !code.trim()}>
          Apply
        </Button>
        {result && (
          <Button size="sm" variant="ghost" onClick={clear} aria-label="Clear coupon">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {result?.valid && (
        <p className="flex items-center gap-1 text-xs text-emerald-600">
          <Check className="h-3 w-3" /> {result.name} applied (−{result.discount})
        </p>
      )}
      {result && !result.valid && <p className="text-xs text-red-500">{result.reason ?? "Coupon not applicable"}</p>}
    </div>
  );
}
