import type { BarcodeFormat } from "./types";
import { templateAdapter } from "./adapters/template.adapter";
import { gs1Adapter } from "./adapters/gs1.adapter";
import { productAdapter } from "./adapters/product.adapter";

/**
 * Ordered decode adapters (Phase 1.3c). Order is only a tie-breaker — the
 * router picks the highest `match()` confidence — but it reflects specificity:
 * a learned template (most specific) → GS1 (structured standard) → plain product
 * (retail check-digit, then a low-confidence catch-all so today's raw-code
 * lookup behaviour is preserved).
 */
export const BUILT_IN_ADAPTERS: BarcodeFormat[] = [templateAdapter, gs1Adapter, productAdapter];
