export * from "./core";
export { sampleSector, registerSampleSector } from "./sample";
export { pharmacyModule, registerPharmacySector } from "./pharmacy";

import { registerSampleSector } from "./sample";
import { registerPharmacySector } from "./pharmacy";
// Register the shipped sector(s) into the default registry at import time.
registerSampleSector();
registerPharmacySector();
