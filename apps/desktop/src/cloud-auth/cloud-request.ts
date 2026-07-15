type CloudRequestPayload = {
  url: string;

  method: string;

  headers?: Record<string, string>;

  body?: string;
};

export type CloudRequestResponse = {
  ok: boolean;

  status: number;

  statusText: string;

  headers: Record<string, string>;

  body: string;
};

const ALLOWED_CLOUD_ORIGINS = new Set(["https://portal-api.myonerx.com"]);

function assertAllowedCloudUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid OneRx cloud URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("OneRx cloud requests must use HTTPS.");
  }

  if (!ALLOWED_CLOUD_ORIGINS.has(url.origin)) {
    throw new Error("OneRx cloud host is not allowed.");
  }

  return url;
}

function normalizeMethod(value: string): string {
  const method = value.trim().toUpperCase();

  const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

  if (!allowedMethods.has(method)) {
    throw new Error("Cloud request method is not allowed.");
  }

  return method;
}

function normalizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers ?? {})) {
    const name = key.toLowerCase();

    if (
      name === "host" ||
      name === "origin" ||
      name === "referer" ||
      name === "cookie" ||
      name === "content-length"
    ) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

export async function performCloudRequest(
  payload: CloudRequestPayload,
): Promise<CloudRequestResponse> {
  const url = assertAllowedCloudUrl(payload.url);

  const method = normalizeMethod(payload.method);

  const headers = normalizeHeaders(payload.headers);

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method,

      headers,

      body: method === "GET" ? undefined : payload.body,

      redirect: "error",
    });
  } catch (error) {
    console.error("[cloud-auth] cloud request failed", {
      origin: url.origin,

      pathname: url.pathname,

      method,

      error: error instanceof Error ? error.message : String(error),
    });

    throw new Error("Unable to connect to OneRx cloud.");
  }

  const responseHeaders: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const body = await response.text();

  console.log("[cloud-auth] cloud response", {
    pathname: url.pathname,

    method,

    status: response.status,
  });

  return {
    ok: response.ok,

    status: response.status,

    statusText: response.statusText,

    headers: responseHeaders,

    body,
  };
}
