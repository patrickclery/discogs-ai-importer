---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 11
subsystem: demo
tags: [demo, bulk-import, read-model, vitest, fixtures]

requires:
  - phase: 06-01
    provides: eligibilityOf, topMatchOf, isCurrentBulkItem, countryMatch, PressingOutcome, BulkItemDto
  - phase: 06-03
    provides: DemoAccount.preferredCountry
  - phase: 06-04
    provides: summarizeRun, countryBadgeOf, isFallbackSpine, lookupOf; demo buildSpinesResponse bulk/fallback fields
provides:
  - DemoBulkRun / DemoBulkItem and DemoState.bulkRuns / bulkItems
  - demo/fixtures/pressings.json canned pressing outcomes by shelf key
  - src/demo/ops/bulk.ts startBulk, BULK_STEP_MS, BULK_LOOKUP_MS
  - demo read model bulk fields (spine.bulk item, response.bulk, Fallback filter, status lane jobs)
affects: [06-06 demo bulk-import route, 06-12]

actuals:
  tokens: 9500
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Demo bulk outcomes are decided at startBulk and dated readyAt; the read model shows 'finding' until then"
    - "Hidden 'pressing' candidates carry the imported pressing; candidatesOf never lists them"

key-files:
  created:
    - src/demo/ops/bulk.ts
    - src/demo/ops/bulk.test.ts
    - demo/fixtures/pressings.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-11-task1-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-11-task2-red.json
  modified:
    - src/demo/store.ts
    - src/demo/seed.ts
    - src/demo/ops/imports.ts
    - src/demo/read-model.ts
    - src/demo/read-model.test.ts

key-decisions:
  - "Demo pressing candidate ids derive from the spine id (demo-spine-40 -> demo-cand-40-pressing-1408104), so a pristine shelf copy on another photo never collides"
  - "Demo retrySpine answers busy while the spine's pressing is being found, as the real retrySpine does"
  - "bulkItemPhaseAt and bulkFindingFor live in read-model.ts so imports.ts and bulk.ts share them without a circular import"

patterns-established:
  - "Demo bulk item: queued until lookupAt, running until readyAt, then its stored status"

requirements-completed: [BULK-12]

coverage:
  - id: D1
    description: "Demo bulk run from canned pressing outcomes: preferred, Canadian pressing, fallbacks, duplicate skip, D-20 failed-import spine"
    requirement: BULK-12
    verification:
      - kind: unit
        ref: "src/demo/ops/bulk.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Timestamp-derived timing, busy/nothing/skip rules, already_confirmed guard, zero fetch calls, fixture integrity"
    requirement: BULK-12
    verification:
      - kind: unit
        ref: "src/demo/ops/bulk.test.ts#makes no network request"
        status: pass
    human_judgment: false
  - id: D3
    description: "Demo read model bulk fields: spine.bulk item, response.bulk via summarizeRun, Fallback badge/filter, review status, status lane jobs and imports left"
    requirement: BULK-12
    verification:
      - kind: unit
        ref: "src/demo/read-model.test.ts#bulk fields (D-15, D-17, BULK-12)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-25
status: complete
plan_head_before: 1c7626ca765ffd54c68413f0d025f7e5f9f57415
plan_head_after: b39c342d42bd7df439e19ab63115db05c155d89d
---

# Phase 06 Plan 11: Demo Bulk Run Summary

**In-memory demo bulk import (startBulk) that resolves each pick at its readyAt from canned pressing outcomes, with the demo read model emitting the same spine.bulk, response.bulk (shared summarizeRun), Fallback and status-lane fields as the real one**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-25T02:32:22Z
- **Completed:** 2026-10-25T02:38:58Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- startBulk validates picks like the real eligiblePicks (first per spine, eligibilityOf, still the top match), answers busy while any item is finding and nothing when every pick is skipped.
- Each item's outcome is decided up front and dated readyAt: an exact-country top match is preferred, a canned pressing is imported through a hidden `pressing` candidate, there are fallback_no_master and fallback_no_version, a failed import with intent is reconciled as retried_earlier, and spine 31 is skipped as a duplicate of spine 29. Spine 42 (failed import, no intent) gets a new import.
- The demo read model shows finding until readyAt, the lookup-aware Matched status, the country badge and Fallback filter, response.bulk via summarizeRun, and finding items as Discogs-lane jobs and imports left.

## Task Commits

1. **Task 1: Tracer, a demo bulk run from canned pressing outcomes**: `9b4070d` (test), `b65b85c` (feat)
2. **Task 2: Demo read model serves every bulk field**: `44ba8c9` (test), `b39c342` (feat)

## Files Created/Modified

- `src/demo/ops/bulk.ts`: startBulk, eligiblePicks, the canned pressing resolution, timing constants
- `src/demo/ops/bulk.test.ts`: every Task 1 behavior, fixture integrity, a fetch spy
- `demo/fixtures/pressings.json`: canned outcomes for keys 40, 55, 06, 08 (pressing), 16 and 17 (no master)
- `src/demo/store.ts`, `src/demo/seed.ts`: DemoBulkRun, DemoBulkItem, empty bulk arrays, the `pressing` source
- `src/demo/ops/imports.ts`: DuplicateOf.spineId; startImport answers already_confirmed and retrySpine answers busy while finding
- `src/demo/read-model.ts`: bulkItemPhaseAt, bulkFindingFor, bulkItemOf, latestBulkRunAt, status-lane jobs, pressing filter
- `src/demo/read-model.test.ts`: the bulk read-model tests

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Demo retrySpine answers busy while a pressing is being found**
- **Found during:** Task 1
- **Issue:** Retry on spine 42 during its lookup would reschedule the old failed import while the bulk run had already planned a new one, giving the spine two imports. The real retrySpine returns busy for a finding item.
- **Fix:** retrySpine checks bulkFindingFor first. A test covers it.
- **Files modified:** src/demo/ops/imports.ts, src/demo/ops/bulk.test.ts
- **Committed in:** b65b85c

**2. [Rule 3 - Blocking] RED commit for Task 1 carried the types and a startBulk stub**
- **Found during:** Task 1 RED
- **Issue:** Without the module the tests fail to load, which is INVALID_RED, not a real RED.
- **Fix:** The test commit includes the store types, the seed arrays, the fixture and a stub startBulk, so the target test fails on its assertion.
- **Committed in:** 9b4070d

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Parity with the real retry rule. No scope creep.

## TDD Gate Compliance

- Task 1 RED: `startBulk > starts every eligible pick of the six-spine run` failed on `expected 'nothing' to be 'ok'` (stub). RED_EVIDENCE_OK. Semantic check: the target ran and failed on the planned assertion. GREEN `b65b85c`.
- Task 2 RED: `bulk fields > response.bulk summarizes the latest run with summarizeRun` failed on `expected undefined to be true` (bulk was still null). RED_EVIDENCE_OK. Semantic check: the planned assertion failed for the intended reason. GREEN `b39c342`.
- No REFACTOR commits were needed.

## Issues Encountered

None. The full suite passes (115 files, 2048 tests), and tsc and biome are clean.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

Plan 06-06 can wire the demo POST /api/spines/bulk-import to startBulk next to the real route.

## Self-Check: PASSED

---
*Phase: 06-bulk-canada-auto-import-with-compact-review-cards*
*Completed: 2026-10-25*
