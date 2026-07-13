// Holiday management — create, edit, deactivate individual holidays and bulk-import
// country presets for a given year.
//
// The `isRecurring` flag means the holiday recurs on the same calendar date each
// year (e.g. New Year's Day).  Non-recurring holidays must be manually re-entered
// per year (e.g. a moveable religious feast).
//
// Import preset: the backend seeds a predefined list of public holidays for the
// chosen country + year, skipping dates that already exist.  The result modal
// reports `created` vs. `skipped` counts so the operator can verify idempotency.
"use client";

import { useState } from "react";
import { Link } from "@/shell/nav";
import { Archive, CalendarDays, Download, Edit, Globe, Plus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import {
  useListHolidaysQuery,
  useCreateHolidayMutation,
  useUpdateHolidayMutation,
  useDeactivateHolidayMutation,
  useImportHolidayPresetMutation,
} from "@/features/hr/api/holidays.api";
import type {
  CreateHolidayInput,
  Holiday,
  HolidayCountryCode,
  HolidayImportPresetResult,
} from "@/features/hr/types/leave.types";
import {
  HOLIDAY_COUNTRY_CODES,
  HOLIDAY_TYPE_LABELS,
  HOLIDAY_TYPES,
} from "@/features/hr/types/leave.types";

const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT_YEAR = new Date().getFullYear();

const EMPTY: CreateHolidayInput = {
  name: "",
  date: TODAY,
  type: "PUBLIC",
  isRecurring: true,
  countryCode: null,
  storeId: null,
};

export default function HolidayManagementPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.holidays.read", "hr.holidays.manage", "ess.holidays.read");
  const canManage = can("hr.holidays.manage");

  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState<CreateHolidayInput>(EMPTY);

  const [pendingDeactivate, setPendingDeactivate] = useState<Holiday | null>(null);

  const [presetOpen, setPresetOpen] = useState(false);
  const [presetCountry, setPresetCountry] = useState<HolidayCountryCode>("US");
  const [presetYear, setPresetYear] = useState<number>(CURRENT_YEAR);
  const [presetResult, setPresetResult] = useState<HolidayImportPresetResult | null>(null);

  const { data, isLoading, isError, refetch } = useListHolidaysQuery(
    {
      year,
      search: search.trim() || undefined,
      ...(showInactive ? {} : { isActive: true }),
    },
    { skip: !canRead },
  );

  const [create, { isLoading: creating }] = useCreateHolidayMutation();
  const [update, { isLoading: updating }] = useUpdateHolidayMutation();
  const [deactivate, { isLoading: deactivating }] = useDeactivateHolidayMutation();
  const [importPreset, { isLoading: importing }] = useImportHolidayPresetMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view holidays."
        missingPermission="hr.holidays.read"
      />
    );
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  function openEdit(h: Holiday) {
    setEditing(h);
    setForm({
      name: h.name,
      date: h.date.slice(0, 10),
      type: h.type,
      isRecurring: h.isRecurring,
      countryCode: h.countryCode,
      storeId: h.storeId,
    });
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await update({ id: editing.id, data: form }).unwrap();
        showSuccess("Holiday updated");
      } else {
        await create(form).unwrap();
        showSuccess("Holiday created");
      }
      setFormOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleDeactivate() {
    if (!pendingDeactivate) return;
    try {
      await deactivate(pendingDeactivate.id).unwrap();
      showSuccess("Holiday deactivated");
      setPendingDeactivate(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleImportPreset() {
    try {
      const result = await importPreset({
        countryCode: presetCountry,
        year: presetYear,
      }).unwrap();
      setPresetResult(result);
      showSuccess(`Imported ${result.created} holidays (${result.skipped} skipped)`);
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Holiday Management"
        description="Public, religious, and company holidays. These inform leave calculations and the calendar."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" icon={<CalendarDays className="h-4 w-4" />}>
              <Link href={ROUTES.HR_HOLIDAYS_CALENDAR}>Calendar view</Link>
            </Button>
            {canManage && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPresetResult(null);
                    setPresetOpen(true);
                  }}
                  icon={<Download className="h-4 w-4" />}
                >
                  Import preset
                </Button>
                <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                  Add holiday
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:flex-1"
          />
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2020}
            max={2100}
            className="w-28"
          />
          <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Include inactive
          </label>
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load holidays." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No holidays found"
          message={
            canManage
              ? `No holidays for ${year}. Import a preset or add one manually.`
              : `No holidays are configured for ${year}.`
          }
          icon={<Globe className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                Add holiday
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500 dark:text-slate-400">
                <th className="pb-3 pr-4 font-medium">Date</th>
                <th className="pb-3 pr-4 font-medium">Name</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Country</th>
                <th className="pb-3 pr-4 font-medium">Recurring</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                {canManage && <th className="pb-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 pr-4 font-mono text-slate-700 dark:text-slate-200">
                    {h.date.slice(0, 10)}
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                    {h.name}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{HOLIDAY_TYPE_LABELS[h.type]}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                    {h.countryCode ?? "—"}
                  </td>
                  <td className="py-3 pr-4">{h.isRecurring ? "Yes" : "No"}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={h.isActive ? "success" : "outline"}>
                      {h.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="py-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(h)}
                          icon={<Edit className="h-4 w-4" />}
                        >
                          Edit
                        </Button>
                        {h.isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDeactivate(h)}
                            icon={<Archive className="h-4 w-4" />}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit holiday" : "Add holiday"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={200}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Date" required>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Type">
              <Select
                value={form.type ?? "PUBLIC"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    type: v as CreateHolidayInput["type"],
                  })
                }
                options={HOLIDAY_TYPES.map((t) => ({
                  value: t,
                  label: HOLIDAY_TYPE_LABELS[t],
                }))}
              />
            </FormField>
            <FormField label="Country code">
              <Input
                value={form.countryCode ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    countryCode: e.target.value.toUpperCase() || null,
                  })
                }
                placeholder="e.g. US"
                maxLength={10}
              />
            </FormField>
          </div>
          <Checkbox
            label="Recurring (repeats every year)"
            checked={form.isRecurring ?? true}
            onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
          />
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editing ? "Save changes" : "Add holiday"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <ConfirmDialog
        open={!!pendingDeactivate}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Deactivate this holiday?"
        description={
          pendingDeactivate
            ? `"${pendingDeactivate.name}" (${pendingDeactivate.date.slice(0, 10)}) will be excluded from leave calculations. You can reactivate it from the list.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivating}
      />

      {/* Import preset modal */}
      <Modal
        open={presetOpen}
        onClose={() => {
          setPresetOpen(false);
          setPresetResult(null);
        }}
        title="Import holiday preset"
      >
        <div className="space-y-4">
          {presetResult ? (
            <div className="rounded-md border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/15 p-4 text-sm text-green-800 dark:text-green-300">
              <p className="font-semibold mb-1">Import complete</p>
              <p>
                <strong>{presetResult.created}</strong> holidays created,{" "}
                <strong>{presetResult.skipped}</strong> already existed and were skipped.
              </p>
              <p className="text-xs text-green-600 dark:text-green-300 mt-2">
                Country: {presetResult.countryCode} · Year: {presetResult.year}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Import a static preset of public holidays for a country and year. Re-running the same
              country + year is safe — duplicates are skipped automatically.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Country">
              <Select
                value={presetCountry}
                onValueChange={(v) => setPresetCountry(v as HolidayCountryCode)}
                searchable
                options={HOLIDAY_COUNTRY_CODES.map((c) => ({
                  value: c,
                  label: c,
                }))}
              />
            </FormField>
            <FormField label="Year">
              <Input
                type="number"
                value={presetYear}
                onChange={(e) => setPresetYear(Number(e.target.value))}
                min={2020}
                max={2100}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setPresetOpen(false);
                setPresetResult(null);
              }}
            >
              {presetResult ? "Close" : "Cancel"}
            </Button>
            {!presetResult && (
              <Button
                onClick={handleImportPreset}
                loading={importing}
                icon={<Download className="h-4 w-4" />}
              >
                Import {presetCountry} {presetYear}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
