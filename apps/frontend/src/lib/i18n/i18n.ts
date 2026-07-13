import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import frCommon from "./locales/fr/common.json";
import enPos from "./locales/en/pos.json";
import frPos from "./locales/fr/pos.json";

export const NAMESPACES = ["common", "pos"] as const;

// Idempotent: both shells + HMR + tests may import this more than once.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { common: enCommon, pos: enPos },
      fr: { common: frCommon, pos: frPos },
    },
    lng: "en", // LocaleProvider sets the hydrated value on mount
    fallbackLng: "en",
    ns: [...NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
    returnEmptyString: false,
    // Missing keys must round-trip as "ns:key" (not just "key") so a
    // missing translation is unambiguous and safe to render as a fallback.
    appendNamespaceToMissingKey: true,
    // Warn on missing keys in the dev server only (Vite MODE 'development').
    // Not in test (MODE 'test') so test output stays pristine, nor in prod.
    saveMissing: import.meta.env?.MODE === "development",
    missingKeyHandler: (_lng, ns, key) => {
      console.warn(`[i18n] missing key: ${ns}:${key}`);
    },
  });
}

export default i18n;
