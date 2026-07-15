import { assertCloudAuthConfigured, cloudAuthConfig } from "../../config/cloud-auth.config";

import type { PortalApiEnvelope } from "../../types/cloud-auth/cloud-auth.types";

// -----------------------------------------------------------------------------
// ERROR
// -----------------------------------------------------------------------------

export class CloudAuthApiError extends Error {
  readonly status: number;

  readonly payload: unknown;

  constructor(params: {
    message: string;

    status: number;

    payload: unknown;
  }) {
    super(params.message);

    this.name = "CloudAuthApiError";

    this.status = params.status;

    this.payload = params.payload;
  }
}

// -----------------------------------------------------------------------------
// ERROR MESSAGE
// -----------------------------------------------------------------------------

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if (typeof value.message === "string" && value.message.trim()) {
    return value.message;
  }

  if (typeof value.error === "string" && value.error.trim()) {
    return value.error;
  }

  const data = value.data;

  if (data && typeof data === "object") {
    const dataValue = data as Record<string, unknown>;

    if (typeof dataValue.message === "string" && dataValue.message.trim()) {
      return dataValue.message;
    }

    if (typeof dataValue.error === "string" && dataValue.error.trim()) {
      return dataValue.error;
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// RESPONSE PAYLOAD
// -----------------------------------------------------------------------------

function parseResponsePayload(
  body: string,

  contentType: string,
): unknown {
  if (!body) {
    return null;
  }

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// -----------------------------------------------------------------------------
// REQUEST
// -----------------------------------------------------------------------------

export async function cloudRequest<T>(
  path: string,

  init: RequestInit,
): Promise<T> {
  assertCloudAuthConfigured();

  if (typeof window === "undefined" || !window.rxPosCloudAuth) {
    throw new CloudAuthApiError({
      message: "RX POS desktop cloud transport is unavailable.",

      status: 0,

      payload: null,
    });
  }

  const url = `${cloudAuthConfig.apiUrl}${path}`;

  const headers: Record<string, string> = {
    accept: "application/json",

    "content-type": "application/json",
  };

  if (init.headers) {
    const source = new Headers(init.headers);

    source.forEach((value, key) => {
      headers[key] = value;
    });
  }

  let response;

  try {
    response = await window.rxPosCloudAuth.request({
      url,

      method: init.method ?? "GET",

      headers,

      body: typeof init.body === "string" ? init.body : undefined,
    });
  } catch (error) {
    throw new CloudAuthApiError({
      message:
        error instanceof Error && error.message
          ? error.message
          : "Unable to connect to OneRx cloud. Check your internet connection.",

      status: 0,

      payload: null,
    });
  }

  const contentType = response.headers["content-type"] ?? "";

  const payload = parseResponsePayload(
    response.body,

    contentType,
  );

  if (!response.ok) {
    throw new CloudAuthApiError({
      message:
        extractErrorMessage(payload) ??
        `OneRx cloud request failed with status ${response.status}.`,

      status: response.status,

      payload,
    });
  }

  return payload as T;
}

// -----------------------------------------------------------------------------
// ENVELOPE
// -----------------------------------------------------------------------------

export function unwrapCloudEnvelope<T>(response: PortalApiEnvelope<T>): T {
  if (response.success === false) {
    throw new CloudAuthApiError({
      message: response.message || response.error || "OneRx cloud request failed.",

      status: 400,

      payload: response,
    });
  }

  if (response.data === undefined) {
    throw new CloudAuthApiError({
      message: "OneRx cloud returned no response data.",

      status: 500,

      payload: response,
    });
  }

  return response.data;
}
