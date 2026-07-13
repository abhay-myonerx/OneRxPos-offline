// ESLint flat config (ESLint v9+). .eslintrc.json is not used — ESLint 9
// reads flat config by default. Minimal ruleset for the desktop scaffold.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "out/**",
      "dist-desktop/**",
      "node_modules/**",
      // SN-5 Task 3: scripts/prepare-backend-resources.mjs's staged, build-time
      // copy of rx-pos-backend — not source this repo owns/lints.
      ".staging/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
);
