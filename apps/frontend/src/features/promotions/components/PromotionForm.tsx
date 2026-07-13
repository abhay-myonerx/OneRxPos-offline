"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form/form-field";
import type { CreatePromotionInput, PromotionType } from "../types/promotion.types";
import { PROMOTION_TYPE_LABELS } from "../types/promotion.types";

export interface PromotionFormProps {
  onSubmit: (input: CreatePromotionInput) => void;
  submitting?: boolean;
}

const TYPES: PromotionType[] = ["PERCENT_OFF", "FIXED_OFF", "BOGO", "BUNDLE", "VOLUME_TIER", "GROUP", "COUPON"];

/** Admin form for a promotion; the config fields switch by `type`. Emits a
 *  CreatePromotionInput (with a type-shaped `config`). Kept intentionally
 *  simple: array configs (bundle products, tiers) use compact text inputs. */
export function PromotionForm({ onSubmit, submitting }: PromotionFormProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PromotionType>("PERCENT_OFF");
  const [stackable, setStackable] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  // per-type fields
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [buyProductId, setBuyProductId] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [getQty, setGetQty] = useState("");
  const [getPercent, setGetPercent] = useState("100");
  const [bundleProductIds, setBundleProductIds] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [tiers, setTiers] = useState(""); // "minQty:percent, ..."
  const [couponMode, setCouponMode] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("");

  const buildConfig = (): Record<string, unknown> => {
    switch (type) {
      case "PERCENT_OFF":
        return { percent: Number(percent) };
      case "FIXED_OFF":
        return { amount: Number(amount) };
      case "GROUP":
        return { percent: Number(percent) };
      case "BOGO":
        return { buyProductId, buyQty: Number(buyQty), getQty: Number(getQty), getPercent: Number(getPercent) };
      case "BUNDLE":
        return { productIds: bundleProductIds.split(",").map((s) => s.trim()).filter(Boolean), bundlePrice: Number(bundlePrice) };
      case "VOLUME_TIER":
        return {
          tiers: tiers
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => {
              const [minQty, pct] = t.split(":");
              return { minQty: Number(minQty), percent: Number(pct) };
            }),
        };
      case "COUPON":
        return { mode: couponMode, value: Number(couponValue) };
      default:
        return {};
    }
  };

  const submit = () => {
    onSubmit({
      name,
      type,
      stackable,
      config: buildConfig(),
      couponCode: type === "COUPON" ? couponCode : undefined,
    });
  };

  return (
    <div className="space-y-3">
      <FormField label="Name">
        <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>

      <FormField label="Type">
        <select
          aria-label="Type"
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value as PromotionType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {PROMOTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      {(type === "PERCENT_OFF" || type === "GROUP") && (
        <FormField label="Percent off">
          <Input aria-label="Percent" type="number" value={percent} onChange={(e) => setPercent(e.target.value)} />
        </FormField>
      )}
      {type === "FIXED_OFF" && (
        <FormField label="Amount off">
          <Input aria-label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
      )}
      {type === "BOGO" && (
        <>
          <FormField label="Buy product ID">
            <Input aria-label="Buy product" value={buyProductId} onChange={(e) => setBuyProductId(e.target.value)} />
          </FormField>
          <FormField label="Buy qty">
            <Input aria-label="Buy qty" type="number" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
          </FormField>
          <FormField label="Get qty">
            <Input aria-label="Get qty" type="number" value={getQty} onChange={(e) => setGetQty(e.target.value)} />
          </FormField>
          <FormField label="Get % off (100 = free)">
            <Input aria-label="Get percent" type="number" value={getPercent} onChange={(e) => setGetPercent(e.target.value)} />
          </FormField>
        </>
      )}
      {type === "BUNDLE" && (
        <>
          <FormField label="Product IDs (comma-separated)">
            <Input aria-label="Bundle products" value={bundleProductIds} onChange={(e) => setBundleProductIds(e.target.value)} />
          </FormField>
          <FormField label="Bundle price">
            <Input aria-label="Bundle price" type="number" value={bundlePrice} onChange={(e) => setBundlePrice(e.target.value)} />
          </FormField>
        </>
      )}
      {type === "VOLUME_TIER" && (
        <FormField label="Tiers (minQty:percent, comma-separated)">
          <Input aria-label="Tiers" value={tiers} onChange={(e) => setTiers(e.target.value)} placeholder="5:5, 10:10" />
        </FormField>
      )}
      {type === "COUPON" && (
        <>
          <FormField label="Coupon code">
            <Input aria-label="Coupon code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} />
          </FormField>
          <FormField label="Mode">
            <select
              aria-label="Coupon mode"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={couponMode}
              onChange={(e) => setCouponMode(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </FormField>
          <FormField label="Value">
            <Input aria-label="Coupon value" type="number" value={couponValue} onChange={(e) => setCouponValue(e.target.value)} />
          </FormField>
        </>
      )}

      <Checkbox label="Stackable with other promotions" checked={stackable} onChange={(e) => setStackable(e.target.checked)} />

      <Button onClick={submit} disabled={submitting || !name}>
        Save promotion
      </Button>
    </div>
  );
}
