---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 03
subsystem: ui-theme
status: complete
tags: [theme, catppuccin, contrast, toggles, links]
requires: [07-01]
provides:
  - "toggleVariants base carries the named group group/toggle"
  - "Count switches to text-accent-foreground inside a hovered or pressed toggle (C-3, C-4)"
  - "Lavender hover (hover:text-primary-hover) on all six inline accent links"
affects: []
tech-stack:
  added: []
  patterns:
    - "Named Tailwind group (group/toggle) so child text reacts to the toggle's hover and data-state without clashing with checkbox.tsx's bare group"
key-files:
  created: []
  modified:
    - src/components/ui/toggle.tsx
    - src/components/review-status-filter.tsx
    - src/components/review-status-filter.test.ts
    - src/components/discogs-card.tsx
    - src/components/discogs-matches.tsx
    - src/components/confirmed-match.tsx
    - src/components/disconnect-discogs-button.tsx
    - src/components/bulk-status-line.tsx
decisions:
  - "Count group classes were added alongside the existing color classes, not swapped in, so the muted and destructive rest colors and existing tests stay unchanged"
requirements-completed: [THEME-05, THEME-06]
coverage:
  - deliverable: "Counts readable in pressed and hovered toggles (C-3, C-4)"
    verification:
      - kind: unit
        ref: "src/components/review-status-filter.test.ts#Count in toggles (Phase 7 C-3, C-4)"
        status: pass
    human_judgment: true
    rationale: "Readability on the pressed and hover fills is visual (plan human-check)"
  - deliverable: "Lavender hover on inline accent links"
    verification:
      - kind: grep
        ref: "inline text-primary links outside ui/ lacking hover:text-primary-hover = 0"
        status: pass
    human_judgment: true
    rationale: "Hover color is visual (plan human-check)"
metrics:
  duration: "~2 min"
  completed: 2026-10-25
actuals:
  tokens: 2268
  tasks: 2
  commits: 3
plan_head_before: d68a6ab778bd432e8de0e88145e8b10056812dec
plan_head_after: 707edcd839bdb2f4043c561454cceea23c97fe89
---

# Phase 7 Plan 03: Count Contrast and Link Hover Summary

Filter counts (status tabs, Needs review, Fallback) now switch to the off-white text color while their toggle is pressed or hovered, through a named `group/toggle` on `toggleVariants`. This fixes the AA failures C-3 (muted on surface1) and C-4 (red Failed count on surface1). All six inline accent links now hover to lavender.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Counts stay readable inside pressed and hovered toggles (TDD) | e4b83bc (RED), e019c27 (GREEN) |
| 2 | Lavender hover on every inline accent link | 707edcd |

## TDD Gate Compliance

- RED: `e4b83bc`. 4 new tests failed: the Count group tokens, the alert Count, `toggleVariants` with `group/toggle`, and the status tabs.
- GREEN: `e019c27`. 8/8 passed, and spines-filter-bar.test.ts still passes.
- REFACTOR: none needed.

## Verification

- `vitest run`: 124 files, 2359 tests passed
- `tsc --noEmit`: clean
- `biome check`: clean (690 files)

## Deviations from Plan

None. The plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- All 8 modified files exist
- Commits e4b83bc, e019c27 and 707edcd are ancestors of HEAD
