---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 15
subsystem: ui
tags: [spines, filter-bar, responsive, gap-closure, tdd]
status: complete

requires:
  - phase: 04
    provides: "ReviewStatusFilter (row 1 of the /spines filter bar)"
provides:
  - "ReviewStatusFilter as a wrapping, spaced ToggleGroup (no sideways scroller)"
  - "Markup test for the status tab row"
affects: []

actuals:
  tokens: 1400
  tasks: 1
  commits: 2
plan_head_before: 1edc4022ad8809d326bb864c7efdcae0ea6dd09e
plan_head_after: 80ea62cc021790fd5653e2c6c3ff2a400bbb6c58

tech-stack:
  added: []
  patterns:
    - "A ToggleGroup that must wrap uses spacing > 0, since spacing 0 joins items and breaks borders on the second line"

key-files:
  created:
    - src/components/review-status-filter.test.ts
  modified:
    - src/components/review-status-filter.tsx

key-decisions:
  - "Status tabs wrap (spacing={1} + flex-wrap) instead of scrolling sideways, so every tab is visible at phone width (G-06-9)"

requirements-completed: [BULK-01]

duration: 4min
completed: 2026-10-25
---

# Phase 06 Plan 15: Wrapping Status Tab Row Summary

**The /spines status tabs now wrap onto extra lines as separate outlined buttons, so All through Failed are all on screen at phone width (G-06-9).**

## Performance

- **Duration:** about 4 min
- **Tasks:** 1 (tracer, TDD)
- **Files modified:** 2

## Accomplishments

- Removed the `-mx-1 overflow-x-auto px-1 pb-1` wrapper and the `w-max` group width from ReviewStatusFilter.
- ToggleGroup now takes `spacing={1}` and `flex-wrap`, so each tab keeps its own border and rounded corners when the row breaks.
- Rewrote the doc comment to describe the wrapping behavior.
- New markup test covers: all seven tabs with their counts, a single `flex-wrap` group with non-zero `data-spacing`, no overflow-x or `w-max` classes, and the Failed count still in `text-destructive`.

## Task Commits

1. **Task 1 RED: failing test** - `66c7662` (test)
2. **Task 1 GREEN: wrapping row** - `80ea62c` (feat)

No refactor commit was needed.

## TDD Gate Compliance

- RED: `66c7662`. 2 of 4 tests failed for the right reason: the group had no `flex-wrap` class, and the markup still had `overflow-x-auto`.
- GREEN: `80ea62c`. 4/4 pass, and `spines-filter-bar.test.ts` still passes.

## Tracer Gate

Auto mode was on (`auto_advance: true`), so after GREEN the automated `<verify>` was run again from start to finish: vitest (24/24), `tsc --noEmit`, and `biome check src/components` all passed. The human check (narrowing the browser to phone width on /spines) is left for end-of-phase UAT, as `human_verify_mode: end-of-phase` specifies.

## Verification

- `node_modules/.bin/vitest run`: 121 files, 2242 tests passed
- `node_modules/.bin/tsc --noEmit`: clean
- `node_modules/.bin/biome check src/components`: clean
- Grep acceptance: overflow-x-auto 0, w-max 0, flex-wrap 1, `spacing={1}` 1

## Deviations from Plan

**1. [Rule 3 - Blocking] The test parses markup with regex instead of DOMParser**
- **Found during:** Task 1 RED
- **Issue:** Vitest runs in the `node` environment, which has no DOMParser.
- **Fix:** Reused the `tagsWithSlot` helper from `test/helpers/radix-open.ts` for the group tag, and matched each item's `<button>` markup with a regex, the same way the spines-filter-bar tests do.
- **Files modified:** src/components/review-status-filter.test.ts
- **Commit:** 66c7662

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/components/review-status-filter.tsx
- FOUND: src/components/review-status-filter.test.ts
- FOUND: 66c7662
- FOUND: 80ea62c
