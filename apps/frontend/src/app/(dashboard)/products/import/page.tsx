"use client";

import { PageHeader } from "@/components/ui/container";
import { ImportWizard } from "@/features/import/components/ImportWizard";

export default function CatalogImportPage() {
  return (
    <>
      <PageHeader
        title="Import catalog"
        description="Upload a CSV/XLSX of products or a vendor price-list"
      />
      <ImportWizard />
    </>
  );
}
