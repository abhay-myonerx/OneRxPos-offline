import { env } from "@/shell/env";

const v1 = env.apiUrl;

export const HR_V2_ROOT = v1.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/hr";
