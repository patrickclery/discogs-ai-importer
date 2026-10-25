---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 05
subsystem: bulk-import-server
status: complete
tags: [discogs, bulk-import, sqlite, jobs, retry, recovery, tdd]
requires:
  - phase: 06-01
    provides: bulkItemPhaseOf, isCurrentBulkItem (src/lib/bulk-eligibility.ts)
  - phase: 06-02
    provides: bulk_items, RESOLVE_PRESSING_JOB_TYPE, getBulkItem, failBulkItem, runResolvePressing, test/helpers/bulk-seed.ts
provides:
  - retryBulkItem and latestBulkItemFor (src/server/bulk/store.ts)
  - RetrySpineResult kind 'lookup'; POST /api/spines/{id}/retry answers 201 { kind 'lookup', itemId }
  - markInterruptedLookups and INTERRUPTED_LOOKUP_REASON (src/server/bulk/recovery.ts), on the maintenance list
  - IMPORTS_LEFT_SQL counts resolve_pressing jobs
affects: [06-06, 06-07, 06-08, 06-09, 06-10, 06-11, 06-12]
tech-stack:
  added: []
  patterns: [dedupe-key reuse or release on retry (enqueueImport pattern) for pressing:{itemId}, current bulk item checked before the import in retrySpine]
key-files:
  created:
    - src/server/bulk/store.test.ts
    - src/server/bulk/recovery.ts
    - src/server/bulk/recovery.test.ts
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-05-task1-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-05-task2-red.json
  modified:
    - src/server/bulk/store.ts
    - src/server/imports/store.ts
    - src/server/imports/store.test.ts
    - src/app/api/spines/[id]/retry/route.ts
    - src/app/api/spines/[id]/retry/route.test.ts
    - src/server/jobs/handlers/index.ts
    - src/server/discogs/status.ts
    - src/server/discogs/status.test.ts
key-decisions:
  - "retrySpine checks the spine's current bulk item before its import: a failed lookup (including a queued item whose job died) is re-run as kind lookup, a lookup still finding answers busy, anything else falls through to the unchanged import and search rules"
  - "retryBulkItem reuses a queued or running pressing:{itemId} holder and otherwise releases the finished holder's key before enqueueing, so two retries make exactly one job"
  - "retryBulkItem throws when the item row is missing rather than silently enqueueing an orphan job"
requirements-completed: [BULK-11]
coverage:
  - id: D1
    description: "Retry import on a failed lookup re-runs the lookup on the same item under one job, then imports"
    requirement: BULK-11
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#retrySpine on a bulk lookup (BULK-11)"
        status: pass
      - kind: unit
        ref: "src/server/bulk/store.test.ts#retryBulkItem (BULK-11)"
        status: pass
      - kind: integration
        ref: "src/app/api/spines/[id]/retry/route.test.ts#201 kind lookup for a failed pressing lookup, which goes back in line"
        status: pass
    human_judgment: false
  - id: D2
    description: "A lookup whose job died is marked failed by the maintenance hook, keeping an earlier error kind, with no request"
    requirement: BULK-11
    verification:
      - kind: unit
        ref: "src/server/bulk/recovery.test.ts#markInterruptedLookups"
        status: pass
    human_judgment: false
  - id: D3
    description: "The header's imports.left count includes queued and running pressing lookups"
    requirement: BULK-11
    verification:
      - kind: unit
        ref: "src/server/discogs/status.test.ts#imports.left counts queued and running resolve_pressing jobs too"
        status: pass
    human_judgment: false
  - id: D4
    description: "Existing Retry behaviour for imports and searches is unchanged"
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#retrySpine (REV-04, D-13)"
        status: pass
      - kind: unit
        ref: "src/server/imports/store.test.ts#one add_to_collection enqueue site (IMP-01 guard)"
        status: pass
    human_judgment: false
estimate:
  tokens: 60000
actuals:
  tokens: 7500
  tasks: 2
  commits: 4
plan_head_before: 5c1c254e5b3768fe82163bb962127910557c67c1
plan_head_after: c4f786f3d0915d0537971cc3df2722a8f8d37aed
commits: 4
duration: 5min
completed: 2026-10-25
---

# Phase 6 Plan 05: Lookup failure, retry and crash safety Summary

