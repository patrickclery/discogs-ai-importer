---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
reviewed: 2026-10-26T08:50:00Z
depth: standard
iteration: 4
scope: "plans 07-04 to 07-08 (diff_base 35d66c936c493c9ad34b2faa52d77d3bf26d2465) plus fix commits eb78656, 1236975, a738509, 647f30d"
files_reviewed: 36
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
  - src/components/preferred-country-field.test.ts
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
  warning: 0
  info: 5
  total: 5
status: clean
---

# Phase 7: Code Review Report (iteration 4)

**Reviewed:** 2026-10-26T08:50:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** clean

> **Earlier iterations:** iterations 1 and 2 covered plans 07-01 to 07-03, and all of their findings were fixed. Iteration 3 covered plans 07-04 to 07-08 and raised WR-01 to WR-04 plus IN-01 to IN-04. This iteration re-checks the four warning fixes (eb78656, 1236975, a738509, 647f30d) and re-verifies the Info items. `src/components/preferred-country-field.test.ts` was added to scope because a738509 touched it.

## Summary

All four warning fixes are correct and none of them introduced a regression.

- **WR-01 (eb78656):** `geistMono` and `asciiMono` set `adjustFontFallback: false` and list monospace fallbacks (`src/app/fonts.ts:11-18,37-38`). The Arial metric face is gone, so `.ascii-art` and the UI font now fall back to a monospace face. The `, monospace` kept in `globals.css:186` is a harmless duplicate.
- **WR-02 (1236975):** `preload: false` is on `asciiMono` (`fonts.ts:35`). The variable stays on `<html>`, so the font is fetched only where `.ascii-art` renders. Combined with `display: 'block'`, the worst case is a decorative, aria-hidden wordmark that appears late.
- **WR-03 (a738509):** both cards take a required `step: number` and render `<CornerNumeral value={step} …>`. Both settings pages pass 1 and 2 and keep the inline 3 and 4, so each page owns its order. The new render-order test fails closed: if `step` is not the first prop, it collects fewer than n numbers and the test fails. The required prop is enforced by `tsc`, and all callers (both pages and both test files) pass it.
- **WR-04 (647f30d):** the guard now selects files by the `\bgradient-text\b` token. It checks each file for exactly one use, on an `<h1 className="…">`, and with no `glow` in that class string. `\bglow\b` also matches `glow-intense`. All five current h1s satisfy it.

Gates re-run: the affected suites (`markdown-touches`, `globals-css`, `preferred-country-field`, 96 tests) pass, and `tsc --noEmit` and `biome check` are clean.

The iteration-3 Info items still hold, but some line numbers moved and are corrected below. A new Info item (IN-05) notes a remaining gap in the WR-04 guard.

## Info

### IN-01: `CornerNumeral` size `sm` is dead, and the parent contract is not enforced

**File:** `src/components/corner-numeral.tsx:9-13`
**Issue:** No component passes `size="sm"`. Only tests reference `SIZES.sm`, because the photo-section numeral was removed (Owner Decision 4, 07-08). The component also relies on its parent being `relative isolate overflow-hidden` (doc comment, lines 5-7). Inside a default `Card` or any other container, `-z-10` drops it behind the container's background, and nothing flags this.
**Fix:** Remove `sm`, or mark it reserved. Consider making the numeral a `Card` prop (`<Card variant="mini" numeral={{ value, size }}>`) so it can only render inside a parent that sets up the stacking context.

### IN-02: `##` heading markers on Settings card titles, which are not headings

**File:** `src/components/claude-cli-card.tsx:134-137`, `src/components/discogs-card.tsx:191-194`, `src/app/settings/page.tsx:106-109,127-130`, `src/app/settings/page.demo.tsx:149-152`
**Issue:** shadcn `CardTitle` renders a `<div>`. Sighted users see a markdown `##` heading marker on "Claude CLI", "Discogs", "Data folder" and "Developer", but `/settings` exposes only its `h1` to screen readers. The `##` prefixes on photo sections and Photos are on real `h2`s.
**Fix:** Render these titles as headings, either with `<CardTitle asChild><h2 className="text-base">…</h2></CardTitle>` (after adding `asChild` support) or with `role="heading" aria-level={2}`.

### IN-03: The scanline overlay is above dialogs but below toasts, and it ignores `prefers-contrast: more`

**File:** `src/app/globals.css:114-122,210-214`
**Issue:** `body::before` uses `z-index: 9999`. That puts it above Radix dialogs (`z-50`) but below Sonner's toaster (`z-index: 999999999`), so toasts are the only surface without scanlines. The overlay is hidden for print and forced colors, but not for `prefers-contrast: more`.
**Fix:** Change the media query to `@media print, (forced-colors: active), (prefers-contrast: more) { body::before { display: none; } }`. Either note the toast exception in the spec, or raise the overlay above the toaster.

### IN-04: `featured` is inferred from whether a footer slot was passed

**File:** `src/components/photo-section.tsx:156`
**Issue:** `featured={trailing !== undefined}` ties the featured surface to an unrelated slot prop. A caller that passes `trailing={null}` or `trailing={cond && x}` gets a featured card with no expanded content.
**Fix:** Add an explicit `featured?: boolean` prop to `SpineView` and set it at the `renderFull` call site, or use `featured={trailing != null && trailing !== false}`.

### IN-05: The WR-04 guard checks only the h1's own className, but `text-shadow` is inherited

**File:** `src/components/markdown-touches.test.ts:302-318`, `src/app/globals.css:172-181`
**Issue:** `.glow` and `.glow-intense` set `text-shadow`, which is an inherited property. The new test rejects `glow` in the same class string as `gradient-text`. It would still pass if `glow` were put on a wrapper around a page h1, such as the `flex flex-col gap-2` div in `src/app/upload/page.tsx:23`, and the inherited shadow would smear the transparent-fill title. Today `glow` is only on the wordmark `<pre>`, a sibling of the h1, so nothing is broken.
**Fix:** Pin the shadow off in CSS rather than relying on the test: add `text-shadow: none;` to `.gradient-text` in `globals.css:166`. That makes the "never with glow" rule hold whatever the ancestors are.

---

_Reviewed: 2026-10-26T08:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
