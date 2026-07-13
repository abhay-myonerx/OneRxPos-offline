"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useListStoresQuery } from "@/features/stores/api/stores.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { useEnrollDeviceMutation, getLaneFingerprint } from "../api/pos-auth.api";
import type { EnrolledDevice } from "../types/pos-auth.types";

export interface EnrollScreenProps {
  /** Called after a successful enrollment (e.g. to route into the PIN-pad lane). */
  onEnrolled?: (device: EnrolledDevice) => void;
}

/**
 * Device-enrollment screen (Phase 1.1, Task 12) — shown once, after a
 * manager's full email/password login, to bind this physical lane to a
 * store. Resolves the lane fingerprint via `getLaneFingerprint` (Task 11)
 * and calls `enrollDevice`.
 */
export function EnrollScreen({ onEnrolled }: EnrollScreenProps) {
  const { t } = useTranslation("pos");
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");

  const { data: stores, isLoading: storesLoading } = useListStoresQuery({
    isActive: true,
    limit: 100,
  });
  const [enrollDevice, { isLoading: enrolling }] = useEnrollDeviceMutation();

  const storeOptions = (stores ?? []).map((s) => ({ value: s.id, label: s.name }));

  const handleEnroll = async () => {
    if (!storeId) return;
    try {
      const fingerprint = await getLaneFingerprint();
      const device = await enrollDevice({
        storeId,
        fingerprint,
        ...(name.trim() ? { name: name.trim() } : {}),
      }).unwrap();
      showSuccess(t("posAuth.enroll.success"));
      onEnrolled?.(device);
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{t("posAuth.enroll.title")}</CardTitle>
      </CardHeader>

      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 -mt-2">
        {t("posAuth.enroll.subtitle")}
      </p>

      <div className="space-y-4">
        <Select
          label={t("posAuth.enroll.storeLabel")}
          placeholder={t("posAuth.enroll.storePlaceholder")}
          options={storeOptions}
          value={storeId}
          onValueChange={(v) => setStoreId(v as string)}
          disabled={storesLoading}
        />

        <Input
          label={t("posAuth.enroll.nameLabel")}
          placeholder={t("posAuth.enroll.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
        />

        <Button
          type="button"
          fullWidth
          disabled={!storeId}
          loading={enrolling}
          leftIcon={<ShieldCheck className="h-4 w-4" />}
          onClick={() => void handleEnroll()}
        >
          {enrolling ? t("posAuth.enroll.submitting") : t("posAuth.enroll.submit")}
        </Button>
      </div>
    </Card>
  );
}
