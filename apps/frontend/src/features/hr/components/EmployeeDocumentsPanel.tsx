// Employee document vault — lists, uploads, and soft-deletes HR documents.
//
// Three distinct permissions gate each action independently:
//   hr.employees.documents.read   — see the list
//   hr.employees.documents.upload — add a new record
//   hr.employees.documents.delete — remove (soft-delete, audit trail kept)
//
// This panel does NOT host the file itself — files live in Cloudinary / S3.
// Only the metadata (URL, type, expiry, confidentiality flag) is stored here.
// The `isConfidential` flag hides a document from the employee's own ESS view.
"use client";

import { useState } from "react";
import { FileText, Plus, Trash2, ExternalLink, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form/form-field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useDeleteEmployeeDocumentMutation,
  useListEmployeeDocumentsQuery,
  useUploadEmployeeDocumentMutation,
} from "@/features/hr/api/employees.api";
import type { EmployeeDocument, UploadDocumentInput } from "@/features/hr/types/hr.types";

const DOCUMENT_TYPES = [
  "NATIONAL_ID",
  "PASSPORT",
  "DRIVING_LICENSE",
  "CONTRACT",
  "OFFER_LETTER",
  "RESUME",
  "DIPLOMA",
  "TRAINING_CERT",
  "MEDICAL",
  "BACKGROUND_CHECK",
  "VISA",
  "WORK_PERMIT",
  "REFERENCE_LETTER",
  "OTHER",
];

interface Props {
  employeeId: string;
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : "—";
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  // 30-day warning window — covers common document validity windows (visas, medical certs).
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function PanelShell({
  children,
  action,
  description,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  description?: string;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 text-slate-400 dark:text-slate-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Documents</h3>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function EmployeeDocumentsPanel({ employeeId }: Props) {
  const { can } = usePermissions();
  const canRead = can("hr.employees.documents.read");
  const canUpload = can("hr.employees.documents.upload");
  const canDelete = can("hr.employees.documents.delete");

  const { data, isLoading, isError, refetch } = useListEmployeeDocumentsQuery(
    { id: employeeId, limit: 100 },
    { skip: !canRead },
  );

  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EmployeeDocument | null>(null);

  const [deleteDocument, { isLoading: deleting }] = useDeleteEmployeeDocumentMutation();

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteDocument({
        id: employeeId,
        docId: confirmDelete.id,
      }).unwrap();
      showSuccess("Document deleted");
      setConfirmDelete(null);
    } catch (err) {
      showApiError(err);
    }
  }

  if (!canRead) {
    return (
      <PanelShell description="Restricted to roles with hr.employees.documents.read.">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You don&apos;t have access to this employee&apos;s documents.
        </p>
      </PanelShell>
    );
  }

  if (isLoading) {
    return (
      <PanelShell>
        <Loading />
      </PanelShell>
    );
  }
  if (isError) {
    return (
      <PanelShell>
        <ErrorDisplay message="Failed to load documents" onRetry={() => refetch()} />
      </PanelShell>
    );
  }

  const documents: EmployeeDocument[] = data?.data ?? [];

  return (
    <PanelShell
      description="Files live in Cloudinary / S3; only the URL is stored here."
      action={
        canUpload && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUploadOpen(true)}
            icon={<Plus className="h-4 w-4" />}
          >
            Add document
          </Button>
        )
      }
    >
      {documents.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No documents on file.
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                    {d.documentType}
                  </code>
                  <strong className="truncate text-sm text-slate-800 dark:text-slate-100">
                    {d.fileName}
                  </strong>
                  {d.isConfidential && <Badge variant="warning">Confidential</Badge>}
                  {isExpired(d.expiresAt) && <Badge variant="danger">Expired</Badge>}
                  {isExpiringSoon(d.expiresAt) && <Badge variant="warning">Expires soon</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Uploaded {fmtDate(d.createdAt)}
                  {d.expiresAt ? ` · Expires ${fmtDate(d.expiresAt)}` : ""}
                  {d.sizeBytes ? ` · ${formatSize(d.sizeBytes)}` : ""}
                </p>
                {d.notes && (
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{d.notes}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Open"
                >
                  <ExternalLink className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </a>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(d)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-danger-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-danger-500" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <UploadDocumentModal
          employeeId={employeeId}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete document?"
        description={
          confirmDelete
            ? `"${confirmDelete.fileName}" will be soft-deleted (audit trail preserved).`
            : ""
        }
        confirmLabel="Delete"
        variant="warning"
        loading={deleting}
      />
    </PanelShell>
  );
}

function UploadDocumentModal({
  employeeId,
  open,
  onClose,
}: {
  employeeId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<UploadDocumentInput>({
    documentType: "CONTRACT",
    fileName: "",
    fileUrl: "",
    isConfidential: false,
  });

  const [upload, { isLoading }] = useUploadEmployeeDocumentMutation();

  function patch(p: Partial<UploadDocumentInput>) {
    setForm((s) => ({ ...s, ...p }));
  }

  async function handleSave() {
    if (!form.fileName || !form.fileUrl) return;
    try {
      await upload({ id: employeeId, data: form }).unwrap();
      showSuccess("Document uploaded");
      setForm({
        documentType: "CONTRACT",
        fileName: "",
        fileUrl: "",
        isConfidential: false,
      });
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add document"
      description="Upload your file to Cloudinary or S3 first, then paste the URL here."
      size="md"
      primaryAction={{
        label: "Save",
        onClick: handleSave,
        loading: isLoading,
        disabled: !form.fileName || !form.fileUrl,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-md border border-warning-200 dark:border-warning-500/30 bg-warning-50 dark:bg-warning-500/15 p-3 text-xs text-warning-800 dark:text-warning-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            Mark documents like medical or disciplinary records as <strong>Confidential</strong> —
            these are hidden from ESS so employees can&apos;t see them on their own documents page.
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Document type" required>
            <Select
              value={form.documentType}
              onValueChange={(v) => patch({ documentType: v as string })}
              options={DOCUMENT_TYPES.map((t) => ({
                value: t,
                label: t.replace(/_/g, " "),
              }))}
            />
          </FormField>
          <FormField label="File name" required>
            <Input
              value={form.fileName}
              onChange={(e) => patch({ fileName: e.target.value })}
              placeholder="e.g. contract-2026.pdf"
            />
          </FormField>
        </div>
        <FormField label="File URL" required hint="Cloudinary / S3 URL.">
          <Input
            type="url"
            value={form.fileUrl}
            onChange={(e) => patch({ fileUrl: e.target.value })}
            placeholder="https://res.cloudinary.com/…"
          />
        </FormField>
        <FormField label="Expires at" hint="Optional — drives expiry alerts.">
          <Input
            type="date"
            value={form.expiresAt ?? ""}
            onChange={(e) => patch({ expiresAt: e.target.value || null })}
          />
        </FormField>
        <Checkbox
          label="Confidential (hidden from ESS)"
          checked={form.isConfidential ?? false}
          onChange={(e) => patch({ isConfidential: e.target.checked })}
        />
        <FormField label="Notes">
          <Textarea
            value={form.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value || null })}
            rows={2}
          />
        </FormField>
      </div>
    </Modal>
  );
}
