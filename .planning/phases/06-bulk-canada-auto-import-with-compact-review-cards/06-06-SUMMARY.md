---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 06
subsystem: api
tags: [bulk-import, route-handler, demo, sqlite, vitest]
status: complete

requires:
  - phase: 06-01
    provides: BULK_START_BODY, BulkStartResponse, eligibilityOf, topMatchOf
  - phase: 06-02
    provides: startBulkRun, openBulkItemCount, resolve_pressing job
  - phase: 06-03
    provides: getPreferredCountry
  - phase: 06-04
    provides: bulkForSpines
  - phase: 06-05
    provides: retrySpine kind 'lookup'
  - phase: 06-11
    provides: demo startBulk
provides:
  - POST /api/spines/bulk-import (201 { runId, started, skipped }; 409 not_connected / bulk_running / nothing_to_import)
  - src/server/bulk/picks.ts eligiblePicks (server re-check of picks)
  - src/demo/routes/bulk.ts demo twin, spread as bulkRoutes
affects: [06-08, 06-09, 06-10, 06-12]

actuals:
  tokens: 6600
  tasks: 2
  commits: 4
plan_head_before: f2b0bda6efffc0fa5ee7e5020d868c3a5140f5eb
plan_head_after: 0aade235bddcb2de2682d14c826e096169928652

tech-stack:
  added: []
  patterns:
    - "Busy check, pick validation and startBulkRun run in one outer IMMEDIATE transaction; startBulkRun's own transaction nests as a savepoint"
    - "A pick is accepted only if eligibilityOf passes AND the picked candidate is still topMatchOf(spine)"

key-files:
  created:
    - src/app/api/spines/bulk-import/route.ts
    - src/app/api/spines/bulk-import/route.test.ts
    - src/server/bulk/picks.ts
    - src/demo/routes/bulk.ts
    - src/demo/routes/bulk.test.ts
  modified:
    - src/app/api/spines/retry-failed/route.test.ts
    - src/demo/routes.ts

key-decisions:
  - "eligiblePicks dedupes by spineId before loading, so a repeated spine counts as skipped without hitting the unique open-item index"
  - "nothing_to_import is decided before startBulkRun, so an all-skipped start writes no bulk_runs row"

requirements-completed: [BULK-05, BULK-11, BULK-12]

duration: 12min
completed: 2026-10-24
---

# Phase 6 Plan 06: Bulk Start Route Summary

**POST /api/spines/bulk-import re-checks each pick (eligibility plus still the top match) and starts one paced run in a single IMMEDIATE transaction. A demo twin answers the same request through startBulk, with the same codes and messages.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-10-24
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- The real start route: strict JSON body (415/400), not_connected with Connect/Reconnect wording, 409 bulk_running while any lookup is queued, 409 nothing_to_import with no run row, 201 `{ runId, started, skipped }`. It makes no Discogs request (a fetch spy proves it).
- `eligiblePicks`: it dedupes picks and loads the spines with the same discogs/imports/bulk summaries as getSpines. Stale top matches and imported, orphaned and unknown spines are skipped. A failed import (D-20) and a low-confidence spine (D-16) are accepted.
- An end-to-end tracer: two picks lead to two resolve_pressing jobs, which become two pending imports.
- retry-failed now has coverage for re-running a failed pressing lookup (BULK-11).
- The demo route is wired into ROUTES as `bulkRoutes`. The routes-coverage gate is green.

## Task Commits

1. **Task 1: Tracer, bulk start route** - `2081cdd` (test, RED), `c30ee09` (feat, GREEN)
2. **Task 2: Demo route** - `4d86fc5` (test, RED), `0aade23` (feat, GREEN)

## TDD Gate Compliance

- Task 1 RED `2081cdd`: the suite failed with "Cannot find module './route'". The retry-failed lookup case passed at RED because 06-05 had already implemented retrySpine kind 'lookup', so that case is coverage only.
- Task 1 GREEN `c30ee09`: 15/15 pass.
- Task 2 RED `4d86fc5`: 5 route tests failed and routes-coverage failed (no demo route yet).
- Task 2 GREEN `0aade23`: the src/demo suite passes, 207/207.
- No REFACTOR commits were needed.

## Tracer Feedback Gate

Auto mode: Task 1's `<verify>` was re-run end-to-end after the GREEN commit (vitest plus tsc). It passed, and Task 2 continued from there.

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

**1. [Rule 1 - Test bug] The stale-top-match seed did not actually change the top match**
- **Found during:** Task 1 GREEN
- **Issue:** A second `seedTopCandidate` adds a rank-0 auto candidate, but D-10 ordering sorts auto candidates by catno_match, then rank, then id, not by newest search. So the original candidate could stay on top.
- **Fix:** A test helper `outrank()` seeds the newer candidate with `catno_match = 1`, so it sorts first.
- **Files modified:** src/app/api/spines/bulk-import/route.test.ts
- **Commit:** c30ee09

## Issues Encountered
None. The full suite passes: 117 files, 2061 tests. tsc and biome are clean.

## Next Phase Readiness
The bulk UI plans (Start button and confirm dialog) can POST to `/api/spines/bulk-import` in both the real app and the demo.

## Self-Check: PASSED
- All 5 created files exist on disk.
- Commits 2081cdd, c30ee09, 4d86fc5 and 0aade23 are ancestors of HEAD.
