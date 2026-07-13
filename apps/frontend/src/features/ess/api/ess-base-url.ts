// The shared RTK Query baseUrl points at `/api/v1`, but ESS endpoints
// live under `/api/v2/me/*`. Compute the v2 root once and prefix each
// ESS query with an absolute URL so the v1 base doesn't leak in.

import { env } from "@/shell/env";

const v1 = env.apiUrl;

export const ESS_ROOT = v1.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/me";
