"use client";

import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form/form-field";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/store/hooks";
import { useGetEssProfileQuery, useUpdateEssProfileMutation } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import type { EssProfile, UpdateEssProfileInput } from "@/features/ess/types/ess.types";

const EMPTY: UpdateEssProfileInput = {
  phone: "",
  alternatePhone: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  emergencyContact: null,
  photo: "",
};

function toForm(p: EssProfile): UpdateEssProfileInput {
  return {
    phone: p.phone ?? "",
    alternatePhone: p.alternatePhone ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    postalCode: p.postalCode ?? "",
    country: p.country ?? "",
    emergencyContact: p.emergencyContact ?? null,
    photo: p.photo ?? "",
  };
}

export default function EssProfilePage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.profile.read");
  const canEdit = canAny("ess.profile.update");

  const authPreferences = useAppSelector((s) => s.auth.user?.preferences);

  const { data, isLoading, isError, error } = useGetEssProfileQuery(undefined, {
    skip: !canRead,
  });
  const [update, updateState] = useUpdateEssProfileMutation();

  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateEssProfileInput>(EMPTY);
  if (data && data.id !== loadedId) {
    setLoadedId(data.id);
    setForm({
      ...toForm(data),
      preferences: authPreferences
        ? {
            languagePreference: authPreferences.languagePreference as string | undefined,
            themePreference: authPreferences.themePreference as
              "light" | "dark" | "system" | undefined,
          }
        : undefined,
    });
  }

  function set<K extends keyof UpdateEssProfileInput>(key: K, value: UpdateEssProfileInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setEc<K extends keyof NonNullable<UpdateEssProfileInput["emergencyContact"]>>(
    key: K,
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      emergencyContact: {
        ...(prev.emergencyContact ?? {}),
        [key]: value || null,
      },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: UpdateEssProfileInput = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" && v === "" ? null : v]),
    ) as UpdateEssProfileInput;
    try {
      await update(payload).unwrap();
      showSuccess("Profile updated");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <EssStateGate
      isLoading={isLoading}
      isError={isError}
      error={error}
      data={data}
      permissionDenied={!canRead}
      missingPermission="ess.profile.read"
      isEmpty={() => false}
    >
      {(p) => (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
              My Profile
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Update your contact details. Identity and employment fields are read-only — contact HR
              for changes.
            </p>
          </div>

          {/* Read-only card */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Read-only — managed by HR
              </h2>
            </div>
            <div className="p-4">
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                <ReadOnlyRow label="Employee code" value={p.employeeCode} />
                <ReadOnlyRow
                  label="Name"
                  value={`${p.firstName}${p.middleName ? " " + p.middleName : ""} ${p.lastName}`}
                />
                <ReadOnlyRow label="Email" value={p.email} />
                <ReadOnlyRow label="Department" value={p.department?.name} />
                <ReadOnlyRow label="Designation" value={p.designation?.title} />
                <ReadOnlyRow label="Employment status" value={p.employmentStatus} />
                <ReadOnlyRow
                  label="Reports to"
                  value={p.reportsTo ? `${p.reportsTo.firstName} ${p.reportsTo.lastName}` : "—"}
                />
                <ReadOnlyRow
                  label="Started"
                  value={
                    p.employmentStartDate
                      ? new Date(p.employmentStartDate).toLocaleDateString()
                      : "—"
                  }
                />
              </dl>
            </div>
          </Card>

          <form onSubmit={handleSubmit}>
            <Card className="overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Contact details
                </h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Phone">
                    <Input
                      value={form.phone ?? ""}
                      onChange={(e) => set("phone", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="Alternate phone">
                    <Input
                      value={form.alternatePhone ?? ""}
                      onChange={(e) => set("alternatePhone", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="Address" className="sm:col-span-2">
                    <Textarea
                      rows={2}
                      value={form.address ?? ""}
                      onChange={(e) => set("address", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="City">
                    <Input
                      value={form.city ?? ""}
                      onChange={(e) => set("city", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="State/Region">
                    <Input
                      value={form.state ?? ""}
                      onChange={(e) => set("state", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="Postal code">
                    <Input
                      value={form.postalCode ?? ""}
                      onChange={(e) => set("postalCode", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="Country">
                    <Input
                      value={form.country ?? ""}
                      onChange={(e) => set("country", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                  <FormField label="Photo URL" className="sm:col-span-2">
                    <Input
                      value={form.photo ?? ""}
                      onChange={(e) => set("photo", e.target.value)}
                      disabled={!canEdit}
                    />
                  </FormField>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
                    Emergency contact
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Name">
                      <Input
                        value={form.emergencyContact?.name ?? ""}
                        onChange={(e) => setEc("name", e.target.value)}
                        disabled={!canEdit}
                      />
                    </FormField>
                    <FormField label="Relationship">
                      <Input
                        value={form.emergencyContact?.relationship ?? ""}
                        onChange={(e) => setEc("relationship", e.target.value)}
                        disabled={!canEdit}
                      />
                    </FormField>
                    <FormField label="Phone">
                      <Input
                        value={form.emergencyContact?.phone ?? ""}
                        onChange={(e) => setEc("phone", e.target.value)}
                        disabled={!canEdit}
                      />
                    </FormField>
                    <FormField label="Email">
                      <Input
                        value={form.emergencyContact?.email ?? ""}
                        onChange={(e) => setEc("email", e.target.value)}
                        disabled={!canEdit}
                      />
                    </FormField>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                    Preferences
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Saved to your account so they follow you across devices.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Theme">
                      <Select
                        value={(form.preferences?.themePreference as string) ?? ""}
                        onValueChange={(v) =>
                          setForm((s) => ({
                            ...s,
                            preferences: {
                              ...(s.preferences ?? {}),
                              themePreference: (v as "light" | "dark" | "system") || undefined,
                            },
                          }))
                        }
                        placeholder="(use tenant default)"
                        options={[
                          { value: "light", label: "Light" },
                          { value: "dark", label: "Dark" },
                          { value: "system", label: "Match system" },
                        ]}
                        disabled={!canEdit}
                      />
                    </FormField>
                    <FormField label="Language" hint="ISO code (e.g. en, en-US, bn-BD).">
                      <Input
                        value={(form.preferences?.languagePreference as string) ?? ""}
                        onChange={(e) =>
                          setForm((s) => ({
                            ...s,
                            preferences: {
                              ...(s.preferences ?? {}),
                              languagePreference: e.target.value || undefined,
                            },
                          }))
                        }
                        placeholder="en"
                        disabled={!canEdit}
                      />
                    </FormField>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    type="submit"
                    disabled={!canEdit || updateState.isLoading}
                    loading={updateState.isLoading}
                  >
                    Save changes
                  </Button>
                </div>
              </div>
            </Card>
          </form>
        </div>
      )}
    </EssStateGate>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-900 dark:text-slate-100 mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}
