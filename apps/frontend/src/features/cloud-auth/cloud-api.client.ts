import {
  assertCloudAuthConfigured,
  cloudAuthConfig,
} from "../../config/cloud-auth.config";

import type {
  PortalApiEnvelope,
} from "../../types/cloud-auth/cloud-auth.types";

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

function extractErrorMessage(
  payload: unknown,
): string | null {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const value =
    payload as Record<string, unknown>;

  if (
    typeof value.message === "string" &&
    value.message.trim()
  ) {
    return value.message;
  }

  if (
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error;
  }

  const data = value.data;

  if (
    data &&
    typeof data === "object"
  ) {
    const dataValue =
      data as Record<string, unknown>;

    if (
      typeof dataValue.message === "string" &&
      dataValue.message.trim()
    ) {
      return dataValue.message;
    }

    if (
      typeof dataValue.error === "string" &&
      dataValue.error.trim()
    ) {
      return dataValue.error;
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// RESPONSE PAYLOAD
// -----------------------------------------------------------------------------

async function readResponsePayload(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/json")
  ) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();

  return text || null;
}

// -----------------------------------------------------------------------------
// REQUEST
// -----------------------------------------------------------------------------

export async function cloudRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  assertCloudAuthConfigured();

  let response: Response;

  try {
    response = await fetch(
      `${cloudAuthConfig.apiUrl}${path}`,
      {
        ...init,

        headers: {
          accept: "application/json",

          "content-type": "application/json",

          ...init.headers,
        },
      },
    );
  } catch {
    throw new CloudAuthApiError({
      message:
        "Unable to connect to OneRx cloud. " +
        "Check your internet connection.",

      status: 0,

      payload: null,
    });
  }

  const payload =
    await readResponsePayload(response);

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

export function unwrapCloudEnvelope<T>(
  response: PortalApiEnvelope<T>,
): T {
  if (response.success === false) {
    throw new CloudAuthApiError({
      message:
        response.message ||
        response.error ||
        "OneRx cloud request failed.",

      status: 400,

      payload: response,
    });
  }

  if (response.data === undefined) {
    throw new CloudAuthApiError({
      message:
        "OneRx cloud returned no response data.",

      status: 500,

      payload: response,
    });
  }

  return response.data;
}