/**
 * Shared RTK Query client: JSON base URL, `Authorization` header, refresh on 401,
 * and global tag types for cache invalidation across feature slices.
 */
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryApi, FetchArgs } from "@reduxjs/toolkit/query";
import { TokenManager } from "@/lib/api/token-manager";
import { env } from "@/shell/env";

const baseUrl = env.apiUrl;

const rawBaseQuery = fetchBaseQuery({
  baseUrl,
  credentials: "include",
  prepareHeaders: (headers) => {
    const token = TokenManager.getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    headers.set("content-type", "application/json");
    return headers;
  },
});

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(api: BaseQueryApi, extraOptions: object): Promise<boolean> {
  // Snapshot the access token before the async refresh call.
  // If the user re-authenticates (new login) while this refresh is in-flight,
  // we must not wipe their new token when the stale refresh eventually fails.
  const tokenSnapshot = TokenManager.getAccessToken();

  const refreshResult = await rawBaseQuery(
    { url: "/auth/refresh", method: "POST" },
    api,
    extraOptions,
  );
  if (refreshResult.data) {
    const data = (refreshResult.data as { data: { accessToken: string } }).data;
    TokenManager.setAccessToken(data.accessToken);
    return true;
  }
  // Only wipe tokens if no concurrent login has set a fresh access token.
  if (TokenManager.getAccessToken() === tokenSnapshot) {
    TokenManager.clearAll();
  }
  return false;
}

function dispatchAuthExpiredEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth:expired"));
    setTimeout(() => {
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }, 100);
  }
}

/**
 * Login/register/logout return 401 for bad credentials or a missing cookie,
 * not for expired sessions. Skipping refresh for these URLs avoids a
 * misleading "session expired" toast and prevents a spurious refresh-and-retry
 * cycle when the user explicitly logs out with an already-expired access token.
 *
 * Also covers the `/api/v2/pos/*` auth-establishing endpoints (pin-login,
 * enroll, pin, override) used by the PIN-pad quick-login flow. Unlike every
 * other slice, `pos-auth.api.ts` builds ABSOLUTE URLs (it computes its own
 * v2 root rather than relying on `baseApi`'s baseUrl — see that file), so a
 * plain `url.startsWith(p)` check against a relative path never matches
 * them. A wrong-PIN 401 (or a locked-out 423) must be returned as-is to the
 * component, never treated as a session expiry that triggers a global
 * refresh/redirect/logout.
 */
const PUBLIC_AUTH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/api/v2/pos/pin-login",
  "/api/v2/pos/enroll",
  "/api/v2/pos/pin",
  "/api/v2/pos/override",
];

function isPublicAuthRequest(args: string | FetchArgs): boolean {
  const url = typeof args === "string" ? args : args.url;
  // `url` may be relative ("/auth/login") or absolute
  // ("http://host/api/v2/pos/pin-login" — pos-auth.api.ts builds its own
  // absolute root). Compare against the URL's PATHNAME so both forms match
  // the same way, rather than a brittle prefix/concatenation check.
  let pathname = url;
  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    // Malformed URL string — fall back to the raw value below.
  }
  return PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.endsWith(p));
}

const baseQueryWithReauth = async (
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 429) {
    return result;
  }

  // 401 on public auth endpoints = bad credentials, not session expiry.
  // Return immediately so the calling page (login/register) shows the
  // backend's actual error message without a spurious "session expired".
  if (result.error?.status === 401 && isPublicAuthRequest(args)) {
    return result;
  }

  // Other 401s: try refresh cookie (JWT in memory may be empty after reload).
  if (result.error?.status === 401) {
    if (!refreshPromise) {
      refreshPromise = doRefresh(api, extraOptions).finally(() => {
        refreshPromise = null;
      });
    }
    const ok = await refreshPromise;

    if (ok) {
      result = await rawBaseQuery(args, api, extraOptions);
    } else {
      // Only fire the session-expired event if the user hasn't re-authenticated
      // while this refresh was in-flight. A concurrent login sets a new access
      // token; if that token is present we must not kick them out again.
      if (!TokenManager.getAccessToken()) {
        dispatchAuthExpiredEvent();
      }
    }
  }

  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "Auth",
    "Tenant",
    "Store",
    "User",
    "Product",
    "Category",
    "Brand",
    "Inventory",
    "Customer",
    "Sale",
    "Payment",
    "Supplier",
    "Levy",
    "Purchase",
    "Promotion",
    "Expense",
    "Report",
    "Settings",
    "Receipt",
    "HrDepartment",
    "HrDesignation",
    "HrEmployee",
    "Attendance",
    "AttendanceCorrection",
    "HrWorkShift",
    "HrShiftSchedule",
    "HrShiftSwap",
    "HrLeaveType",
    "HrLeavePolicy",
    "HrLeaveBalance",
    "HrLeaveRequest",
    "HrHoliday",
    "PayrollStructure",
    "PayrollComponent",
    "PayrollEmployeeSalary",
    "PayrollRun",
    "PayrollPayslip",
    "PayrollAdvance",
    "EssProfile",
    "Notification",
    "BarcodeTemplate",
    "DeviceProfile",
    "CashierShift",
    "Narcotic",
  ],
  endpoints: () => ({}),
});
