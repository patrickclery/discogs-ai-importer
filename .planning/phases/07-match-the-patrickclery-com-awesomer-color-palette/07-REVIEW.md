---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
reviewed: 2026-10-26T08:42:35Z
depth: standard
iteration: 3
scope: "plans 07-04 to 07-08 (diff_base 35d66c936c493c9ad34b2faa52d77d3bf26d2465)"
files_reviewed: 35
files_reviewed_list:
  - src/app/fonts.ts
  - src/app/globals-css.test.ts
  - src/app/globals.css
  - src/app/layout.demo.tsx
  - src/app/layout.tsx
  - src/app/settings/page.demo.tsx
  - src/app/settings/page.tsx
  - src/app/upload/page.demo.tsx
  - src/app/upload/page.tsx
  - src/components/app-header.test.ts
  - src/components/app-header.tsx
  - src/components/ascii-wordmark.tsx
  - src/components/bulk-import-bar.tsx
  - src/components/claude-cli-card.tsx
  - src/components/compact-spine-card.test.ts
  - src/components/compact-spine-card.tsx
  - src/components/corner-numeral.tsx
  - src/components/discogs-card.tsx
  - src/components/featured-surfaces.test.ts
  - src/components/markdown-touches.test.ts
  - src/components/md-prefix.tsx
  - src/components/mocha-variants.test.ts
  - src/components/photo-section.tsx
  - src/components/photo-status-list.tsx
  - src/components/spine-card.tsx
  - src/components/spines-view.tsx
  - src/components/terminal-touches.test.ts
  - src/components/ui/alert-dialog.tsx
  - src/components/ui/alert.tsx
  - src/components/ui/button.tsx
  - src/components/ui/card.tsx
  - src/components/ui/dialog.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/components/ui/empty.tsx
  - src/components/ui/field.tsx
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 7: Code Review Report (iteration 3)

**Reviewed:** 2026-10-26T08:42:35Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

> **Earlier iterations:** iterations 1 and 2 covered plans 07-01 to 07-03 (the Mocha colors). All of their findings (WR-01 and IN-01 to IN-03) were fixed. See `07-REVIEW-FIX.md`. This iteration replaces that report and covers only plans 07-04 to 07-08: fonts, the ASCII wordmark, corner numerals, markdown prefixes, and the featured and mini surfaces. Binary and licence files (`src/app/fonts/OFL.txt`, `src/app/fonts/ascii_mono.woff2`) were skipped. Their size and sha256 are locked by tests.

## Summary

The v2 layer matches the 07-UI-SPEC contract closely. These checks were run and pass:

- **Cascade:** `.card-*` live in `@layer components`, so `border-warning/60` on orphaned cards still wins over `.card-mini:hover` and `.card-featured:hover`. The reduced-motion, print and forced-colors overrides are unlayered, so they beat every layer.
- **Layering:** `isolate` plus `-z-10` puts the numeral above the card fill and below the content.
- **`overflow-hidden`:** it clips nothing under the new Card variants. There are no sticky, absolute or non-portaled popovers inside cards.
- **Wordmark:** all 12 rows are 53 or 79 columns, and every glyph is inside the font's verified charset (`fc-query`: `20-7e a0 2500-259f`).
- **Tooling:** the vitest suite (2448 tests), `tsc --noEmit` and `biome check` all pass.

There are no blockers. The remaining problems are robustness and maintainability:

- The font fallbacks are proportional Arial, so the `monospace` fallback in `.ascii-art` can never apply.
- The decorative font is preloaded on every route.
- The settings step numbers are spread across shared components.
- One "only on page h1s" test guard does not enforce what it claims.

## Warnings

### WR-01: The font fallbacks are proportional Arial, so `.ascii-art`'s `monospace` fallback never applies

**File:** `src/app/fonts.ts:6-23`, `src/app/globals.css:186`
**Issue:** `next/font` defaults to `adjustFontFallback: 'Arial'` for both `localFont` and Google fonts. The built CSS confirms it:
- `--font-ascii-mono: "asciiMono", "asciiMono Fallback"`, with `@font-face { font-family: asciiMono Fallback; src: local(Arial); size-adjust: 131.49% }`.
- `Geist Mono Fallback` is also `local(Arial)` with `size-adjust: 134.59%`.

`.ascii-art` declares `font-family: var(--font-ascii-mono), monospace;`. `asciiMono Fallback` always resolves, because Arial is installed everywhere, so the `monospace` generic is unreachable. With `display: 'block'`, a failed or slow load ends the block period and swaps the wordmark to Arial scaled up 131%. Arial is proportional, so the box-drawing columns no longer line up, and the 79-column row grows past the 592px it was sized for. The wrapper's `overflow-hidden` then crops it. The same thing happens app-wide: Geist Mono is now the whole UI font (`--font-sans`), so every first paint during the swap renders in proportional Arial at about 135% size and then reflows to mono.
**Fix:**
```ts
export const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
});

export const asciiMono = localFont({
  src: './fonts/ascii_mono.woff2',
  variable: '--font-ascii-mono',
  display: 'block',
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'monospace'],
});
```
Then drop the dead `, monospace` from `.ascii-art`, or keep it as a no-op. Update the `fonts.ts` text test to match.

### WR-02: asciiMono is preloaded on every route but used only on /upload at 640px and wider

