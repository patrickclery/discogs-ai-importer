---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 07
subsystem: ui-theme
status: complete
tags: [theme, awesomer, contrast, scanlines, typography, plex, gap-closure]
requires: [07-04]
provides:
  - "Destructive Alert descriptions in solid red (C-5, 5.16:1 on a scanline row)"
  - "Destructive DropdownMenuItem focus at red/5 (C-6, 4.77:1 on a scanline row)"
  - "font-prose (IBM Plex Sans) on CardDescription, AlertDescription, EmptyDescription, FieldDescription"
  - "font-sans (Geist Mono) on the buttonVariants base, so Plex never cascades into buttons"
affects: [07-08]
tech-stack:
  added: []
  patterns:
    - "Description primitives own the prose font; buttons pin font-sans to block inheritance"
key-files:
  created: []
  modified:
    - src/components/ui/alert.tsx
    - src/components/ui/dropdown-menu.tsx
    - src/components/ui/card.tsx
    - src/components/ui/empty.tsx
    - src/components/ui/field.tsx
    - src/components/ui/button.tsx
    - src/components/mocha-variants.test.ts
decisions:
  - "Buttons pin font-sans in the shared base so Open Settings buttons inside AlertDescription stay Geist Mono"
requirements-completed: [THEME-06, THEME-09]
metrics:
  duration: "~5 min"
  completed: 2026-10-25
actuals:
  tokens: 2708
  tasks: 2
  commits: 4
plan_head_before: d604eba346fcb744497a414ba68a15e5edce53a5
plan_head_after: 1f1b1037cd421c1f05eae419b689b8ed4acd65bc
---

# Phase 7 Plan 07: Scanline contrast fixes and prose font Summary

Destructive alert text is now solid red and the destructive menu focus tint drops to red/5, so both stay AA under the 4% scanlines. Card, Alert, Empty and Field descriptions read in IBM Plex Sans, and every button is pinned to Geist Mono.

## Tasks

| Task | Name | Commits |
|------|------|---------|
| 1 | Red alert and menu text readable under scanlines (C-5, C-6) | 9ba2b07 (test), b316d1f (fix) |
| 2 | Explanations in IBM Plex Sans, buttons stay mono | 5f9ceb8 (test), 1f1b103 (feat) |

## Verification

- `vitest run`: 127 files, 2432 tests passed
- `tsc --noEmit`: clean
- `biome check src/components`: clean
- Merged class output checked through `cn()` via rendered `data-slot` tokens: `font-prose` survives next to `font-normal` (FieldDescription), and `font-sans` sits next to `font-medium` on every button variant

## TDD Gate Compliance

- RED: 9ba2b07 (2 failing), 5f9ceb8 (10 failing)
- GREEN: b316d1f, 1f1b103 (all passing)
- REFACTOR: not needed

## Human Check (pending)

Open http://127.0.0.1:3001/settings: the sentences under card titles should be in the smoother Plex font, while titles, labels, values and buttons (including Open Settings inside notices) keep the mono font.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
