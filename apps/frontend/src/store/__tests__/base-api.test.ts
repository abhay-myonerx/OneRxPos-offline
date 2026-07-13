// Tests for `baseQueryWithReauth`'s public-auth-endpoint exemption.
//
// Regression coverage for the pos-auth PIN-pad login bug: `pos-auth.api.ts`
// builds ABSOLUTE URLs (it computes its own v2 root rather than relying on
// `baseApi`'s baseUrl — see that file's header comment), so a 401 from
// `pin-login`/`enroll`/`pin`/`override` must be recognized as "public auth"
// (bad credentials, not session expiry) the same way a relative
// `/auth/login` 401 already is — otherwise a wrong PIN triggers a spurious
// global refresh -> redirect-to-/login cycle instead of letting the PIN pad
// show its own error.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "../base-api";

type FetchMock = ReturnType<typeof vi.fn<(input: string | Request, init?: RequestInit) => Promise<Response>>>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });
}

// Mirrors how `pos-auth.api.ts` injects endpoints: absolute URLs, computed
// independently of `baseApi`'s relative baseUrl.
const testApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    absolutePinLogin: build.mutation<unknown, void>({
      query: () => ({ url: "http://localhost:4001/api/v2/pos/pin-login", method: "POST" }),
    }),
    absoluteEnroll: build.mutation<unknown, void>({
      query: () => ({ url: "http://localhost:4001/api/v2/pos/enroll", method: "POST" }),
    }),
    absoluteOverride: build.mutation<unknown, void>({
      query: () => ({ url: "http://localhost:4001/api/v2/pos/override", method: "POST" }),
    }),
    // Control: a normal protected v1 endpoint, absolute, NOT in the
    // exemption list — a 401 here must still trigger the refresh flow.
    absoluteProtected: build.mutation<unknown, void>({
      query: () => ({ url: "http://localhost:4001/api/v1/sales", method: "POST" }),
    }),
  }),
});

describe("baseQueryWithReauth — public pos-auth exemption", () => {
  let authExpiredSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authExpiredSpy = vi.fn();
    window.addEventListener("auth:expired", authExpiredSpy as EventListener);
  });

  afterEach(() => {
    window.removeEventListener("auth:expired", authExpiredSpy as EventListener);
  });

  it("treats a 401 from an ABSOLUTE pos-auth pin-login URL as public — no refresh attempt, no auth:expired", async () => {
    const fetchMock: FetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(401, { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid PIN" } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const store = buildStore();
    const result = await store.dispatch(testApi.endpoints.absolutePinLogin.initiate());

    expect("error" in result && result.error).toMatchObject({ status: 401 });
    // Exactly one call: the pin-login request itself. No second call to
    // `/auth/refresh` — that would indicate the reauth branch fired.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it("treats a 401/423 from ABSOLUTE enroll and override URLs as public too", async () => {
    const fetchMock: FetchMock = vi.fn(() => Promise.resolve(jsonResponse(401, { success: false, error: { code: "AUTHENTICATION_ERROR" } })));
    vi.stubGlobal("fetch", fetchMock);

    const store = buildStore();
    await store.dispatch(testApi.endpoints.absoluteEnroll.initiate());
    await store.dispatch(testApi.endpoints.absoluteOverride.initiate());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authExpiredSpy).not.toHaveBeenCalled();
  });

  it("still treats a 401 from a non-exempt ABSOLUTE protected endpoint as session expiry (refresh attempted)", async () => {
    const fetchMock: FetchMock = vi.fn(() => Promise.resolve(jsonResponse(401, { success: false, error: { code: "AUTHENTICATION_ERROR" } })));
    vi.stubGlobal("fetch", fetchMock);

    const store = buildStore();
    await store.dispatch(testApi.endpoints.absoluteProtected.initiate());

    // 1st call = the request itself, 2nd call = the `/auth/refresh` attempt
    // triggered by the (non-exempt) 401 — proving the exemption is scoped
    // to pos-auth paths, not "any absolute URL".
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = fetchMock.mock.calls[1];
    const secondCallArg = secondCall?.[0];
    const secondCallUrl =
      typeof secondCallArg === "string" ? secondCallArg : secondCallArg?.url;
    expect(secondCallUrl).toEqual(expect.stringContaining("/auth/refresh"));
  });
});
