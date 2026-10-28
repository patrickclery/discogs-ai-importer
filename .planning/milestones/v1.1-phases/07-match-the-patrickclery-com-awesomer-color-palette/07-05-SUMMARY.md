---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 05
subsystem: ui-theme
status: complete
tags: [theme, awesomer, cards, dialogs, bulk-bar, gap-closure]
requires: [07-04]
provides:
  - "SpineCard featured prop: featured or mini Card variant with an lg CornerNumeral first child"
  - "SpineView passes featured={trailing !== undefined}: the expanded compact card is featured, Detailed cards are mini"
  - "DialogContent, AlertDialogContent and the bulk import bar on card-featured"
  - "font-prose (IBM Plex Sans) on DialogDescription, AlertDialogDescription and the orphan explanation"
affects: [07-06, 07-07, 07-08]
tech-stack:
  added: []
  patterns:
    - "Portalled Radix content and context-bound components are locked by source-region token tests (featured-surfaces.test.ts)"
key-files:
  created:
    - src/components/featured-surfaces.test.ts
  modified:
    - src/components/spine-card.tsx
    - src/components/photo-section.tsx
    - src/components/compact-spine-card.test.ts
    - src/components/ui/dialog.tsx
    - src/components/ui/alert-dialog.tsx
    - src/components/bulk-import-bar.tsx
decisions:
  - "Featured means the one card in focus: only the expanded compact card is featured; every other SpineCard is mini"
requirements-completed: [THEME-08, THEME-09]
metrics:
  duration: "~2 min"
  completed: 2026-10-25
actuals:
  tokens: 3240
  tasks: 2
  commits: 4
plan_head_before: df2ee16148a0d6ba29dcda2b26f391695cfa7d23
plan_head_after: a538ad2fb7250db9919dee92e986d926dfbb1618
---

# Phase 7 Plan 05: featured spine card, mini Detailed cards and featured dialogs Summary

The expanded compact spine card is now awesomer's glowing featured card, Detailed cards are gradient mini cards, and both carry the 160px faint spine number. Every dialog, alert dialog and the bulk import bar sit on the featured surface. Dialog explanations and the orphan explanation are set in IBM Plex Sans.

## Tasks

| # | Task | Commits | Notes |
|---|------|---------|-------|
| 1 | Featured expanded card, mini Detailed cards (TDD) | 59cd086 (RED), f92a28f (GREEN) | `featured` prop, lg numeral before `#n`, SpineView wiring, Plex orphan copy |
| 2 | Featured dialogs, alert dialogs and bulk bar (TDD) | 0d3a74a (RED), a538ad2 (GREEN) | Token swap `border bg-background shadow-lg` to `card-featured`; `font-prose` on descriptions |

## Verification

- `vitest run`: 126 files, 2401 tests pass. The known-flaky `cli.test.ts` SIGKILL timing test failed once in the full run and passed on rerun.
- `tsc --noEmit` and `biome check src/components`: clean
- tailwind-merge output checked: the card keeps `card-mini`, `p-4` and `border-warning/60` and drops `py-6`/`gap-6`. The dialog keeps `card-featured` and `p-6`.
- `.card-featured` sets no `position`, so the dialog's `fixed` and the bar's `sticky` are unaffected.
- No build run and the dev server was not touched (class-only changes).

## Deviations from Plan

None. The plan was executed as written.

## Human checks (end of phase)

- /spines Compact on port 3001: click Edit spine. The opened card has a purple border, a soft glow and a large faint number. In Detailed view the cards are shaded, carry the same number and glow only on hover. Orphaned cards keep a yellow border.
- Tick two cards: the bottom bar glows purple. The Dismiss and Disconnect Discogs dialogs glow on a slightly lighter slate panel, with explanation text in the rounder book font and titles and buttons in the typewriter font.

## Threat Flags

None. Under T-07-11, destructive confirm buttons, copy and focus order are unchanged. Only the container surfaces changed.

## Self-Check: PASSED

- featured-surfaces.test.ts exists
- Commits 59cd086, f92a28f, 0d3a74a and a538ad2 are ancestors of HEAD
