import { Job } from "bullmq";
import { prisma, createTenantClient } from "../config/database";
import { logger } from "../shared/utils/logger";
import { getSalesReport } from "../modules/report/salesReport.service";
import { getProfitReport } from "../modules/report/profitReport.service";
import { getStockReport } from "../modules/report/stockReport.service";
import type { ReportJobData } from "../config/queue";

/**
 * Async report generation.
 *
 * Used for heavy reports that would time out on a normal HTTP request.
 * The frontend polls for completion or receives a WebSocket notification.
 *
 * Flow:
 *   1. Frontend requests report → API enqueues this job → returns jobId
 *   2. Worker generates report data
 *   3. Stores result (could be S3/Minio for PDF, or cache for JSON)
 *   4. Notifies requestor via WebSocket or stores for polling
 */
export async function processReportGeneration(job: Job<ReportJobData>): Promise<void> {
  const { tenantId, storeId, type, dateFrom, dateTo, requestedBy } = job.data;

  logger.info({ tenantId, type, dateFrom, dateTo, requestedBy }, "Report generation started");

  const db = createTenantClient(tenantId);
  const query = {
    storeId,
    dateFrom: new Date(dateFrom),
    dateTo: new Date(dateTo),
    groupBy: "day" as const,
  };

  let _reportData: unknown;

  switch (type) {
    case "sales":
      _reportData = await getSalesReport(db, query);
      break;
    case "profit":
      _reportData = await getProfitReport(db, query);
      break;
    case "stock":
      _reportData = await getStockReport(db, { storeId });
      break;
    case "cashier":
      _reportData = await (
        await import("../modules/report/cashierReport.service")
      ).getCashierReport(db, { dateFrom: query.dateFrom, dateTo: query.dateTo, storeId });
      break;
    default:
      throw new Error(`Unknown report type: ${type}`);
  }

  // Persist the report result in audit log for retrieval
  // In production, you'd upload a PDF to S3 and store the URL
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: requestedBy,
      action: "report.generated",
      entityType: "report",
      entityId: job.id ?? "unknown",
      newData: {
        type,
        dateFrom,
        dateTo,
        storeId,
        generatedAt: new Date().toISOString(),
        // In production: pdfUrl, csvUrl, etc.
      },
    },
  });

  logger.info({ tenantId, type, jobId: job.id }, "Report generation completed");

  // TODO: Notify the requestor via WebSocket
  // await wsNotify(requestedBy, { type: "report_ready", reportType: type, jobId: job.id });
}
