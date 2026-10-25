---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 04
subsystem: spines-read-model
status: complete
tags: [bulk-import, read-model, review-status, fallback-filter, polling, demo, tdd]
requires:
  - src/lib/bulk-eligibility.ts (eligibilityOf, bulkItemPhaseOf, isCurrentBulkItem) from 06-01
  - src/lib/pressing.ts (countryMatch) from 06-01
  - bulk_runs / bulk_items and test/helpers/bulk-seed.ts from 06-02
  - getPreferredCountry, DemoAccount.preferredCountry from 06-03
provides:
  - SpineDto.bulk, SpinesResponse.bulk, counts.fallback, discogs.preferredCountry
  - src/lib/bulk-view.ts (summarizeRun, countryBadgeOf, isFallbackSpine, lookupOf)
  - src/server/bulk/queries.ts (bulkForSpines, latestBulkRun)
  - parseFallbackParam and getSpines opts.fallback; GET /api/spines?fallback=1
  - ReviewStatusInput.lookup
  - buildSpinesResponse opts.fallback (demo) and demo GET /api/spines ?fallback=1
affects: [06-05, 06-06, 06-07, 06-08, 06-09, 06-10, 06-11, 06-12]
tech-stack:
  added: []
  patterns: [one query per page via json_each(@ids) with ROW_NUMBER latest-row CTEs, pure client-safe summary shared by server and demo]
key-files:
  created:
    - src/lib/bulk-view.ts
    - src/lib/bulk-view.test.ts
    - src/server/bulk/queries.ts
    - src/server/bulk/queries.test.ts
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-04-task1-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-04-task2-red.json
  modified:
    - src/lib/scan-types.ts
    - src/lib/review-status.ts
    - src/lib/review-status.test.ts
    - src/server/scan/queries.ts
    - src/server/scan/queries.test.ts
    - src/app/api/spines/route.ts
    - src/demo/read-model.ts
    - src/demo/read-model.test.ts
    - src/demo/routes/read.ts
    - src/lib/spine-review.test.ts
    - src/components/spines-filter-bar.test.ts
key-decisions:
  - "A resolved item whose release is not in the run's country counts as a fallback whatever its import's phase; a resolved item whose import row is gone counts as changed"
  - "A current lookup comes right after not_on_discogs in reviewStatusOf: failed lookup is failed, finding is matched (E6), both superseding the latest import"
  - "discogsActive is also true while the latest run is running, so a spine the photo filter hides keeps /spines polling"
  - "The demo GET /api/spines passes ?fallback=1 like the real route (the pages wire it in 06-12)"
requirements-completed: [BULK-04, BULK-10, BULK-11]
metrics:
  duration: 8min
  completed: 2026-10-25
  tasks: 2
  files: 17
estimate:
  tokens: 90000
actuals:
  tokens: 16900
  tasks: 2
  commits: 4
plan_head_before: 696c386527dcbaaa677f803b42b52f0b52eddb0b
plan_head_after: 8dc31dfe873640e07a9e6d962417225c7f237247
commits: 4
coverage:
  - deliverable: "Each spine's bulk eligibility and current item on GET /api/spines (D-06)"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/bulk/queries.test.ts#getSpines spine.bulk"
        status: pass
  - deliverable: "Latest run summary survives reloads (D-15)"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/bulk/queries.test.ts#getSpines bulk run summary"
        status: pass
      - kind: test
        ref: "src/lib/bulk-view.test.ts#summarizeRun"
        status: pass
  - deliverable: "Lookup-aware review status and polling (BULK-11)"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/lib/review-status.test.ts#reviewStatusOf with a bulk lookup (BULK-11)"
        status: pass
      - kind: test
        ref: "src/server/scan/queries.test.ts#getSpines bulk lookups and the Fallback filter"
        status: pass
  - deliverable: "Fallback filter and count, D-19 combined countries, preferred country in the response"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/scan/queries.test.ts#?fallback=1 lists only fallback spines; USA & Canada is not one (D-19)"
        status: pass
      - kind: test
        ref: "src/lib/bulk-view.test.ts#countryBadgeOf"
        status: pass
      - kind: test
        ref: "src/demo/read-model.test.ts#bulk (eligibilityOf, Plan 06-04)"
        status: pass
---

# Phase 6 Plan 04: /spines bulk read model Summary