**A failed pressing lookup is retried by Retry import (and Retry all failed) on the same bulk item under its `pressing:{itemId}` job key; a lookup whose job died is marked failed on the next lease tick; and the header's "left" count includes lookups.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-25T02:15:47Z
- **Completed:** 2026-10-25T02:20:50Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- `retryBulkItem(db, itemId)` puts the item back to queued with its error cleared. A queued or running holder of `pressing:{itemId}` is reused. A finished holder gives up its key before a new `resolve_pressing` job is enqueued. The run keeps its country.
- `latestBulkItemFor(db, spineId)` returns the newest item with its job's status.
- `retrySpine` now checks the current bulk item first (`isCurrentBulkItem` against the latest import):
  - failed (`bulkItemPhaseOf`, so a queued item with a dead job counts) returns `{ status: 'ok', kind: 'lookup', itemId, jobId }`
  - finding returns busy
  - anything else falls through to the old import and search rules
- The retry route maps kind lookup to `201 { kind: 'lookup', itemId }`.
- `markInterruptedLookups()` is one UPDATE on queued items whose job failed or was cancelled. It keeps any earlier `error_kind` and reason (otherwise it records `interrupted` and `INTERRUPTED_LOOKUP_REASON`). It runs last in the maintenance list.
- `IMPORTS_LEFT_SQL` now counts `type IN ('add_to_collection', 'resolve_pressing')`. The IMP-01 enqueue-site regex still matches only `imports/store.ts`.

## Task Commits

1. **Task 1 (tracer): Retry import on a failed lookup re-runs the lookup**: `6960843` (test, RED) and `5eae051` (feat, GREEN)
2. **Task 2: Abandoned lookups end failed, header counts lookups**: `cacb3a2` (test, RED) and `c4f786f` (feat, GREEN)

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | 6960843 | `tdd/06-05-task1-red.json`: RED_EVIDENCE_OK. The target "two retries in a row on a failed lookup make exactly one queued job" failed on `expected 'nothing_to_retry' to be 'lookup'` | 5eae051 |
| 2 | cacb3a2 | `tdd/06-05-task2-red.json`: RED_EVIDENCE_OK. The target "keeps an unavailable error kind and reason an earlier attempt recorded" failed on `expected +0 to be 1` | c4f786f |

**Semantic assessment:** each target ran and failed on its planned assertion against code that compiled (`latestBulkItemFor`, `retryBulkItem` and `markInterruptedLookups` were no-op stubs). The Task 1 target's `toMatchObject` printed a multi-line diff that the TAP classifier rejects, so it was rewritten as a single-line `toBe('lookup')` check. The test still checks the same thing.

**Tracer gate (auto mode):** after GREEN, the full Task 1 `<verify>` was re-run (94 tests passed, tsc clean), so the plan went on to Task 2.

## Verification

- `vitest run src/server src/app/api`: 74 files and 1390 tests, all passing.
- `tsc --noEmit` is clean and `biome check` passes on 660 files.
- Acceptance greps:
  - `kind: 'lookup'`: 2 in `imports/store.ts`, 1 in `route.ts`
  - `export function retryBulkItem`: 1
  - `markInterruptedLookups` in `index.ts`: 2
  - `resolve_pressing` in `status.ts`: 1

## Decisions Made

- `retryBulkItem` throws if the item row is missing, so a retry can never leave behind a job that points at nothing.
- A non-current item (a newer import exists) is ignored, and a test guards this: the import rules apply and the item stays failed.

## Deviations from Plan

None. The plan was executed as written.

## Issues Encountered

None.

## Known Stubs

None. The RED stubs were replaced by the GREEN commits.

## Threat Flags

None. There is no new endpoint. T-06-13 holds: a retried lookup only reaches the add through `createImport`, and the end-to-end test shows one import. T-06-14 is mitigated by the maintenance hook.

## User Setup Required

None.

## Next Phase Readiness

Ready for 06-06. The card UI can now show Retry import for lookup failures, and its toasts can read `kind: 'lookup'`.

## Self-Check: PASSED

- All created source, test and RED-evidence files exist.
- Commits 6960843, 5eae051, cacb3a2 and c4f786f are ancestors of HEAD.
