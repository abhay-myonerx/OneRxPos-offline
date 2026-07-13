// Emitted by the `moduleEnabled` middleware when
// the tenant has explicitly toggled a v2 module off in
// `Tenant.settings.enabledModules`. Per API Reference §0 the
// dictionary code is `MODULE_DISABLED` and the HTTP status is 503
// (the module is temporarily unavailable for *this* tenant; other
// tenants can still hit it).

import { AppError } from "./AppError";

export class ModuleDisabledError extends AppError {
  constructor(moduleSlug: string) {
    super(503, "MODULE_DISABLED", `The "${moduleSlug}" module is disabled for this tenant`, {
      module: moduleSlug,
    });
    this.name = "ModuleDisabledError";
  }
}
