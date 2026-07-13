"use client";

import { format, parseISO } from "date-fns";
import { FileText, Download } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/usePermissions";
import { useListEssDocumentsQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";

export default function EssDocumentsPage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.documents.read");

  const { data, isLoading, isError, error } = useListEssDocumentsQuery(undefined, {
    skip: !canRead,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Documents
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your HR documents. Confidential documents are not shown here.
        </p>
      </div>

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        permissionDenied={!canRead}
        missingPermission="ess.documents.read"
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No documents"
        emptyMessage="You don't have any documents on file yet."
      >
        {(d) => (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.data.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {doc.fileName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline">{doc.documentType}</Badge>
                        {doc.expiresAt && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            expires {format(parseISO(doc.expiresAt), "dd MMM yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-primary-200"
                    aria-label={`Download ${doc.fileName}`}
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </EssStateGate>
    </div>
  );
}
