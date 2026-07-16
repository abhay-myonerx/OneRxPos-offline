import { assertCloudAuthConfigured, cloudAuthConfig } from "../../config/cloud-auth.config";

import type { PortalApiEnvelope } from "../../types/cloud-auth/cloud-auth.types";

/* -------------------------------------------------------------------------- */
/* ERROR                                                                      */
/* -------------------------------------------------------------------------- */

export class CloudAuthApiError extends Error {
  readonly status: number;

  readonly payload: unknown;

  constructor(params: { message: string; status: number; payload: unknown }) {
    super(params.message);

    this.name = "CloudAuthApiError";

    this.status = params.status;

    this.payload = params.payload;
  }
}

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message;
  }

  if (typeof obj.error === "string" && obj.error.trim()) {
    return obj.error;
  }

  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>;

    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }

    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  }

  return null;
}

function parsePayload(body: string, contentType: string): unknown {
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

/* -------------------------------------------------------------------------- */
/* REQUEST                                                                     */
/* -------------------------------------------------------------------------- */

export async function cloudRequest<T>(path: string, init: RequestInit): Promise<T> {
  assertCloudAuthConfigured();

  if (typeof window === "undefined" || !window.rxPosCloudAuth) {
    throw new CloudAuthApiError({
      message: "Electron cloud bridge is unavailable.",
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

    source.forEach((v, k) => {
      headers[k] = v;
    });
  }

  console.log("[Cloud Request]", url);

  console.log(headers);

  console.log(init.body);

  const response = await window.rxPosCloudAuth.request({
    url,

    method: init.method ?? "GET",

    headers,

    body: typeof init.body === "string" ? init.body : undefined,
  });

  console.log("[Cloud Response]", response.status);

  console.log(response.body);

  const payload = parsePayload(response.body, response.headers["content-type"] ?? "");

  if (!response.ok) {
    throw new CloudAuthApiError({
      message: extractMessage(payload) ?? `HTTP ${response.status}`,
      status: response.status,
      payload,
    });
  }

  return payload as T;
}

/* -------------------------------------------------------------------------- */
/* ENVELOPE                                                                    */
/* -------------------------------------------------------------------------- */

export function unwrapCloudEnvelope<T>(response: PortalApiEnvelope<T>): T {
  if (!response.success) {
    throw new CloudAuthApiError({
      message: response.message ?? response.error ?? "Cloud request failed.",
      status: 400,
      payload: response,
    });
  }

  if (response.data === undefined) {
    throw new CloudAuthApiError({
      message: "Response data missing.",
      status: 500,
      payload: response,
    });
  }

  return response.data;
}
