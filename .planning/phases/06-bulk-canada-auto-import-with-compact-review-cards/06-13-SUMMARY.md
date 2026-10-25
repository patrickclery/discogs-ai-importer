---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 13
subsystem: pressing-rules
tags: [discogs, pressing, fallback-country, gap-closure, tdd]
status: complete

requires:
  - phase: 06-01
    provides: "choosePressing, countryMatch, canonicalCountry, needsLookup, PRESSING_OUTCOMES"
provides:
  - "distinctFallback(preferred, fallback): canonical fallback country or null (the one 'is there a fallback tier' rule)"
  - "choosePressing input fallback + fallbackVersions; Preferred -> Fallback -> top match"
  - "needsFallbackLookup({ top, preferred, fallback, versions }): whether the second versions GET can change the result"
  - "PressingOutcome 'fallback_country'"
affects: [06-14, 06-16, 06-17, 06-18]

actuals:
  tokens: 5100
  tasks: 2
  commits: 4
plan_head_before: 6c7d407f511b4784f38bb61f5d111ce9692ff01a
plan_head_after: 86eb179e827bb718355fb05bb0fdc434136d7162

tech-stack:
  added: []
  patterns:
    - "One internal rankTier(top, country, versions) ranks both tiers with the same key, synthetic combined-country entry and D-21 guard"
    - "needsFallbackLookup derives from rankTier instead of duplicating tier logic"

key-files:
  created: []
  modified:
    - src/lib/pressing.ts
    - src/lib/pressing.test.ts
    - src/lib/bulk-types.ts

key-decisions:
  - "A combined-fallback top match (e.g. 'US & Europe' with fallback US) mirrors D-19 in the second tier: whenever it is kept (fallback answer absent, unusable, empty of exact US, or its pick fails the guard) the outcome is fallback_country"
  - "fallbackVersions absent still answers fallback_no_version for a non-combined top; needsFallbackLookup stays true for a combined-fallback top because an exact US version could beat it"

metrics:
  duration: ~10min
  completed: 2026-10-25
---

# Phase 6 Plan 13: Fallback-country tier in choosePressing Summary

`choosePressing` now goes Preferred -> Fallback -> top match: when Canada has no usable version it ranks a second, US-filtered versions answer with the same shared key, returning the new `fallback_country` outcome. `needsFallbackLookup` says when that second Discogs request is worth sending.

## What was built

- **bulk-types.ts:** `'fallback_country'` added to `PRESSING_OUTCOMES` after `'preferred'`, doc comment extended. Text column, no migration.
- **pressing.ts:**
  - `distinctFallback`: canonical spelling, or null when blank, missing or equal to the preferred country (US = USA).
  - `rankTier`: the old ranking body extracted as a helper (official, exact vs combined, CD, label, year, id; synthetic combined top; D-21 guard on the winner). The preferred tier calls it exactly as before.
  - `chooseFallbackTier`: runs only when the preferred tier is empty. A top match exactly from the fallback country is used as is. An unusable answer or a guard failure keeps the top match (`fallback_unusable_master`). An empty pool or absent answer gives `fallback_no_version`, and a winner gives `{ use: 'version', outcome: 'fallback_country' }`.
  - `needsFallbackLookup`: true only with a distinct fallback, a usable array answer, a master, a top not exactly from the fallback country, and an empty preferred tier.
- With no fallback (absent, blank or the same as preferred), every answer is unchanged. All pre-existing tests passed without edits.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 RED | 58ad9d4 | test(06-13): add failing tests for the fallback-country tier |
| 1 GREEN | 598fb98 | feat(06-13): fallback-country tier in choosePressing |
| 2 RED | 046cc3e | test(06-13): add failing tests for fallback tier rules and needsFallbackLookup |
| 2 GREEN | 86eb179 | feat(06-13): finish fallback tier rules and add needsFallbackLookup |

## TDD Gate Compliance

Both tasks had a RED commit (9 failing tests, then 18) before their GREEN commit. The tracer gate (Task 1) was run again under auto mode with vitest and tsc green before Task 2 began.

## Verification

- `vitest run src/lib`: 460/460 passed. `tsc --noEmit`: 0 errors. `biome check src/lib`: clean.
- Full `npx vitest run`: 2222/2222 passed. One earlier run failed `cli.test.ts > escalates to SIGKILL after 3 s`, a timing test that is flaky under load and unrelated to this plan. It passed when run alone and in the full rerun.

## Deviations from Plan

**1. [Rule 2 - Consistency] The combined-fallback top mirrors D-19 on every keep-the-top path**
- **Found during:** Task 2
- **Issue:** The plan says a combined-fallback top is kept with `fallback_country` only when no exact US version exists. It did not say what happens when the fallback answer is absent or unusable, or when its pick fails the guard. The preferred tier maps all of those to `preferred` for a combined top.
- **Fix:** In the fallback tier those paths return `fallback_country` for a combined-fallback top, the same way the preferred tier handles a combined top. For a non-combined top they return the outcomes the plan specified (`fallback_no_version`, `fallback_unusable_master`). Tests cover both.
- **Commit:** 046cc3e / 86eb179

## Known Stubs

None.

## Self-Check: PASSED
