"use client";

/**
 * Learn-a-label admin tool (Phase 1.3c, Barcode Layer 2 — C6).
 *
 * Lets an admin teach the till how to read an Rx / vendor label without a code
 * change: create/edit/delete `BarcodeTemplate`s (match rule + carve strategy +
 * tagged fields + rung-line pricing/tax) with a live "test a sample scan"
 * preview that runs the SAME pure `decodeBarcode` pipeline the POS uses.
 *
 * Reads are till-wide; writes are admin-gated server-side (403 for non-admins),
 * so no client role-gating is required here.
 */

import { useMemo, useState } from "react";
import { Barcode, Plus, Trash2, Save, X, Pencil, FlaskConical } from "lucide-react";
import type { TaxCategory } from "rx-pos-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { TAX_CATEGORY_OPTIONS } from "@/features/products/types/product.types";
import {
  useListBarcodeTemplatesQuery,
  useCreateBarcodeTemplateMutation,
  useUpdateBarcodeTemplateMutation,
  useDeleteBarcodeTemplateMutation,
  type BarcodeTemplateDto,
  type UpsertBarcodeTemplateInput,
} from "@/features/pos/barcode/barcode.api";
import { decodeBarcode } from "@/features/pos/barcode/decode";
import type {
  BarcodeTemplate,
  FieldKind,
  MatchType,
  Strategy,
  TemplateConfig,
  TemplateField,
} from "@/features/pos/barcode/types";
import { SectionTitle, SettingsCard, Divider, Toggle } from "./shared";

// Native <select> styled the repo's way (mirrors ManualItemModal) — kept as a
// plain control so the field-kind / match-type dropdowns stay keyboard- and
// test-friendly.
const SELECT_CLASS =
  "w-full h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400";

const FIELD_KIND_OPTIONS: { value: FieldKind; label: string }[] = [
  { value: "rxNumber", label: "Rx Number" },
  { value: "price", label: "Price" },
  { value: "patient", label: "Patient" },
  { value: "batch", label: "Batch" },
  { value: "expiry", label: "Expiry" },
  { value: "gtin", label: "GTIN" },
  { value: "text", label: "Text" },
];

const MATCH_TYPE_OPTIONS: { value: MatchType; label: string }[] = [
  { value: "prefix", label: "Starts with (prefix)" },
  { value: "regex", label: "Regex" },
  { value: "length", label: "Exact length" },
];

const STRATEGY_OPTIONS: { value: Strategy; label: string }[] = [
  { value: "delimited", label: "Delimited (split on a character)" },
  { value: "fixed", label: "Fixed positions (start + length)" },
  { value: "regex", label: "Regex (named capture groups)" },
];

const matchValueLabel = (t: MatchType): string =>
  t === "prefix" ? "Starts with" : t === "regex" ? "Regex" : "Exact length";

function matchSummary(t: BarcodeTemplateDto): string {
  switch (t.matchType) {
    case "prefix":
      return `starts with "${t.matchValue}"`;
    case "length":
      return `length ${t.matchValue}`;
    case "regex":
      return `regex ${t.matchValue}`;
  }
}

interface EditorState {
  /** null → creating a new template; a string id → editing an existing one. */
  editingId: string | null;
  name: string;
  isActive: boolean;
  matchType: MatchType;
  matchValue: string;
  strategy: Strategy;
  delimiter: string;
  pattern: string;
  fields: TemplateField[];
  priceDecimals: string;
  taxCategory: TaxCategory | "";
}

const BLANK_EDITOR: EditorState = {
  editingId: null,
  name: "",
  isActive: true,
  matchType: "prefix",
  matchValue: "",
  strategy: "delimited",
  delimiter: "|",
  pattern: "",
  fields: [],
  priceDecimals: "",
  taxCategory: "",
};

function editorFromTemplate(t: BarcodeTemplateDto): EditorState {
  return {
    editingId: t.id,
    name: t.name,
    isActive: t.isActive,
    matchType: t.matchType,
    matchValue: t.matchValue,
    strategy: t.strategy,
    delimiter: t.config.delimiter ?? "|",
    pattern: t.config.pattern ?? "",
    fields: t.config.fields.map((f) => ({ ...f })),
    priceDecimals: t.config.priceDecimals != null ? String(t.config.priceDecimals) : "",
    taxCategory: t.config.taxCategory ?? "",
  };
}

