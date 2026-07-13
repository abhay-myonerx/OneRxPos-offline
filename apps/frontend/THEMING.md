# RX POS Theming

All brand colors are design tokens. To rebrand the entire app (e.g. change
the primary blue to green), edit ONE place:

- `src/app/globals.css` → `@theme inline` → the `--color-primary-50 … 950` ramp.

Rules:

- Never hardcode `blue-*` / `indigo-*` (or hex) for brand color in components.
  Use `primary-*` utilities (e.g. `bg-primary-600`, `text-primary-700`).
- `accent-*`, `success-*`, `warning-*`, `danger-*` are reserved semantic scales.
- Per-tenant white-label (future) overrides these tokens at runtime.

Verify no brand hardcodes:
`grep -rniE "\b(bg|text|border|ring)-(blue|indigo)-[0-9]" src` → should be empty.
