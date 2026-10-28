---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 18
subsystem: ui
tags: [bulk, fallback-country, copy, demo, gap-closure, tdd]
status: complete

requires:
  - phase: 06-13
    provides: "distinctFallback, the fallback_country outcome"
  - phase: 06-14
    provides: "getFallbackCountry/setFallbackCountry and the Settings field"
  - phase: 06-16
    provides: "bulk_runs.fallback_country snapshot (migration 0005)"
  - phase: 06-17
    provides: "DemoBulkRun.fallbackCountry"
provides:
  - "BulkItemDto.fallbackCountry from bulk_runs.fallback_country (real) and DemoBulkRun.fallbackCountry (demo)"
  - "SpinesResponse.discogs.fallbackCountry (real and demo)"
  - "fallbackLine/findingLine/dialogBody that name the fallback country"
  - "06-UI-SPEC amendment for G-06-side-1 and G-06-9"
affects: [06-verify-work]

actuals:
  tokens: 7800
  tasks: 2
  commits: 4
plan_head_before: 1f4d9bc2aed4212be06cd44ab9317e728477b626
plan_head_after: f775ee6ff9d6dc8a049a3aa031608d02fa1881d1

tech-stack:
  added: []
  patterns:
    - "soughtPhrase(): one helper decides 'Canadian pressing' vs the pair phrase, gated on distinctFallback, shared by fallbackLine and findingLine"

key-files:
  created: []
  modified:
    - src/lib/bulk-types.ts
    - src/lib/scan-types.ts
    - src/server/bulk/queries.ts
    - src/server/scan/queries.ts
    - src/demo/read-model.ts
    - src/lib/bulk-copy.ts
    - src/components/bulk-import-dialog.tsx
    - src/components/bulk-import-bar.tsx
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-UI-SPEC.md

key-decisions:
  - "The fallback_country line names only the preferred country it missed ('No Canadian pressing, used US'); only fallback_no_version uses the pair phrase, because only there were both countries tried and missed"
  - "A demo item with no run falls back to distinctFallback of the live account settings, mirroring the preferredCountry fallback"

metrics:
  duration: 8min
  completed: 2026-10-25
---

# Phase 6 Plan 18: Fallback-Country Badges and Copy Summary

Bulk cards, the finding line and the confirm dialog now name the fallback country, in the app and in the demo. A US import reads "No Canadian pressing, used US". A spine with neither pressing reads "No Canadian or US pressing, used Hong Kong". The dialog says the US CD pressing is the second choice. This closes G-06-side-1 on screen.

## What Was Built

- `BulkItemDto.fallbackCountry`: the real read model selects `r.fallback_country`, and the demo read model uses the run's snapshot.
- `SpinesResponse.discogs.fallbackCountry`: the real response uses `getFallbackCountry()` and the demo uses `account.fallbackCountry`. `BulkImportBar` passes it to `BulkImportDialog`, which now requires the `fallbackCountry` prop.
- `bulk-copy.ts`:
  - `fallbackLine` gets an explicit `fallback_country` case. The `fallback_no_version` case uses the pair phrase.
  - `findingLine` reads "Looking for the Canadian or US pressing…".
  - `dialogBody(country, fallback, lowConfidence)` adds "or else for its US CD pressing" and "If Discogs lists neither…".
  - All of these keep today's text when `distinctFallback` gives null.
- `cdPressingPhrase` now uses the new `demonymOf` helper (a small refactor).
- 06-UI-SPEC.md has an "Amendment: gap closure (G-06-side-1, G-06-9)" section. It covers the Fallback country field, the copy table and the wrapping status tabs.
- Tests pin the behavior: `countryBadgeOf` gives `Fallback: US` for a US `fallback_country` import, and `summarizeRun` counts it in fallbacks. bulk-view.ts itself did not change.

## TDD Gate Compliance

- Task 1: RED `eee6899` (8 failing, all for the missing field or copy), then GREEN `7f62d54`.
- Task 2: RED `dd8cf65` (7 failing), then GREEN `f775ee6`.

## Verification

- `vitest run`: 121 files and 2295 tests pass. `tsc --noEmit` exits 0. `biome check` is clean.
- The tracer gate (auto mode) re-ran Task 1's verify end to end, and it passed.
- The human check (a real Discogs run with the owner's account) goes to end-of-phase UAT, per `human_verify_mode: end-of-phase`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Accuracy] The demo expected DTO uses 'US', not null**
- **Found during:** Task 1
- **Issue:** The plan said to add `fallbackCountry: null` to every expected DTO. But demo runs snapshot the seeded fallback `US`, so null would be an untruthful expectation in read-model.test.ts.
- **Fix:** The expected value is `'US'`. A separate case covers null, for a run started with a fallback equal to Canada.
- **Commit:** eee6899

## Known Stubs

None.

## Self-Check: PASSED