function buildConfig(e: EditorState): TemplateConfig {
  return {
    fields: e.fields,
    ...(e.priceDecimals.trim() !== "" ? { priceDecimals: Number(e.priceDecimals) } : {}),
    ...(e.taxCategory ? { taxCategory: e.taxCategory } : {}),
    ...(e.strategy === "delimited" ? { delimiter: e.delimiter } : {}),
    ...(e.strategy === "regex" ? { pattern: e.pattern } : {}),
  };
}

export function BarcodeLabelsTab() {
  const { data: templates = [], isLoading } = useListBarcodeTemplatesQuery();
  const [createTemplate, { isLoading: creating }] = useCreateBarcodeTemplateMutation();
  const [updateTemplate, { isLoading: updating }] = useUpdateBarcodeTemplateMutation();
  const [deleteTemplate] = useDeleteBarcodeTemplateMutation();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [sample, setSample] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const patch = (p: Partial<EditorState>) => setEditor((e) => (e ? { ...e, ...p } : e));

  const openCreate = () => {
    setSample("");
    setEditor({ ...BLANK_EDITOR });
  };
  const openEdit = (t: BarcodeTemplateDto) => {
    setSample("");
    setEditor(editorFromTemplate(t));
  };
  const closeEditor = () => setEditor(null);

  const addField = () =>
    patch({ fields: [...(editor?.fields ?? []), { name: "", kind: "text" }] });
  const updateField = (i: number, p: Partial<TemplateField>) =>
    patch({ fields: (editor?.fields ?? []).map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const removeField = (i: number) =>
    patch({ fields: (editor?.fields ?? []).filter((_, j) => j !== i) });

  // The draft the live-preview feeds to the pure pipeline. `isActive: true` so
  // the sample always matches while testing, regardless of the saved toggle.
  const draftTemplate = useMemo<BarcodeTemplate | null>(() => {
    if (!editor) return null;
    return {
      id: editor.editingId ?? "draft",
      name: editor.name,
      matchType: editor.matchType,
      matchValue: editor.matchValue,
      strategy: editor.strategy,
      config: buildConfig(editor),
      isActive: true,
    };
  }, [editor]);

  const decoded = useMemo(() => {
    if (!draftTemplate || sample.trim() === "") return null;
    return decodeBarcode(sample, { templates: [draftTemplate] });
  }, [draftTemplate, sample]);

  const handleSave = async () => {
    if (!editor) return;
    const input: UpsertBarcodeTemplateInput = {
      name: editor.name.trim(),
      matchType: editor.matchType,
      matchValue: editor.matchValue,
      strategy: editor.strategy,
      config: buildConfig(editor),
      isActive: editor.isActive,
    };
    try {
      if (editor.editingId) {
        await updateTemplate({ id: editor.editingId, ...input }).unwrap();
        showSuccess("Template updated");
      } else {
        await createTemplate(input).unwrap();
        showSuccess("Template created");
      }
      closeEditor();
    } catch (err) {
      showApiError(err);
    }
  };

  const handleToggleActive = async (t: BarcodeTemplateDto) => {
    try {
      await updateTemplate({ id: t.id, isActive: !t.isActive }).unwrap();
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate({ id }).unwrap();
      showSuccess("Template deleted");
      setConfirmDeleteId(null);
      if (editor?.editingId === id) closeEditor();
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      {/* ── Template list ─────────────────────────────────────────────── */}
      <SettingsCard>
        <SectionTitle
          icon={<Barcode className="h-[18px] w-[18px]" />}
          title="Barcode Labels"
          description="Teach the till to read Rx / vendor labels — no code change required"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openCreate}
              icon={<Plus className="h-4 w-4" />}
            >
              New Template
            </Button>
          }
        />
        <Divider className="mb-5" />

        {isLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
            Loading templates…
          </p>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="mx-auto h-14 w-14 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-800 flex items-center justify-center mb-4">
              <Barcode className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              No barcode label templates
            </p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">
              Create one to teach the till how to read a pharmacy or vendor label
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openCreate}
              icon={<Plus className="h-4 w-4" />}
            >
              Add First Template
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {templates.map((t) => (
              <div
                key={t.id}
                className="group flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {t.name || "Untitled template"}
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {matchSummary(t)} · {t.strategy}
                  </p>
                </div>
                <Toggle
                  label=""
                  checked={t.isActive}
                  onChange={() => handleToggleActive(t)}
                  compact
                />
                <button
                  type="button"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => openEdit(t)}
                  className="p-2 rounded-md text-slate-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-400/10 transition-colors shrink-0"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {confirmDeleteId === t.id ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="text-[12px] font-medium text-danger-600 hover:text-danger-700 px-2 py-1 rounded-md hover:bg-danger-50 transition-colors shrink-0"
                  >
                    Confirm?
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete ${t.name}`}
                    onClick={() => setConfirmDeleteId(t.id)}
                    className="p-2 rounded-md text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      {/* ── Editor ────────────────────────────────────────────────────── */}
      {editor && (
        <SettingsCard>
          <SectionTitle
            icon={<Pencil className="h-[18px] w-[18px]" />}
            title={editor.editingId ? "Edit Template" : "New Template"}
            description="Define when this label applies and how to carve out its fields"
            action={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={closeEditor}
                  icon={<X className="h-4 w-4" />}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={creating || updating}
                  onClick={handleSave}
                  icon={<Save className="h-4 w-4" />}
                >
                  Save
                </Button>
              </div>
            }
          />
          <Divider className="mb-5" />

          <div className="space-y-5">
            {/* Name + active */}
            <div className="flex items-end gap-4">
              <FormField label="Template Name" className="flex-1">
                <Input
                  aria-label="Template Name"
                  value={editor.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="e.g. Kroll Rx Label"
                />
              </FormField>
              <div className="pb-1">
                <Toggle
                  label="Active"
                  checked={editor.isActive}
                  onChange={(v) => patch({ isActive: v })}
                  compact
                />
              </div>
            </div>

            <Divider />

            {/* Match rule */}
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Match Rule
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Match Type">
                  <select
                    aria-label="Match Type"
                    className={SELECT_CLASS}
                    value={editor.matchType}
                    onChange={(e) => patch({ matchType: e.target.value as MatchType })}
                  >
                    {MATCH_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label={matchValueLabel(editor.matchType)}>
                  <Input
                    aria-label="Match Value"
                    value={editor.matchValue}
                    onChange={(e) => patch({ matchValue: e.target.value })}
                    placeholder={
                      editor.matchType === "length"
                        ? "e.g. 20"
                        : editor.matchType === "regex"
                          ? "^RX\\d+"
                          : "e.g. RX"
                    }
                  />
                </FormField>
              </div>
            </div>

            <Divider />

            {/* Strategy */}
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Carve Strategy
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Strategy">
                  <select
                    aria-label="Strategy"
                    className={SELECT_CLASS}
                    value={editor.strategy}
                    onChange={(e) => patch({ strategy: e.target.value as Strategy })}
                  >
                    {STRATEGY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
                {editor.strategy === "delimited" && (
                  <FormField label="Delimiter">
                    <Input
                      aria-label="Delimiter"
                      value={editor.delimiter}
                      onChange={(e) => patch({ delimiter: e.target.value })}
                      placeholder="|"
                    />
                  </FormField>
                )}
                {editor.strategy === "regex" && (
                  <FormField label="Pattern (named groups)">
                    <Input
                      aria-label="Pattern"
                      value={editor.pattern}
                      onChange={(e) => patch({ pattern: e.target.value })}
                      placeholder="^(?<rx>\\d+)-(?<amt>\\d+)$"
                    />
                  </FormField>
                )}
              </div>
            </div>

            <Divider />

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Fields
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addField}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Add Field
                </Button>
              </div>

              {editor.fields.length === 0 ? (
                <p className="text-[13px] text-slate-500 dark:text-slate-400 py-3">
                  No fields yet — add one to tag part of the label (Rx#, price, patient…).
                </p>
              ) : (
                <div className="space-y-2.5">
                  {editor.fields.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-end gap-2 p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800"
                    >
                      <FormField label="Name" className="flex-1">
                        <Input
                          aria-label={`Field ${i + 1} name`}
                          value={f.name}
                          onChange={(e) => updateField(i, { name: e.target.value })}
                          placeholder="rx"
                        />
                      </FormField>
                      <FormField label="Kind" className="w-32">
                        <select
                          aria-label={`Field ${i + 1} kind`}
                          className={SELECT_CLASS}
                          value={f.kind}
                          onChange={(e) => updateField(i, { kind: e.target.value as FieldKind })}
                        >
                          {FIELD_KIND_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </FormField>

                      {/* Locator inputs depend on the strategy */}
                      {editor.strategy === "delimited" && (
                        <FormField label="Index" className="w-20">
                          <Input
                            aria-label={`Field ${i + 1} index`}
                            type="number"
                            min={0}
                            value={f.index ?? ""}
                            onChange={(e) =>
                              updateField(i, {
                                index: e.target.value === "" ? undefined : Number(e.target.value),
                              })
                            }
                          />
                        </FormField>
                      )}
                      {editor.strategy === "fixed" && (
                        <>
                          <FormField label="Start" className="w-20">
                            <Input
                              aria-label={`Field ${i + 1} start`}
                              type="number"
                              min={0}
                              value={f.start ?? ""}
                              onChange={(e) =>
                                updateField(i, {
                                  start:
                                    e.target.value === "" ? undefined : Number(e.target.value),
                                })
                              }
                            />
                          </FormField>
                          <FormField label="Length" className="w-20">
                            <Input
                              aria-label={`Field ${i + 1} length`}
                              type="number"
                              min={0}
                              value={f.length ?? ""}
                              onChange={(e) =>
                                updateField(i, {
                                  length:
                                    e.target.value === "" ? undefined : Number(e.target.value),
                                })
                              }
                            />
                          </FormField>
                        </>
                      )}
                      {editor.strategy === "regex" && (
                        <FormField label="Group" className="w-24">
                          <Input
                            aria-label={`Field ${i + 1} group`}
                            value={f.group ?? ""}
                            onChange={(e) => updateField(i, { group: e.target.value })}
                            placeholder="rx"
                          />
                        </FormField>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove field ${i + 1}`}
                        onClick={() => removeField(i)}
                        className="p-2 mb-0.5 rounded-md text-slate-400 hover:text-danger-600 hover:bg-danger-50 transition-colors shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Rung line: price decimals + tax */}
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Rung Line
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Price Decimals">
                  <Input
                    aria-label="Price Decimals"
                    type="number"
                    min={0}
                    value={editor.priceDecimals}
                    onChange={(e) => patch({ priceDecimals: e.target.value })}
                    placeholder="e.g. 2 (1240 → 12.40)"
                  />
                </FormField>
                <FormField label="Tax Category">
                  <select
                    aria-label="Tax Category"
                    className={SELECT_CLASS}
                    value={editor.taxCategory}
                    onChange={(e) => patch({ taxCategory: e.target.value as TaxCategory | "" })}
                  >
                    <option value="">— None —</option>
                    {TAX_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
            </div>

            <Divider />

            {/* Test panel */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="h-4 w-4 text-primary-600" />
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Test a Sample Scan
                </p>
              </div>
              <FormField label="Sample label">
                <Input
                  aria-label="Sample label"
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                  placeholder="Paste or scan a sample label string…"
                  className="font-mono"
                />
              </FormField>

              {decoded && (
                <div
                  data-testid="decode-preview"
                  className="mt-3 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 font-mono text-xs text-slate-700 dark:text-slate-200"
                >
                  <p className="mb-1.5">
                    <span className="text-slate-400">kind:</span>{" "}
                    <span className="font-medium">{decoded.kind}</span>
                  </p>
                  {decoded.kind === "rx" ? (
                    <dl className="space-y-0.5">
                      {decoded.fields.rxNumber && (
                        <PreviewRow label="Rx #" value={decoded.fields.rxNumber} />
                      )}
                      {decoded.fields.patient && (
                        <PreviewRow label="Patient" value={decoded.fields.patient} />
                      )}
                      {typeof decoded.fields.price === "number" && (
                        <PreviewRow label="Price" value={decoded.fields.price.toFixed(2)} />
                      )}
                      {decoded.fields.batch && (
                        <PreviewRow label="Batch" value={decoded.fields.batch} />
                      )}
                      {decoded.fields.expiry && (
                        <PreviewRow label="Expiry" value={decoded.fields.expiry} />
                      )}
                      {decoded.fields.gtin && (
                        <PreviewRow label="GTIN" value={decoded.fields.gtin} />
                      )}
                      {decoded.fields.text &&
                        Object.entries(decoded.fields.text).map(([k, v]) => (
                          <PreviewRow key={k} label={k} value={v} />
                        ))}
                    </dl>
                  ) : decoded.kind === "unknown" ? (
                    <p className="text-slate-500 dark:text-slate-400">
                      No template matched — would fall back to manual entry.
                    </p>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400">
                      Matched a built-in format ({decoded.kind}), not this template.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-400 min-w-[64px]">{label}:</dt>
      <dd className="font-medium text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}
