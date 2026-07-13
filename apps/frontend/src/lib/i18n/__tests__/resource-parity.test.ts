// src/lib/i18n/__tests__/resource-parity.test.ts
import { describe, it, expect } from "vitest";
import enCommon from "../locales/en/common.json";
import frCommon from "../locales/fr/common.json";
import enPos from "../locales/en/pos.json";
import frPos from "../locales/fr/pos.json";

// Flatten nested keys to dotted paths so we compare leaf keys, not shapes.
function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("resource parity (en <-> fr)", () => {
  it.each([
    ["common", enCommon, frCommon],
    ["pos", enPos, frPos],
  ])("%s namespace has identical key sets", (_ns, en, fr) => {
    expect(keys(fr as Record<string, unknown>).sort()).toEqual(
      keys(en as Record<string, unknown>).sort(),
    );
  });
});
