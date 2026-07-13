import { parseApiError } from "@/lib/api/error-handler";

export interface EssErrorView {
  code: string;
  status?: number;
  title: string;
  detail: string;
  /** True if this is the no-linked-employee 409 — show "contact HR" CTA. */
  isNoLinkedEmployee: boolean;
  /** True if this is the read-only-for-terminated 403. */
  isEmploymentInactive: boolean;
}

const FRIENDLY_TITLES: Record<string, string> = {
  NO_LINKED_EMPLOYEE: "Your account is not linked to an employee profile",
  EMPLOYMENT_INACTIVE: "This action is not available",
  INSUFFICIENT_BALANCE: "Not enough leave balance",
  REGULARIZATION_WINDOW_EXCEEDED: "Correction window has passed",
};

const FRIENDLY_DETAILS: Record<string, string> = {
  NO_LINKED_EMPLOYEE:
    "Please ask your HR team to link your user account to an employee profile so you can use self-service.",
  EMPLOYMENT_INACTIVE:
    "Your employment status no longer allows this action. You can still view your historical records below.",
  INSUFFICIENT_BALANCE:
    "You don't have enough leave balance for this request. Try a shorter range or contact HR.",
  REGULARIZATION_WINDOW_EXCEEDED:
    "Attendance corrections must be requested within 7 days. For older entries, please contact HR.",
};

export function parseEssError(err: unknown): EssErrorView {
  const parsed = parseApiError(err);
  const code = parsed.code;
  const title = FRIENDLY_TITLES[code] ?? parsed.message;
  const detail = FRIENDLY_DETAILS[code] ?? parsed.message;
  return {
    code,
    status: parsed.status,
    title,
    detail,
    isNoLinkedEmployee: code === "NO_LINKED_EMPLOYEE",
    isEmploymentInactive: code === "EMPLOYMENT_INACTIVE",
  };
}
