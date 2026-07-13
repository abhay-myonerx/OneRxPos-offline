import { logger } from "../shared/utils/logger";
import type { LicenseStatusResponse } from "@/licensing/status";
import type { LicenseStatusValue } from "@/licensing/guard";

// Thin orchestration so it is unit-testable with injected deps. The BullMQ
// processor + server scheduler wire the real client/db/config around this.
export async function runLicenseValidation(deps: {
  validate: (now: number) => Promise<{ ok: boolean }>;
  readStatus: () => LicenseStatusResponse;
  now: number;
}): Promise<LicenseStatusValue> {
  const res = await deps.validate(deps.now);
  const status = deps.readStatus().status;
  logger.info({ validated: res.ok, status }, "license: daily validation ran");
  return status;
}
