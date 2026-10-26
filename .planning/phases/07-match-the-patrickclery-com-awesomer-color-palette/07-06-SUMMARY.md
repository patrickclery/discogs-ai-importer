---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 06
subsystem: ui-theme
status: complete
tags: [theme, awesomer, terminal, markdown, wordmark, header, gap-closure]
requires: [07-04]
provides:
  - "MdPrefix({ marker: '##' | '>' }): aria-hidden select-none mauve prefix (for 07-08 Settings and /spines)"
  - "WORDMARK (12 lines, ANSI Shadow, DISCOGS over AI IMPORTER) and AsciiWordmark()"
  - "/upload (app and demo): wordmark, gradient w-fit h1, 80ch > intro"
  - "PhotoStatusList: mini card titled ## Photos with a > empty line"
  - "Header logo: mauve, glow-intense, cursor-blink _ cursor, text from lg"
affects: [07-07, 07-08]
tech-stack:
  added: []
  patterns:
    - "Async server page and post-mount demo page asserted on source text; components via renderToStaticMarkup"
    - "Wordmark built from single-quoted literals joined with '\\n' so trailing spaces survive formatters"
key-files:
  created:
    - src/components/md-prefix.tsx
    - src/components/ascii-wordmark.tsx
    - src/components/terminal-touches.test.ts
  modified:
    - src/app/upload/page.tsx
    - src/app/upload/page.demo.tsx
    - src/components/photo-status-list.tsx
    - src/components/app-header.tsx
    - src/components/app-header.test.ts
decisions:
  - "Wordmark lines extracted programmatically from the UI-SPEC text fence, so the glyphs match the spec byte for byte"
requirements-completed: [THEME-07, THEME-08, THEME-09, THEME-10]
metrics:
  duration: "~6 min"
  completed: 2026-10-25
actuals:
  tokens: 3830
  tasks: 2
  commits: 4
plan_head_before: d35b8f23df2352de291a85d290e90650dc3a033d
plan_head_after: caa55ebd988c4bdb75f110db0d96aab552920556
---

# Phase 7 Plan 06: /upload terminal touches and glowing header logo Summary

/upload now opens with a mauve, glowing asciiMono DISCOGS / AI IMPORTER wordmark (from 640px, aria-hidden) above a mauve-to-sky gradient title and a `>` prompt intro capped at 80ch. The Photos panel is a gradient mini card titled `## Photos`, and the header logo is mauve with an intense glow and a `_` cursor that blinks 5 times (text from 1024px).

## Tasks

| # | Task | Commits | Notes |
|---|------|---------|-------|
| 1 | Wordmark, gradient title, `>` intro, `## Photos` mini card (TDD) | 4241dfe (RED), 48c341c (GREEN) | MdPrefix and AsciiWordmark created; both /upload pages and PhotoStatusList updated, wording unchanged |
| 2 | Glowing mauve logo with 5-blink cursor (TDD) | 06210b3 (RED), caa55eb (GREEN) | `text-primary` link, `glow-intense hidden lg:inline` text span, aria-hidden `cursor-blink` `_` |

## Verification

- `vitest run` full suite: 127 files, 2420 tests pass; `tsc --noEmit` clean; `biome check src/app src/components` clean
- Demo build: verify-export PASS (394 files, rules a-i); smoke PASS on 4 pages, zero /api requests, with ascii-art, gradient-text, card-mini, cursor-blink and glow-intense found on /upload
- Demo build ran in its scratch copy; the dev server on 3001 and the python server on 3102 were untouched

## TDD Gate Compliance

- Task 1: RED 4241dfe (module-not-found failure), GREEN 48c341c (16 tests pass)
- Task 2: RED 06210b3 (2 new logo tests failing, existing header tests passing), GREEN caa55eb (5 tests pass)
- No refactor commits needed

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Human checks (end of phase)

- /upload wordmark rendering in asciiMono and its disappearance below 640px
- Logo glow, 5-blink cursor timing, icon-only header below 1024px, no blinking under Reduce motion

## Self-Check: PASSED

- All 3 created and 5 modified files exist; commits 4241dfe, 48c341c, 06210b3, caa55eb are ancestors of HEAD