GET /api/spines now carries all the bulk state the UI needs. Each spine gets its eligibility and its current bulk item. The response gets the latest run's summary, a Fallback filter with its count, and the preferred country. The review status and polling now account for lookups that are queued, running or failed. The demo read model returns the same shapes.

## What was built

- **src/server/bulk/queries.ts**:
  - `bulkForSpines` runs one query per page. It returns each spine's latest item along with:
    - the run's country and the job status
    - the duplicate holder: photo name, `#n` and `samePhoto`
    - the spine's latest import
  - Items that `isCurrentBulkItem` rejects are dropped.
  - A failed item's failure is the recorded kind. With no recorded kind it is `interrupted` for a dead-job queued item, else `other`. Only kind `other` carries a reason, cut to 160 code points (T-06-11).
  - `latestBulkRun` reads the newest run's items with their item job, their import and that import's job, then calls `summarizeRun`.
- **src/lib/bulk-view.ts** (pure, client-safe):
  - `summarizeRun` returns the total and the counts of done, added, fallbacks, already in collection, duplicates, changed and failed, plus `running`.
  - `countryBadgeOf` only gives a badge when the spine's current import is the one its resolved item created. A combined country that includes the preferred one reads as preferred (D-19).
  - `isFallbackSpine` and `lookupOf`.
- **getSpines** sets `s.bulk = { ...eligibilityOf(s, item), item }` and passes `lookup: lookupOf(item)` to `reviewStatusOf`. It also adds:
  - the `?fallback` filter, ANDed with the other filters
  - `counts.fallback`, which covers the photo filter only
  - `discogsActive`, now also true for a finding item or a running run
  - `discogs.preferredCountry` and `bulk: latestBulkRun`
- **reviewStatusOf**: after the imported and not_on_discogs checks, a failed lookup gives `failed` and a finding lookup gives `matched`.
- **Route**: `parseFallbackParam` accepts only the exact value `'1'` (T-06-12).
- **Demo**: `eligibilityOf(s, null)` per spine, `bulk: null`, `lookup: null`, the same fallback filter and count, and `preferredCountry` from the account.

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | 422a8f6 | `tdd/06-04-task1-red.json`: RED_EVIDENCE_OK. Target "kind other carries its reason cut to 160 code points" failed on `expected undefined to be 'other'` | 0d1cf44 |
| 2 | cd6addb | `tdd/06-04-task2-red.json`: RED_EVIDENCE_OK. Target "a failed lookup with no import reads failed" failed on `expected 'pending' to be 'failed'` | 8dc31df |

Semantic assessment: each target ran and failed on its planned scalar assertion against stubs that compiled. The unfiltered RED runs failed 20 and 18 new tests on assertions, and every existing test passed. Targets with scalar assertions were chosen because a multi-line `toMatchObject` diff breaks the TAP classifier.

Tracer gate (auto mode): after GREEN, the full Task 1 `<verify>` was re-run. 55 tests passed and tsc was clean, so expansion continued.

## Verification

- Task 2 `<verify>`: 21 files and 282 tests passed. `tsc --noEmit` and `biome check` (657 files) are clean.
- Full `vitest run`: 1979 of 1980 tests passed. The one failure is the known timing-flaky `src/server/claude/cli.test.ts` process-group timeout test, which was left alone as instructed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Parity] The demo GET /api/spines passes `?fallback=1`**
- **Found during:** Task 2
- **Issue:** The demo route mirrors the real GET /api/spines, but it would have ignored `?fallback=1`. No later plan touches `src/demo/routes/read.ts`. Plan 06-12 only wires the pages.
- **Fix:** It passes `fallback: req.query.get('fallback') === '1'`. This is the same exact-`'1'` rule, written inline because the demo cannot import server-only modules.
- **Files modified:** src/demo/routes/read.ts
- **Commit:** 8dc31df

**2. [Scope] `discogsActive` is also true while the latest run is running**
- The plan lists this condition. It is noted here because it covers a spine the photo filter hides, which a test now pins.

## Known Stubs

None. The RED stubs were replaced in the GREEN commits. The demo spines have `item: null` and `bulk: null` on purpose until Plan 06-11.

## Threat Flags

None. The new `?fallback=` parameter and the failure text are covered by T-06-11 and T-06-12.

## Self-Check: PASSED

- All 6 created files exist.
- Commits 422a8f6, 0d1cf44, cd6addb and 8dc31df are ancestors of HEAD.
