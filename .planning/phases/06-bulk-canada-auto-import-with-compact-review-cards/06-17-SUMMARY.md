---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 17
subsystem: demo
tags: [demo, bulk, fallback-country, gap-closure, tdd]
status: complete

requires:
  - phase: 06-13
    provides: "distinctFallback, countryMatch, choosePressing fallback-tier order"
  - phase: 06-14
    provides: "DemoAccount.fallbackCountry (seeded 'US') and the demo Settings field"
provides:
  - "DemoBulkRun.fallbackCountry, snapshotted at startBulk via distinctFallback (null when equal to the preferred country)"
  - "CannedPressing 'fallback_pressing' outcome; pressings.json key 53 -> US release 2848589"
  - "demo resolveAt fallback tier: exact top -> exact canned fallback pressing -> combined top -> fallback_no_version"
affects: [06-18]

actuals:
  tokens: 4200
  tasks: 2
  commits: 4
plan_head_before: 2d45b8da964aa689b777245b388a917f77111fc6
plan_head_after: 979dd15289f82678d257000c8b6527fbf88cddae

tech-stack:
  added: []
  patterns:
    - "fallbackTier() is the demo twin of chooseFallbackTier, reached only where the preferred tier used to end in fallback_no_version"

key-files:
  created: []
  modified:
    - src/demo/store.ts
    - src/demo/ops/bulk.ts
    - src/demo/ops/bulk.test.ts
    - demo/fixtures/pressings.json

key-decisions:
  - "Key 53 (Guttermouth) is the canned fallback pressing as planned: listed, eligible, Japan top match, recorded US candidate 2848589 with a cover"
  - "A fallback_pressing is used only when its recorded candidate's country is exactly the run's fallback country, so changing the demo Fallback country to UK stops it being picked"

metrics:
  duration: 4min
  completed: 2026-10-25
---

# Phase 6 Plan 17: Demo Fallback-Country Tier Summary

Demo bulk runs now snapshot the fallback country (US by default, none when it equals Canada) and pick in the same order as the real job: Canada, then the fallback country, then the top match. Everything comes from canned data. Key 53 (Guttermouth) now imports its US release 2848589 as `fallback_country`. Key 07 keeps its US top match as `fallback_country`. Key 00 keeps its Hong Kong top match as `fallback_no_version`.

## What Was Built

- `DemoBulkRun.fallbackCountry` is set at `startBulk` from `distinctFallback(preferredCountry, fallbackCountry)`.
- `CannedPressing` gains `{ outcome: 'fallback_pressing'; releaseId }`. `pressings.json` adds key 53 and explains the new outcome in its `_note`.
- In `resolveAt`, the preferred tier is unchanged: exact Canada, then a canned Canadian pressing, then `fallback_no_master`, then a combined Canada match. Where it used to end in `fallback_no_version`, it now calls `fallbackTier()`. That function keeps an exact fallback-country top match, then imports an exact canned fallback pressing through the hidden `demo-cand-<key>-pressing-<id>` candidate, then keeps a combined top match that names the fallback country. Otherwise the outcome is `fallback_no_version`.
- The fixture test now accepts `fallback_pressing` entries. Each must name a recorded candidate of the same key, from outside Canada, with a cover. Canadian `pressing` entries still have to be from Canada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan fact correction] Spine 42's outcome is now `fallback_country`**
- **Found during:** Task 2
- **Issue:** The plan says key 42 keeps "retried_earlier". In fact its existing test expected `fallback_no_version`, because its failed import does not take the D-20 reconcile path. Its top match is from the US. Under rule 1 of the fallback tier (a top match exactly from the fallback country is kept), the real job gives it `fallback_country`.
- **Fix:** The existing spine-42 test now expects `fallback_country`. It still gets a new import, so D-20 is unchanged. The "fallback equal to Canada" test checks that 42 is still `fallback_no_version` when there is no fallback tier.
- **Files modified:** src/demo/ops/bulk.test.ts
- **Commit:** 3c31782

## Verification

- `vitest run src/demo`: 18 files, 219 tests pass. `tsc --noEmit` exits 0. `biome check` is clean on all 687 files.
- Full `vitest run`: 2275/2276 pass. The one failure is `src/server/claude/cli.test.ts` "times out a sleeping child in under 4 s", a timing test unrelated to this plan. It fails only under full-suite load and passes alone (41/41).
- Zero network: a fetch spy sees no calls across a run that covers RUN_KEYS plus 53, 07 and 00.
- The tracer gate (end-of-phase mode, automated verify) passed on re-run after Task 1.
- The human check (demo playback badges "Fallback: US" on Guttermouth and "Fallback: Hong Kong" on Massive Attack) is left for phase UAT. The wording comes from 06-18.

## TDD Gate Compliance

- Task 1: RED 8f19b5f (4 failing), then GREEN a1ff773.
- Task 2: RED 3c31782 (5 failing), then GREEN 979dd15.

## Commits

- 8f19b5f test(06-17): add failing tests for the demo fallback-country snapshot and US pressing
- a1ff773 feat(06-17): demo bulk runs snapshot the fallback country and import its canned pressing
- 3c31782 test(06-17): add failing tests for the demo fallback tier order
- 979dd15 feat(06-17): demo fallback tier follows the real job's order

## Self-Check: PASSED

- src/demo/store.ts, src/demo/ops/bulk.ts, src/demo/ops/bulk.test.ts, demo/fixtures/pressings.json all exist and are modified.
- Commits 8f19b5f, a1ff773, 3c31782 and 979dd15 are all ancestors of HEAD.
