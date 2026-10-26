---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
fixed_at: 2026-10-26T09:10:00Z
review_path: .planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-REVIEW.md
iteration: 3
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 7: Code Review Fix Report (iteration 3)

**Fixed at:** 2026-10-26T09:10:00Z
**Source review:** .planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-REVIEW.md
**Iteration:** 3 (plans 07-04 to 07-08)

> **Earlier fixes:** the review of plans 07-01 to 07-03 had four findings (WR-01 and IN-01 to IN-03), and all four were fixed in e52601b, 682dc34, 45d7878 and cbb4779.

**Summary:**
- Findings in scope: 4 (fix_scope: critical_warning, so IN-01 to IN-04 were not attempted)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: The font fallbacks are proportional Arial, so `.ascii-art`'s `monospace` fallback never applies

**Files modified:** `src/app/fonts.ts`, `src/app/globals-css.test.ts`
**Commit:** eb78656
**Applied fix:** `geistMono` and `asciiMono` now set `adjustFontFallback: false` and use real monospace fallbacks: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` for Geist Mono, and `ui-monospace, monospace` for asciiMono. The `, monospace` in `.ascii-art` was kept as a harmless no-op, so the locked CSS test did not change. I wrote a test for each font call first and saw it fail before the fix. The dev server on 3001 now serves `--font-ascii-mono: "asciiMono", ui-monospace, monospace`, with no Arial fallback face.

### WR-02: asciiMono is preloaded on every route but used only on /upload at 640px and wider

**Files modified:** `src/app/fonts.ts`, `src/app/globals-css.test.ts`
**Commit:** 1236975
**Applied fix:** Added `preload: false` to the `asciiMono` `localFont` call. This is the review's first option. The variable stays on `<html>`, so the layout test is unchanged. I wrote the test first and saw it fail. `/spines` on the dev server now has no `ascii_mono` preload link.

### WR-03: The settings step numbers are split across shared components and page files

**Files modified:** `src/components/claude-cli-card.tsx`, `src/components/discogs-card.tsx`, `src/app/settings/page.tsx`, `src/app/settings/page.demo.tsx`, `src/components/markdown-touches.test.ts`, `src/components/preferred-country-field.test.ts`
**Commit:** a738509
**Applied fix:** `ClaudeCliCard` and `DiscogsCard` take a required `step` prop and render `<CornerNumeral value={step} …>`. Both settings pages pass `step={1}` and `step={2}`. The new tests check four things:
- Each card renders whatever step it is given (tested with 7).
- Neither card's source contains a literal numeral.
- In each page's source, the step numbers count 1, 2, 3, then 4 when the Developer card is present. This enforces the invariant that numerals follow render order.
- The `preferred-country-field` render calls pass `step: 2`, because the prop is required.

### WR-04: The "gradient only on page h1s" test does not guard the rule it names

**Files modified:** `src/components/markdown-touches.test.ts`
**Commit:** 647f30d
**Applied fix:** The test now selects files by the `\bgradient-text\b` token instead of the literal `'gradient-text w-fit'`. For each file it adds a check that the token appears exactly once, on an `<h1 className="…">`, and is never combined with `glow`. This was a test-only change, so I checked it with mutations instead of a failing-first run. Adding `glow` to the upload h1 failed the test, and so did putting `gradient-text` on a `CardTitle`. The old test passed the `glow` mutation.

## Verification

All gates ran in the **main checkout**. `workflow.use_worktrees` is `false`, so no worktree was created.
- `npx vitest run`: 128 files and 2462 tests passed.
- `npx tsc --noEmit`: clean.
- `npx biome check`: clean (698 files).
- The existing dev server on 3001 serves the new font stacks and no asciiMono preload on `/spines`. No other server was started.

---

_Fixed: 2026-10-26T09:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
