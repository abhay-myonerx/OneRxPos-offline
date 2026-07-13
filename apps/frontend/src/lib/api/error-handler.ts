import { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import toast from "react-hot-toast";
import { store } from "@/store";

interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface ParsedError {
  code: string;
  message: string;
  status?: number;
  retryAfterSec?: number;
  isRateLimit: boolean;
  /** True only when a previously-authenticated session has expired. */
  isSessionExpired: boolean;
  details?: unknown;
}

function asFetchError(err: unknown): FetchBaseQueryError | null {
  if (typeof err === "object" && err !== null && "status" in err) {
    return err as FetchBaseQueryError;
  }
  return null;
}

function asApiBody(err: FetchBaseQueryError): ApiErrorBody | null {
  if (!("data" in err)) return null;
  const raw = err.data as Record<string, unknown> | undefined;
  if (!raw) return null;
  if (raw.error && typeof raw.error === "object") {
    const e = raw.error as Record<string, unknown>;
    if (typeof e.code === "string" && typeof e.message === "string")
      return raw as unknown as ApiErrorBody;
  }
  if (typeof raw.code === "string" && typeof raw.message === "string") {
    return {
      success: false,
      error: { code: raw.code, message: raw.message },
    };
  }

  return null;
}

function extractRetryAfter(body: ApiErrorBody | null): number | undefined {
  if (!body) return undefined;
  const details = body.error.details as Record<string, unknown> | undefined;
  if (!details) return undefined;
  const raw = details.retryAfter ?? details.retry_after ?? details.seconds;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Is there an authenticated user in the Redux store right now? */
function isUserCurrentlyAuthenticated(): boolean {
  try {
    const state = store.getState() as { auth?: { isAuthenticated?: boolean } };
    return state.auth?.isAuthenticated === true;
  } catch {
    return false;
  }
}

export function parseApiError(err: unknown): ParsedError {
  const fetchErr = asFetchError(err);
  const status = typeof fetchErr?.status === "number" ? fetchErr.status : undefined;

  const body = fetchErr ? asApiBody(fetchErr) : null;

  const code = body?.error.code ?? "UNKNOWN";
  const message = body?.error.message ?? "An unexpected error occurred";
  const details = body?.error.details;

  const isRateLimit =
    status === 429 || code === "RATE_LIMIT_EXCEEDED" || code === "AUTH_RATE_LIMIT_EXCEEDED";

  // Only treat 401 as session expiration if the user WAS logged in.
  // 401 during login/register = "wrong credentials", NOT session expired.
  const isSessionExpired = status === 401 && isUserCurrentlyAuthenticated();

  const retryAfterSec = isRateLimit ? extractRetryAfter(body) : undefined;

  return {
    code,
    message,
    status,
    retryAfterSec,
    isRateLimit,
    isSessionExpired,
    details,
  };
}

export function getErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}

export function showApiError(error: unknown): void {
  const parsed = parseApiError(error);

  if (parsed.code === "DEMO_RESTRICTED") {
    toast("This action is disabled in demo mode", {
      id: "demo-restricted",
      icon: "🔒",
      duration: 3000,
    });
    return;
  }

  // Rate limit wins — show cooldown with minutes when we can.
  if (parsed.isRateLimit) {
    let suffix = " Please slow down.";
    if (parsed.retryAfterSec && parsed.retryAfterSec > 0) {
      const mins = Math.ceil(parsed.retryAfterSec / 60);
      suffix = mins >= 1 ? ` Try again in ${mins} min.` : ` Try again in ${parsed.retryAfterSec}s.`;
    }
    toast.error(parsed.message + suffix, {
      id: "rate-limit", // de-dupe rapid-fire toasts
      duration: 6000,
    });
    return;
  }

  // Only show "session expired" for REAL session expirations.
  if (parsed.isSessionExpired) {
    toast.error("Your session has expired. Please log in again.", {
      id: "auth-expired",
    });
    return;
  }

  toast.error(parsed.message);
}

export function showSuccess(msg: string): void {
  toast.success(msg);
}
