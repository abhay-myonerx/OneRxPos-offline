// Seam guard (mirrors src/shell/__tests__/no-direct-next-nav.test.ts): files in
// the converted i18n slice must not reintroduce hardcoded user-facing strings —
// UI text must go through t(). The scoped file list widens as more of the app
// is converted in later phases.
import { readFileSync } from "node:fs";

const SLICE = [
  "src/components/shared/feedback/Empty.tsx",
  "src/components/shared/feedback/Error.tsx",
  "src/components/shared/auth/PermissionDenied.tsx",
  "src/components/shared/theme/ThemeToggle.tsx",
  "src/components/shared/i18n/LocaleSwitcher.tsx",
];

// Detect hardcoded JSX *text nodes*, tolerant of the codebase's multi-line style.
// Scan content between a ">" (not part of "=>" or "/>") and the next "<". Real JSX
// text is either empty or a {t(...)} expression; a leftover word after stripping
// balanced {…} groups means hardcoded text. Segments containing code tokens
// ({ } ; => return/const/let/…) are the JS *between* sibling JSX literals, not a
// text node, so they are skipped.
// Residual limitation (documented): text interleaved with nested JSX inside one
// expression, or a sentence literally containing a code token, may evade — this
// targets the common regression (plain hardcoded text + hardcoded UI attributes).
function rawJsxTextOffenders(src: string): string[] {
  const offenders: string[] = [];
  const re = /(?<![=/])>([^<]*)</g;
  for (const match of src.matchAll(re)) {
    let inner = match[1];
    let prev: string;
    do {
      prev = inner;
      inner = inner.replace(/\{[^{}]*\}/g, "");
    } while (inner !== prev);
    if (/[{};]|=>|\b(return|const|let|function|import|export|null|undefined)\b/.test(inner)) {
      continue; // code region between JSX literals, or unbalanced expression — not text
    }
    const trimmed = inner.trim();
    if (/[A-Za-z]{2,}/.test(trimmed)) offenders.push(trimmed);
  }
  return offenders;
}
// Raw UI string attributes (must be {t(...)}, i.e. a brace, not a quote).
const rawAttr = /\b(aria-label|title|placeholder|alt)\s*=\s*"[^"]*[A-Za-z]{3,}[^"]*"/g;

test("converted i18n slice has no hardcoded user-facing strings", () => {
  const offenders: string[] = [];
  for (const file of SLICE) {
    const src = readFileSync(file, "utf8");
    if (!/useTranslation\s*\(/.test(src)) offenders.push(`${file}: missing useTranslation`);
    const textHits = rawJsxTextOffenders(src);
    const attrHits = src.match(rawAttr) ?? [];
    if (textHits.length) offenders.push(`${file}: raw JSX text ${JSON.stringify(textHits)}`);
    if (attrHits.length) offenders.push(`${file}: raw UI attribute ${JSON.stringify(attrHits)}`);
  }
  expect(offenders).toEqual([]);
});
