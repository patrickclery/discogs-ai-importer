---
phase: 04-import-review-queue
plan: 15
subsystem: ui
tags: [gap-closure, css, overflow, alert-dialog, select, G-04-7]
status: complete
requires: []
provides:
  - "Duplicate dialog contained with 120+ char unspaced photo names (DUPLICATE_DIALOG_TITLE_CLASS, DUPLICATE_DIALOG_CONTENT_CLASS, exported CropWell)"
  - "Photo filter rows ellipsize with full name on hover (PHOTO_OPTION_ITEM_CLASS, photoOptionItemProps)"
affects: [04-UAT test 7]
tech-stack:
  added: []
  patterns:
    - "Call-site className constants exported for node-env Vitest assertions where Radix Portals render nothing server-side"
key-files:
  created:
    - src/components/duplicate-import-dialog.test.ts
    - src/components/spines-filter-bar.test.ts
  modified:
    - src/components/duplicate-import-dialog.tsx
    - src/components/spines-filter-bar.tsx
decisions:
  - "Dialog title keeps exactly one overflow-wrap rule ([overflow-wrap:anywhere]) plus min-w-0; content grid gets grid-cols-[minmax(0,1fr)] as a backstop. Shared ui/ primitives untouched."
  - "Photo filter SelectItem gets *:[span]:last:min-w-0 and title={filename} via photoOptionItemProps."
requirements-completed: [IMP-03, REV-03]
duration: 2min
completed: 2026-10-22
actuals:
  tokens: 2300
  tasks: 2
  commits: 4
plan_head_before: e3ea183cb619a87bf7c0e47ac1de5ce271a706d0
plan_head_after: 18827e5
---

# Phase 4 Plan 15: Long photo name overflow (G-04-7) Summary

The duplicate-import dialog now stays inside its box with a 123-char unspaced photo name (single `[overflow-wrap:anywhere]` + `min-w-0` title, `minmax(0,1fr)` content column), and the /spines photo filter ellipsizes long names with the full name on hover (`*:[span]:last:min-w-0` + `title`).

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Tracer: duplicate dialog contained | 562b368 (RED), 39fce40 (GREEN) |
| 2 | Photo filter ellipsis + hover title | 1bbaea4 (RED), 18827e5 (GREEN) |

## Verification

- `vitest run` (full suite): 85 files, 1604 tests passed
- `tsc --noEmit`: clean; `biome check`: clean (320 files)
- All grep acceptance criteria match; `git diff --name-only 9e5b0ca -- src/components/ui/` empty
- Tracer gate: automated verify re-run green before Task 2

## TDD Gate Compliance

Both tasks: RED test commit (confirmed failing: 7/7 and 4/4) followed by GREEN fix commit. No refactor step needed.

## Pending Human Verification

Not run (needs a real browser; record against UAT test 7 at `/gsd-verify-work 4`):

1. With a ~120-char unspaced photo name, click Add on a CD another spine already imported, at full width and phone width: the title wraps inside the box, both spine pictures and Cancel / Add another copy stay inside, and captions stop after two lines with the full name on hover.
2. Open "Filter by photo" on /spines at both widths: the long name ends with "…" inside the list, hover shows the full name, short names look unchanged, and choosing the photo filters to its spines.

## Deviations from Plan

None - plan executed exactly as written. (Commands run via `node_modules/.bin/*` instead of `corepack pnpm`, per orchestrator instruction; `typecheck` ran as `tsc --noEmit` without `next typegen`.)

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/components/duplicate-import-dialog.test.ts, src/components/spines-filter-bar.test.ts
- FOUND commits: 562b368, 39fce40, 1bbaea4, 18827e5