**File:** `src/app/fonts.ts:19-23`, `src/app/layout.tsx:22`, `src/app/layout.demo.tsx:28`
**Issue:** The font's variable class is on `<html>` in the root layout, so `next/font` adds the woff2 to every page's preload list. The built `next-font-manifest.json` for `/spines` and `/settings` both list `static/media/ascii_mono-s.p.*.woff2`. No element on those pages uses `--font-ascii-mono`. The same is true of `/upload` below 640px, where the wordmark is `hidden`. Chrome logs "The resource … was preloaded using link preload but not used within a few seconds" on every load of those pages. That is console noise the smoke checks will not catch, plus a wasted request on each page.
**Fix:** Add `preload: false` to the `asciiMono` `localFont` call. The wordmark is decorative and already `display: 'block'`, so a late, on-demand load only delays an aria-hidden graphic. Another option is to apply `asciiMono.variable` on the `AsciiWordmark` wrapper instead of `<html>`, which scopes the preload to `/upload`.

### WR-03: The settings step numbers are split across shared components and page files

**File:** `src/components/claude-cli-card.tsx:129`, `src/components/discogs-card.tsx:186`, `src/app/settings/page.tsx:103,124`, `src/app/settings/page.demo.tsx:146`
**Issue:** `ClaudeCliCard` hard-codes `<CornerNumeral value={1} />` and `DiscogsCard` hard-codes `value={2}`. The pages hard-code 3 and 4. The order of the setup steps is a page-level fact, but it now lives in four places across two pages and two shared components. If the cards are reordered, a card is added, or a shared card is reused, the steps are silently mislabeled. For example, moving Discogs above Claude CLI would render "2, 1, 3". The tests lock the current literals but not the invariant "numerals follow render order".
**Fix:** Make the step number a prop the page passes in, so one file owns the order:
```tsx
export function ClaudeCliCard({ status, model, step }: { …; step: number }) {
  return (
    <Card variant="mini">
      <CornerNumeral value={step} size="md" />
```
```tsx
<ClaudeCliCard step={1} … />
<DiscogsCard step={2} … />
```

### WR-04: The "gradient only on page h1s" test does not guard the rule it names

**File:** `src/components/markdown-touches.test.ts:238-259`
**Issue:** The test says gradient titles "appear only on the three page h1s and their demo twins". It only searches source for the literal `'gradient-text w-fit'`. Any other use of `gradient-text` passes, for example `className="gradient-text"` on a featured card title, or `gradient-text glow`, which the spec forbids because the text-shadow smears transparent-fill text. So the spec rule "gradient-text is used only on page h1s. Never combine `.gradient-text` with `.glow`" has no real guard, and the test name overstates its coverage.
**Fix:** Match the class token itself and assert the glow exclusion:
```ts
.filter((f) => /\bgradient-text\b/.test(fs.readFileSync(path.join(root, f), 'utf8')))
// …and for each hit:
expect(text).not.toMatch(/gradient-text[^"'`]*\bglow\b|\bglow\b[^"'`]*gradient-text/);
```

## Info

### IN-01: `CornerNumeral` size `sm` is now dead, and the parent contract is not enforced

**File:** `src/components/corner-numeral.tsx:9-13`
**Issue:** Owner Decision 4 removed the photo-section numeral (07-08). That was the only planned `sm` consumer, so `SIZES.sm` is referenced only by tests. The component also depends on its parent being `relative isolate overflow-hidden`. If it is dropped into a default `Card` or any other container, `-z-10` sends it behind the container's background (invisible) or behind the page, and nothing flags this.
**Fix:** Remove `sm`, or keep it with a comment saying it is reserved. Consider moving the numeral into `Card` as a prop, `<Card variant="mini" numeral={{ value, size }}>`, so it can only render inside a parent that sets up the stacking context.

### IN-02: `##` heading markers on Settings card titles, which are not headings

**File:** `src/components/claude-cli-card.tsx:131-134`, `src/components/discogs-card.tsx:188-191`, `src/app/settings/page.tsx:105-108,126-129`, `src/app/settings/page.demo.tsx:148-151`
**Issue:** shadcn `CardTitle` renders a `<div>`. Sighted users now see a markdown `##` heading marker on "Claude CLI", "Discogs", "Data folder" and "Developer". Screen-reader users get no heading there, because `/settings` has only the `h1`. The new visual makes the gap between the look and the semantics explicit. The photo-section and Photos `##` prefixes are on real `h2`s, so they are consistent.
**Fix:** Render these titles as headings, for example `<CardTitle asChild><h2 className="text-base">…</h2></CardTitle>` after adding `asChild` support, or with `role="heading" aria-level={2}`.

### IN-03: The scanline overlay is above dialogs but below toasts, and it ignores `prefers-contrast: more`

**File:** `src/app/globals.css:114-122,207-211`
**Issue:** `body::before` uses `z-index: 9999`. It sits above Radix dialogs (`z-50`) but below Sonner's toaster (`z-index: 999999999` in `sonner/dist/styles.css`), so toasts are the only surface without scanlines. Separately, the overlay is hidden for print and forced colors, but not for `prefers-contrast: more`. That is where a 4% darkening of every second row is least wanted, and the contrast table's tightest pairs (4.53) rely on it being absent.
**Fix:** Add `prefers-contrast: more` to the hide list: `@media print, (forced-colors: active), (prefers-contrast: more) { body::before { display: none; } }`. Either accept the toast exception explicitly in the spec, or lift the overlay above the toaster.

### IN-04: `featured` is inferred from whether a footer slot was passed

**File:** `src/components/photo-section.tsx:156`
**Issue:** `featured={trailing !== undefined}` ties the surface treatment to an unrelated slot prop. A future caller that passes `trailing={null}` or `trailing={cond && x}` (which is `false`) gets a glowing featured card with no expanded state. The spec prescribes this wiring, so this is about robustness only.
**Fix:** Pass the intent explicitly: give `SpineView` a `featured?: boolean` prop and set it from the `renderFull` call site in `CompactSpineCard`. Alternatively, `featured={trailing != null && trailing !== false}`.

---

_Reviewed: 2026-10-26T08:42:35Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
