---
phase: 07-match-the-patrickclery-com-awesomer-color-palette
plan: 08
subsystem: ui-theme
status: complete
tags: [theme, awesomer, markdown, settings, spines, gap-closure]
requires: [07-04, 07-05, 07-06, 07-07]
provides:
  - "Settings: mini cards numbered 1 Claude CLI, 2 Discogs, 3 Data folder, 4 Developer (demo 1-3), ## titles"
  - "Gradient h1 and > intro (80ch) on /settings and /spines, app and demo"
  - "Discogs card explanatory paragraphs in font-prose"
  - "PhotoSection h2 reads ## <filename>, no numeral (Owner Decision 4)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Shared cards own their numeral (ClaudeCliCard 1, DiscogsCard 2); page-inline cards set 3 and 4"
    - "gradient-text w-fit confined to the three page h1s and demo twins, enforced by a src scan test"
key-files:
  created:
    - src/components/markdown-touches.test.ts
  modified:
    - src/components/claude-cli-card.tsx
    - src/components/discogs-card.tsx
    - src/app/settings/page.tsx
    - src/app/settings/page.demo.tsx
    - src/components/spines-view.tsx
    - src/components/photo-section.tsx
decisions:
  - "Numerals for the shared Claude CLI and Discogs cards live inside the components, so app and demo stay in the same order"
requirements-completed: [THEME-07, THEME-08, THEME-09, THEME-10]
metrics:
  duration: "~4 min"
  completed: 2026-10-25
actuals:
  tokens: 4800
  tasks: 2
  commits: 4
plan_head_before: edbc21b2e1a7511da41e84158f8554e0ec16ea3f
plan_head_after: d09522ee5e1f6af7ea92caa2c3fd12fb7a4ba345
---

# Phase 7 Plan 08: Numbered settings cards, gradient titles and ## headings Summary

Settings now reads as numbered setup steps: gradient mini cards titled `## Claude CLI` (1), `## Discogs` (2), `## Data folder` (3) and `## Developer` (4, app only), under a mauve-to-sky title and a `>` intro. /spines gets the same title and intro treatment, photo group headings read `## <filename>` with no numeral, and the Discogs explanations are in Plex. The full suite, both builds and headless smoke all pass with the whole awesomer look in place.

## Tasks

| # | Task | Commits | Notes |
|---|------|---------|-------|
| 1 | Numbered `##` settings cards, gradient title, `>` intro, Plex Discogs prose (TDD) | 981c753 (RED), 2a410c7 (GREEN) | Wording unchanged; demo has no card 4 |
| 2 | Gradient Spines title, `>` counts intro, `##` photo headings (TDD) | b5ceb41 (RED), d09522e (GREEN) | h2 keeps id, truncate and title; no isolate or numeral |

## Verification

- `vitest run`: 128 files, 2448 tests pass
- `tsc --noEmit` clean; `biome check` clean (698 files)
- `NEXT_DIST_DIR=.next/verify next build` succeeded (dev server on 3001 untouched)
- Demo build: verify-export PASS (394 files, rules a-i); no Google Fonts URLs in the export
- Smoke PASS on 4 pages, zero /api requests, all markers found: ascii-art and cursor-blink on /upload; gradient-text, data-corner-numeral and card-mini on /spines and /settings; demo-user on /settings

## TDD Gate Compliance

- Task 1: RED 981c753 (10 failing), GREEN 2a410c7 (37 pass incl. preferred-country-field)
- Task 2: RED b5ceb41 (4 failing), GREEN d09522e (26 pass incl. spines-view and photo-section)
- No refactor commits needed

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Human checks (end of phase)

- /settings: gradient title, purple `>` intro, `## ` titles and faint corner numbers 1-4 on the cards
- /spines: gradient title, `>` intro, `## IMG_….jpg` headings with no number; plus the UI-SPEC backstop checks listed in the plan (header over bright photos, long titles, responsive fit, scanlines over crops, demo fidelity)

## Self-Check: PASSED

- markdown-touches.test.ts and all 6 modified files exist; commits 981c753, 2a410c7, b5ceb41, d09522e are ancestors of HEAD
