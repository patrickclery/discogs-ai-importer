---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 02
subsystem: bulk-import-server
status: complete
tags: [discogs, bulk-import, sqlite, migration, jobs, tdd]
requires:
  - src/lib/pressing.ts (choosePressing, needsLookup) from 06-01
  - src/server/discogs/versions.ts from 06-01
  - src/server/imports/store.ts (createImport, enqueueImport, retryImport)
provides:
  - bulk_runs and bulk_items tables (migration 0004) with bulk_items_spine_open_idx
  - src/server/bulk/store.ts (startBulkRun and item compare-and-set helpers)
  - resolve_pressing job (runResolvePressing), registered on the discogs lane
  - upsertPressingCandidate and hidden pressing candidates
  - mustRetryFirst, DuplicateOf.spineId, runAfter pass-through on createImport/enqueueImport/retryImport
  - test/helpers/bulk-seed.ts shared Phase 6 seeding helpers
affects: [06-03, 06-04, 06-05, 06-06, 06-07, 06-08, 06-09, 06-10, 06-11, 06-12]
tech-stack:
  added: []
  patterns: [per-pick savepoint inside one IMMEDIATE transaction, refused-import savepoint rollback, inherited run_after for lookup/add interleave]
key-files:
  created:
    - drizzle/0004_bulk_import.sql
    - drizzle/meta/0004_snapshot.json
    - src/server/db/migrations.test.ts
    - src/server/bulk/store.ts
    - src/server/jobs/handlers/resolve-pressing.ts
    - src/server/jobs/handlers/resolve-pressing.test.ts
    - test/helpers/bulk-seed.ts
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-02-task1-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-02-task2-red.json
    - .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/tdd/06-02-task3-red.json
  modified:
    - src/server/db/schema.ts
    - drizzle/meta/_journal.json
    - src/server/jobs/handlers/index.ts
    - src/server/imports/store.ts
    - src/server/imports/store.test.ts
    - src/server/discogs/store.ts
    - src/server/discogs/queries.ts
    - src/server/discogs/queries.test.ts
decisions:
  - "Each spine's add job inherits its lookup's run_after (start + index), so the lane runs lookup 1, add 1, lookup 2 instead of all lookups first"
  - "A refused createImport (duplicate, changed, retry race) rolls back its savepoint, so the pressing candidate upsert is not written either (D-09: nothing written for that spine)"
  - "startBulkRun counts a pick refused by the open-item index or by a missing spine (foreign key) as skipped, rolling back only that pick"
  - "A malformed versions envelope is recorded as error 'other' and rethrown for the worker's retry, following the fetch-release pattern; an implausible item count is the 'unusable' fallback"
requirements-completed: [BULK-06, BULK-07, BULK-08]
coverage:
  - deliverable: "Migration 0004 applies to a fresh folder and a Phase 5 database copy without touching rows"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/db/migrations.test.ts#upgrades a Phase 5 database copy without touching its rows"
        status: pass
  - deliverable: "startBulkRun: one run at a time, paced resolve jobs with pressing:{itemId} dedupe keys"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/jobs/handlers/resolve-pressing.test.ts#startBulkRun"
        status: pass
  - deliverable: "resolve_pressing: D-02 zero-request import, one versions lookup, fallbacks, D-09 duplicates, D-20 retries, interleave"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/jobs/handlers/resolve-pressing.test.ts"
        status: pass
  - deliverable: "Every Discogs failure of the lookup ends in a defined item state"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/jobs/handlers/resolve-pressing.test.ts#resolve_pressing refusals and Discogs errors"
        status: pass
  - deliverable: "Pressing candidates never show in a spine's list, count or top match"
    human_judgment: false
    verification:
      - kind: test
        ref: "src/server/discogs/queries.test.ts#a pressing row never shows in discogsForSpines or listCandidates"
        status: pass
metrics:
  duration: 9min
  completed: 2026-10-25
  tasks: 3
  files: 18
estimate:
  tokens: 120000
actuals:
  tokens: 31400
  tasks: 3
  commits: 6
plan_head_before: f1eb13c11b500710dbcbf735cd08b25bcb4bc10d
plan_head_after: 61914c74d590718c8df42eca8f2d202f054b124e
commits: 6
---

# Phase 6 Plan 02: Bulk pipeline on the server Summary

A bulk run now works end to end on the server. `startBulkRun` writes one run and one queued item per selected spine, and gives each item a `resolve_pressing` job on the Discogs lane. Each job takes the spine's top match and turns it into the import release:

- If the top match is already in the preferred country, it is used as is.
- Otherwise one `GET /masters/{id}/versions` call picks the preferred-country pressing.
- If no pressing can be picked, the top match is used and the fallback reason is recorded.

The job then hands the release to the unchanged Phase 4 `createImport` / `add_to_collection` pipeline.

## What was built

- **Migration 0004** (`bulk_runs`, `bulk_items`): migration 0004 adds two tables. The partial unique index `bulk_items_spine_open_idx` (`WHERE status = 'queued'`) allows only one open lookup per spine. The migration was generated by drizzle-kit and not edited by hand.
- **src/server/bulk/store.ts**:
  - `RESOLVE_PRESSING_JOB_TYPE`, `getBulkItem`, `getBulkRun`, `openBulkItemCount`.
  - `startBulkRun` runs in one IMMEDIATE transaction. While any item is still queued it returns busy. Each pick is written in its own savepoint, and its job's `run_after` is `start + i`.
  - Compare-and-set helpers that only change a queued item: `resolveBulkItem`, `skipBulkItem`, `failBulkItem` and `recordBulkItemError`. Errors are capped at 160 code points.
