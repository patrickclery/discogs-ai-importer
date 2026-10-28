---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 19
subsystem: ui
tags: [compact-card, layout, subgrid, a11y, gap-closure, tdd]
status: complete

requires:
  - phase: 06-18
    provides: "Fallback country copy and the BulkStatusLine fallback line"
provides:
  - "CompactSpineCard: six always-rendered rows (status, warnings, crop, select, match, bulk) on a row-span-6 subgrid card, no visible numbering, pencil icon Edit"
  - "TopMatchRow: title exactly two lines, details exactly one line, both with title hover"
  - "BulkStatusLine clamp prop (fallback/skipped/finding clamp to two lines; failed never clamps)"
  - "06-UI-SPEC amendment G-06-side-2 and the 07-UI-SPEC pointer"
affects: [06-verify-work]

actuals:
  tokens: 7500
  tasks: 3
  commits: 5
plan_head_before: 4bf9f3b3bd0026b5114aef5625c1a179c37b6d29
plan_head_after: ad2cc99d11161c7be34b69f4bafdd22fd99e37bc

tech-stack:
  added: []
  patterns:
    - "CSS subgrid card (row-span-6 grid-rows-subgrid) so cards in a grid row share row heights"
    - "Fixed line boxes with line-clamp-N + h-[Nlh] and the full text in title"

key-files:
  created: []
  modified:
    - src/components/compact-spine-card.tsx
    - src/components/compact-spine-card.test.ts
    - src/components/top-match-row.tsx
    - src/components/bulk-status-line.tsx
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-UI-SPEC.md
    - .planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-UI-SPEC.md

key-decisions:
  - "Compact card status row uses min-h-6 and lets a badge wrap its text inside the card instead of a fixed h-6, so no status badge can ever be clipped by the card's overflow-hidden"

metrics:
  duration: 4min
  completed: 2026-10-26
---

# Phase 6 Plan 19: Compact card six-row layout (G-06-side-2) Summary

Compact review cards are now a six-row CSS subgrid (status, warnings, crop, checkbox + match label + pencil Edit, 60px match box, two-line import notes) with no visible spine number, so every card in a grid row lines up and no status badge is clipped.

## What was built

- **Task 1 (tracer):** `CompactSpineCard` collapsed branch restructured into six always-rendered `data-compact-row` children on a `row-span-6 grid grid-rows-subgrid gap-2` card. The `#n` span and corner numeral are gone (number kept in `Select/Edit/Show less of spine #n` labels and crop alt). Edit is a ghost `size="icon"` button with a `Pencil` icon at the right end of the checkbox row; focus return unchanged. The expanded branch is untouched.
- **Task 2:** `TopMatchRow` title `line-clamp-2 h-[2lh]`, details `line-clamp-1 h-[1lh]` with `title={details}`. `BulkStatusLine` gained `clamp?: boolean`; the compact card passes it. Failed lookups never clamp (text, Open Settings and Retry import stay visible). Detailed/expanded callers are unchanged.
- **Task 3:** 06-UI-SPEC amendment "gap closure (G-06-side-2, 06-19)" before Checker Sign-Off. A pointer line goes under the 07-UI-SPEC Card treatments table. Both are additions only (0 deleted lines).

## Verification

- `npx vitest run`: 129 files, 2471 tests passed
- `npx tsc --noEmit`: exit 0
- `npx biome check`: 699 files, no issues
- `/spines` on the running dev server (port 3001) returns 200

## Deviations from Plan

**1. [Rule 2 - Correctness] Status row wraps instead of a fixed 24px height**
- **Found during:** Task 1 (plan-checker INFO note)
- **Issue:** The Card has `overflow-hidden`, and the Badge is `whitespace-nowrap`. "Already in your collection" (about 221px) fits the 232px column at 4 per row with only about 11px to spare, so a fallback font could clip it.
- **Fix:** The status row is `flex min-h-6 items-center` plus `[&>[data-slot=badge]]:max-w-full [&>[data-slot=badge]]:whitespace-normal`. Normally the row is still one 24px badge line. If the badge ever outgrows the column, its text wraps and the subgrid grows the row instead of cutting it off. The test asserts `min-h-6` (not `h-6`) and still asserts no `min-w-0`, `max-w-full` or `overflow-hidden` on the row itself. This is recorded in the 06-UI-SPEC amendment.
- **Commit:** 4221bc9

**2. [Rule 1 - Test] The "no field inputs" check excludes Radix's hidden checkbox input**
- **Found during:** Task 1
- **Issue:** Inside a SelectionProvider, the Radix Checkbox renders a hidden `<input type="checkbox" aria-hidden="true">` on the server, which tripped `not.toContain('<input')`.
- **Fix:** The check now rejects any `<input` other than that hidden checkbox input, and any `<textarea`.
- **Commit:** 4221bc9

## TDD Gate Compliance

- RED a4ce271 then GREEN 4221bc9 (Task 1). RED fecbf7a then GREEN 0ba241f (Task 2). The two Task 2 guard tests (h-15 match row, Detailed fallback unclamped) passed at RED by design: Task 1 already set h-15, and the Detailed card is a regression guard.

## Human check (plain steps)

1. Open the Spines page in Compact view on a wide screen, so there are 4 cards per row.
2. Find a row that has an "Already in your collection" or "Waiting to import" card next to cards with warnings. You should see the whole badge text on every card, with nothing cut off at the right edge.
3. No card shows a number: no "#7" and no big faint number in the corner.
4. From top to bottom, each card shows: the status badge; a warnings line (empty on cards without warnings); the spine photo; one line with the checkbox, "Top match" (or "Confirmed match") and a pencil at the right end; the match; and a last line for import notes.
5. In each row, the photos, checkbox lines and matches start at the same height.
6. A long album title stops after two lines and a long details line after one. Hover over either one to see the full text.
7. Click a pencil. The card opens across the whole row with its edit fields. Click Show less. The card closes and the pencil is selected again.
8. Make the window narrower until there are 3, 2 and then 1 cards per row. The rows still line up, and no badge is cut off.
9. Switch to the Detailed view. It looks as before, with its number.

## Known Stubs

None.

## Self-Check: PASSED

- All six modified files exist. Commits a4ce271, 4221bc9, fecbf7a, 0ba241f and ad2cc99 are ancestors of HEAD.
