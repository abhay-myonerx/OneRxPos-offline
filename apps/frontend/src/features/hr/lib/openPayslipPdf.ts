import { TokenManager } from "@/lib/api/token-manager";
import { env } from "@/shell/env";

const v1Base = env.apiUrl;
const apiRoot = v1Base.replace(/\/api\/v\d+\/?$/, "/api");

type Scope = "admin" | "ess";

function urlFor(payslipId: string, scope: Scope): string {
  if (scope === "ess") {
    return `${apiRoot}/v2/me/payslips/${payslipId}/pdf`;
  }
  return `${apiRoot}/v2/hr/payroll/payslips/${payslipId}/pdf`;
}

/**
 * Fetches the printable HTML for a payslip and opens it in a new
 * tab as a Blob URL so the browser's print dialog can take over.
 *
 * On failure the function rejects — callers should wrap with the
 * usual `showApiError` toast.
 */
export async function openPayslipPdf(payslipId: string, scope: Scope): Promise<void> {
  const token = TokenManager.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const res = await fetch(urlFor(payslipId, scope), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  if (!res.ok) {
    // The HTML endpoint shouldn't return JSON errors, but if the
    // gateway 4xx-s before reaching the handler, surface that.
    const text = await res.text();
    throw new Error(text || `Failed to download payslip (${res.status})`);
  }
  const html = await res.text();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const newWindow = window.open(url, "_blank");
  if (!newWindow) {
    URL.revokeObjectURL(url);
    throw new Error("Browser blocked the popup — allow pop-ups for this site and try again.");
  }
  // Free the Blob URL after a short delay — the new tab has it
  // loaded by then. (Some browsers garbage-collect untimely if we
  // revoke immediately.)
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