- **src/server/jobs/handlers/resolve-pressing.ts**, which handles each case as follows:

  | Case | What the job does |
  |------|-------------------|
  | Spine not active, or its candidate is gone | Skips the item as `changed` |
  | Latest import failed and may have reached Discogs (D-20) | Retries the same import row with `retryImport` (`retried_earlier`); no Discogs request |
  | Lookup needed | Checks the sign-in and the paused gate, then makes one versions request, classifying errors like `fetch-release` |
  | After `choosePressing` | Upserts the pressing candidate and calls `createImport` (never `allowDuplicate`) in one IMMEDIATE transaction; a refused import rolls back its savepoint |

  It is registered in `handlers/index.ts` with a 60 s timeout.
- **imports/store.ts**: `createImport({ runAfter })`, `enqueueImport(db, id, { runAfter })` and `retryImport(db, row, { runAfter })` are new. The `retry_first` check moved into the exported `mustRetryFirst`. `DuplicateOf.spineId` is new, but the 409 body is unchanged because the route builds it field by field. `enqueueImport` is still the only place `add_to_collection` is enqueued (the IMP-01 guard passes).
- **discogs/store.ts**: `upsertPressingCandidate`, an ON CONFLICT upsert keyed by spine, source `'pressing'` and release. **discogs/queries.ts**: `CANDIDATES_SQL` and `SPINE_CANDIDATES_SQL` now exclude `source <> 'pressing'`.
- **test/helpers/bulk-seed.ts**: `useBulkSecrets`, `connectDiscogs`, `bulkShelf`, `seedTopCandidate`, `fakeDiscogsDeps` (stub fetch plus a fake-clock gate) and `jobCtx`.

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | e2b2ebf | `tdd/06-02-task1-red.json`: RED_EVIDENCE_OK. The target "upgrades a Phase 5 database copy" failed on `expected '' to be 'bulk_items,bulk_items_spine_open_idx,…'` (no 0004) | 0fe036e |
| 2 | 6c0cd4f | `tdd/06-02-task2-red.json`: RED_EVIDENCE_OK. The target "a pressing row never shows" failed on `expected 2 to be 1` (no source filter) | e9163ee |
| 3 | ea5fa4e | `tdd/06-02-task3-red.json`: RED_EVIDENCE_OK. The target "D-04: a 404 counts as no master" failed on `expected 'DiscogsNotFoundError' to be null` | 61914c7 |

Semantic assessment: each target ran and failed on its planned assertion, against code that compiled. The Task 1 handler and store were compiling stubs. In two cases a `toEqual` assertion on an array or object printed a multi-line diff that the TAP classifier rejects, so those assertions were rewritten as single-line string comparisons. Each test checks the same thing as before.

Tracer gate (auto mode): after GREEN, the full Task 1 `<verify>` was re-run. 84 tests passed and tsc was clean, so expansion continued.

## Verification

- `vitest run src/server`: 49 files, 1164 tests, all passing.
- `tsc --noEmit`: clean.
- `biome check`: 651 files, clean.
- Every acceptance-criteria grep and journal check passes:
  - `bulk_items_spine_open_idx`: 1
  - journal: 5 entries
  - `resolve_pressing` in index: 1
  - `runAfter` in imports store: 5+
  - `source <> 'pressing'`: 2
  - `upsertPressingCandidate` / `mustRetryFirst`: 1 each
  - `allowDuplicate` in the handler: 0
  - `JobDeferredError`: 3

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A refused import no longer leaves its pressing row behind**
- **Found during:** Task 2
- **Issue:** The plan's single transaction upserts the pressing candidate and then calls `createImport`. On a duplicate or changed answer, the pressing row was still written. That breaks D-09 ("nothing is written for that spine").
- **Fix:** The upsert and `createImport` now run in a nested savepoint, and a non-ok result throws `RefusedImport` to roll it back. The result is then mapped outside the savepoint, still inside the IMMEDIATE transaction.
- **Files modified:** src/server/jobs/handlers/resolve-pressing.ts
- **Commit:** e9163ee

**2. [Rule 2 - Correctness] startBulkRun skips a pick whose spine no longer exists**
- **Found during:** Task 1
- **Issue:** Only the open-item unique violation was handled. If a spine id had been deleted, the foreign-key violation aborted the whole run.
- **Fix:** `SQLITE_CONSTRAINT_FOREIGNKEY` also rolls back that pick alone and counts it as skipped.
- **Files modified:** src/server/bulk/store.ts
- **Commit:** 0fe036e

**3. [Expected follow-on] Existing duplicate assertions include spineId**
- The four `createImport local duplicate` tests use `toEqual`, so they now expect the new `DuplicateOf.spineId`. The route's 409 body and its tests are unchanged.
- **Files modified:** src/server/imports/store.test.ts
- **Commit:** e9163ee

**4. [Test harness] The shelf is scanned before connecting Discogs**
- Connecting first makes `persistRunResult` queue `search_spine` jobs ahead of the bulk jobs on the lane. The tests now connect after `bulkShelf()`, and `claim()` checks the type of the job it claims.
- **Commit:** 0fe036e

**Total deviations:** 2 auto-fixed (1 bug, 1 correctness) and 2 test-side adjustments. **Impact:** nothing changed beyond the plan; both fixes tighten guarantees the plan already stated.

## Known Stubs

None. The RED stubs were replaced by the GREEN commits.

## Threat Flags

None. No new endpoint or trust boundary. The versions answer and its errors are handled as T-06-04 to T-06-07 require.

## Next

Ready for 06-03.

## Self-Check: PASSED

- All created source, test, migration, helper and RED-evidence files exist.
- Commits e2b2ebf, 0fe036e, 6c0cd4f, e9163ee, ea5fa4e and 61914c7 are ancestors of HEAD.
