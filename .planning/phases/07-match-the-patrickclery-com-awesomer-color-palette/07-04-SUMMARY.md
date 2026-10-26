---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 04
subsystem: ui-theme
status: complete
tags: [theme, awesomer, fonts, next-font, cards, scanlines, demo-export, gap-closure]
requires: []
provides:
  - "src/app/fonts.ts: geistMono, plexSans (400) and local asciiMono next/font loaders shared by both layouts"
  - "Self-hosted asciiMono subset (7,032 bytes, sha256-pinned) with SIL OFL 1.1 text"
  - "Card variant prop: default | mini | featured (card-mini / card-featured component classes)"
  - "CornerNumeral({ value, size: sm | md | lg }) decorative corner number"
  - "Compact spine card as a gradient mini card with an md corner numeral"
  - "globals.css v2 block: scanlines, gradient-text, glow, glow-intense, 5x cursor-blink, ascii-art, reduced-motion and forced-colors rules; --glow and --cyan tokens"
affects: [07-05, 07-06, 07-07, 07-08]
tech-stack:
  added: []
  patterns:
    - "Fonts live in one module (src/app/fonts.ts); layouts only import and apply .variable classes"
    - "awesomer surfaces are @layer components classes, so caller utilities (border-warning/60) still win"
    - "CSS rule tests collapse whitespace so Biome's multi-line CSS formatting does not break them"
key-files:
  created:
    - src/app/fonts.ts
    - src/app/fonts/ascii_mono.woff2
    - src/app/fonts/OFL.txt
    - src/components/corner-numeral.tsx
  modified:
    - src/app/layout.tsx
    - src/app/layout.demo.tsx
    - src/app/globals.css
    - src/app/globals-css.test.ts
    - src/components/ui/card.tsx
    - src/components/compact-spine-card.tsx
    - src/components/compact-spine-card.test.ts
decisions:
  - "CornerNumeral passes its size tokens to cn() before the base tokens, so tailwind-merge keeps leading-none (a later text-* size would drop it)"
  - "globals.css v2 rules are stored Biome-formatted (multi-line values); declarations are identical to 07-UI-SPEC"
requirements-completed: [THEME-08, THEME-09, THEME-10]
metrics:
  duration: "~4 min"
  completed: 2026-10-26
actuals:
  tokens: 7700
  tasks: 3
  commits: 4
plan_head_before: fc7eafd0809f590362ea553d89ed8f769a2fac4a
plan_head_after: 229420b2c4e2ed46a2322b10ecee060005d8f484
---

# Phase 7 Plan 04: awesomer fonts, gradient mini card and terminal CSS layer Summary

Geist Mono is now the whole UI font, with IBM Plex Sans 400 for prose and a self-hosted, OFL-licensed asciiMono subset, all through next/font. Compact spine cards are awesomer gradient mini cards with a faint mauve corner numeral. globals.css carries the full v2 layer (scanlines, gradient text, glows, a 5-blink cursor, ascii-art, reduced-motion and forced-colors rules) for plans 07-05 to 07-08.

## Tasks

| # | Task | Commit | Notes |
|---|------|--------|-------|
| 1 | Tracer: fonts + mini card with corner numeral, app build and demo export | aab384b | Tracer verify passed end to end: real app build (`.next/verify`) self-hosts asciiMono by sha256; demo `<html>` has 3 font variables; exported CSS has IBM Plex Sans; no Google font host in the export; smoke PASS with `data-corner-numeral` and `card-mini` on /spines |
| 2 | Lock the tracer with tests | 4bc2ff7 | Card variants, CornerNumeral tokens, compact wiring, fonts.ts/layout text, font size + sha256, OFL, card rule bodies. Includes the CornerNumeral fix below |
| 3 | Scanlines + rest of the v2 CSS (TDD) | d026dc6 (RED), 229420b (GREEN) | 39-token `:root`, v2 AA pairings on gradient end `#2e2f41`, all v2 rules |

## Verification

- `vitest run`: 125 files, 2392 tests pass
- `tsc --noEmit` and `biome check`: clean
- Demo build (verify-export rules) and smoke: PASS, 4 pages, zero /api requests, markers found
- Owner's dev server on 3001 and the python server on 3102 untouched; the app build went to `.next/verify`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] tailwind-merge dropped `leading-none` from CornerNumeral**
- **Found during:** Task 2
- **Issue:** The spec's `cn(base, SIZES[size])` lets tailwind-merge drop `leading-none`, because a following `text-*` font size overrides line-height. The lg numeral (`text-[10rem]`, which sets no line-height) would have used normal line-height and sat off its corner.
- **Fix:** Pass `SIZES[size]` first, then the base tokens. Same token set, and the test compares sorted whole tokens.
- **Files modified:** src/components/corner-numeral.tsx
- **Commit:** 4bc2ff7

**2. [Rule 3 - Blocking] Biome reformats the verbatim spec CSS**
- **Found during:** Tasks 1 and 3
- **Issue:** `biome check` (part of every verify) fails on the single-line spec values.
- **Fix:** Applied `biome check --write`. Declarations are unchanged, only line breaks differ. CSS tests collapse whitespace before matching.
- **Files modified:** src/app/globals.css
- **Commits:** aab384b, 229420b

## Human checks (end of phase)

- /spines Compact on port 3001: gradient cards, faint purple corner number, purple glow on hover, monospace lettering everywhere
- Any page: faint scanlines visible; clicks, checkboxes and drag-and-drop on Upload work as before

## Threat Flags

None. T-07-08, T-07-09 and T-07-10 mitigations are in place and tested (sha256 pin, no third-party font host in the export or at runtime, `pointer-events: none` on the overlay).

## Self-Check: PASSED

- All created files exist: fonts.ts, fonts/ascii_mono.woff2, fonts/OFL.txt, corner-numeral.tsx
- Commits aab384b, 4bc2ff7, d026dc6, 229420b are ancestors of HEAD
