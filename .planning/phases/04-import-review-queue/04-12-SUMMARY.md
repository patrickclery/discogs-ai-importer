---
phase: 04-import-review-queue
plan: 12
subsystem: api
tags: [discogs, imports, sqlite, jobs, retry, exactly-once]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 createImport/enqueueImport/confirm route; 04-10 importPhaseOf, canChangeMatchOf"
provides:
  - "cancelQueuedJob(id): queued -> cancelled with the dedupe key freed (src/server/jobs/queue.ts)"
  - "cancelImport, retryImport, retrySpine and the createImport retry_first refusal (src/server/imports/store.ts)"
  - "DELETE /api/spines/{id}/import (Change match): 200 { cancelled: true }, 404, 409 started"
  - "POST /api/spines/{id}/retry: 201 { kind: 'import', importId } | { kind: 'search', searchId }, 404, 409 not_connected | nothing_to_retry | busy"
  - "POST /api/spines/{id}/import answers 409 retry_first"
  - "store.test.ts: Change match, Retry, retry_first, createImport and enqueueImport base rules, one-enqueue-site scan"
affects: [04-03, 04-07, 04-09, 04-13]

actuals:
  tokens: 17250
  tasks: 2
  commits: 4
plan_head_before: 8f678cf1ee629bd9ae99f2ba354f8c6eb46f2cd0
plan_head_after: 35739852fbc20a0cdde0c10bdfa4a8cd99d21882

tech-stack:
  added: []
  patterns:
    - "Owner import actions evaluate the shared read-model rules (importPhaseOf, canChangeMatchOf) inside one IMMEDIATE transaction"
    - "Enqueue-site guard: a source scan test pins every add_to_collection enqueue to src/server/imports/store.ts"

key-files:
  created:
    - src/server/imports/store.test.ts
    - src/app/api/spines/[id]/import/route.test.ts
    - src/app/api/spines/[id]/retry/route.ts
    - src/app/api/spines/[id]/retry/route.test.ts
    - .planning/phases/04-import-review-queue/tdd-evidence/04-12-task1-red.json
    - .planning/phases/04-import-review-queue/tdd-evidence/04-12-task2-red.json
  modified:
    - src/server/jobs/queue.ts
    - src/server/imports/store.ts
    - src/app/api/spines/[id]/import/route.ts

key-decisions:
  - "retrySpine on a waiting import (job still queued) returns that same job as a 201 kind import, so a second Retry click is idempotent; only a running/importing import answers busy"
  - "retrySpine answers nothing_to_retry for an imported or already_in_collection import, for a superseded or dismissed spine, and for a spine marked not on Discogs (a failed search there is not retried)"
  - "The retry route checks the spine exists (404) before the connection (409 not_connected), as the plan orders them"
  - "The enqueue-site scan covers all of src (server and app), not only src/server; it matches `type: ADD_TO_COLLECTION_JOB_TYPE`, `type: 'add_to_collection'` and an INSERT INTO jobs naming the type, so later modules may still import the constant to read jobs"
  - "The import route's JSON guard moved into a local readBody(req, schema) helper shared by POST and DELETE"

patterns-established:
  - "RED evidence for vitest: -t on the target and a single-line assertion (status string, not an object), so the tap-flat report stays valid TAP"

requirements-completed: [REV-04, IMP-01]

coverage:
  - id: D1
    description: "Change match deletes a waiting import and cancels its still-queued job (dedupe key freed), deletes an already_in_collection hold or a failed import with no intent or refused by Discogs, and answers started with nothing changed for a running job, an intent on pending/importing, a failed import with intent and unavailable/interrupted, and an imported import"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#cancelImport (Change match, D-02)"
        status: pass
      - kind: unit
        ref: "src/server/imports/store.test.ts#cancelQueuedJob"
        status: pass
    human_judgment: false
  - id: D2
    description: "DELETE /api/spines/{id}/import answers 415, 400, 404, 200 { cancelled: true } (and a new confirm then answers 201), and 409 started with the UI-SPEC copy"
    requirement: REV-04
    verification:
      - kind: integration
        ref: "src/app/api/spines/[id]/import/route.test.ts#DELETE /api/spines/{id}/import (Change match)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Retry reuses the failed import row (pending, error cleared, intent_at, snapshot_json, allow_duplicate and existing_json kept) with one new job; import first when the search also failed; a failed search alone re-runs as kind again; nothing_to_retry, same job twice, busy, not_found"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#retrySpine (REV-04, D-13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "POST /api/spines/{id}/retry answers 201 kind import or search, 404, 409 not_connected (Connect and Reconnect copy), 409 nothing_to_retry, 409 busy, 415 and 400"
    requirement: REV-04
    verification:
      - kind: integration
        ref: "src/app/api/spines/[id]/retry/route.test.ts#POST /api/spines/{id}/retry"
        status: pass
    human_judgment: false
  - id: D5
    description: "A confirm over a failed import with an unresolved intent answers 409 retry_first and writes nothing; one with no intent or refused by Discogs makes a new import"
    requirement: IMP-01
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#createImport retry_first (D-07)"
        status: pass
      - kind: integration
        ref: "src/app/api/spines/[id]/import/route.test.ts#POST /api/spines/{id}/import retry_first (D-07)"
        status: pass
    human_judgment: false
  - id: D6
    description: "createImport and enqueueImport base rules (release from the candidate row, no_candidate, not_importable, not_on_discogs, already_confirmed with one row and one job, folder setting; same job while queued, key freed after a finished job) and the one-enqueue-site scan"
    requirement: IMP-01
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#createImport base rules (IMP-01, moved from Plan 04-01)"
        status: pass
      - kind: unit
        ref: "src/server/imports/store.test.ts#one add_to_collection enqueue site (IMP-01 guard)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The Plan 04-01/04-02 confirm flow still works end to end"
    verification:
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 12: Change match and per-spine Retry Summary

**Change match (DELETE /api/spines/{id}/import) undoes a confirmed match only while nothing can have reached Discogs. Per-spine Retry (POST /api/spines/{id}/retry) puts a failed import back in line on the same row, which reconciles first, or re-runs a failed search. A confirm over an ambiguous add is refused with retry_first, and a source-scan test keeps add_to_collection to one enqueue site.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-22T09:44:35Z
- **Completed:** 2026-10-22T09:52:27Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- `cancelQueuedJob(id)` cancels a job only while it is still `queued`, and frees its dedupe key at the same time.
- `cancelImport` loads the spine's latest import together with its job status, inside one IMMEDIATE transaction. It applies the card's own rule (`canChangeMatchOf` on `importPhaseOf`) and deletes the row only when that rule allows it. For a waiting import, the job must also still be cancellable.
- `retryImport` moves the same row back to `pending` and keeps the intent and snapshot. `retrySpine` tries the import first and the search second. A second click while the job is still queued returns the same job. A running import answers `busy`.
- `createImport` refuses a new confirm with `retry_first` when the latest import failed with an intent that Discogs did not refuse.
- Both routes use the JSON-only guard with strict empty bodies. The import route's guard is now a shared `readBody` helper used by POST and DELETE.
- `store.test.ts` (43 tests) now holds the createImport and enqueueImport base rules moved from Plan 04-01, plus the IMP-01 enqueue-site scan.

## Task Commits

1. **Task 1: Tracer, Change match cancels a queued import and is refused once Discogs may have it**
   - RED `110f21d` (test)
   - GREEN `a049dbd` (feat)
2. **Task 2: Retry a failed import or search, retry_first, one enqueue site**
   - RED `cda23a7` (test)
   - GREEN `3573985` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | Evidence |
|------|-----|-------|----------|
| 1 | `110f21d` | `a049dbd` | `tdd-evidence/04-12-task1-red.json`: RED_EVIDENCE_OK. The target test "a waiting import whose job is still queued is deleted and its job cancelled" failed with `'not_found'` instead of `'ok'`, because `cancelImport` was a stub. The stubs exported the new symbols, so the suite loaded and every failure was an assertion. |
| 2 | `cda23a7` | `3573985` | `tdd-evidence/04-12-task2-red.json`: RED_EVIDENCE_OK. The target test "a failed import goes back to pending on the same row, keeping its intent" failed with `false` instead of `'import'`, because the `retrySpine` stub returned `nothing_to_retry`. The other failures were also assertions: retry_first came back `ok`, and the retry route stub answered 501. |

The tracer gate ran in auto mode. The full typecheck, lint and test suite passed again after Task 1 before Task 2 began.

## Files Created/Modified
- `src/server/jobs/queue.ts`: `cancelQueuedJob`
- `src/server/imports/store.ts`: `cancelImport`, `retryImport`, `retrySpine`, `retry_first`, `latestImport`
- `src/app/api/spines/[id]/import/route.ts`: DELETE, the 409 retry_first, the `readBody` helper
- `src/app/api/spines/[id]/retry/route.ts`: per-spine Retry
- `src/server/imports/store.test.ts`, `src/app/api/spines/[id]/import/route.test.ts`, `src/app/api/spines/[id]/retry/route.test.ts`: tests

## Decisions Made
See key-decisions in the frontmatter. The plan's action said that an open import with a queued or running job "returns busy", but its behavior and truths say a second Retry while the job is queued "returns the same job id". The behavior wins: queued gives back the same job, and only running/importing answers busy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture hit the candidate unique index**
- **Found during:** Task 1 GREEN
- **Issue:** `seedCandidate` inserted a second manual candidate for the same spine and release. That broke `discogs_candidates (spine_id, source, release_id)` uniqueness when a test confirmed again after a cancel.
- **Fix:** `seedCandidate` now reuses the existing row.
- **Files modified:** `src/server/imports/store.test.ts`, `src/app/api/spines/[id]/import/route.test.ts`
- **Committed in:** `a049dbd`

---

**Total deviations:** 1 auto-fixed (1 test fixture bug)
**Impact on plan:** None on behavior.

## Issues Encountered
- Vitest's tap-flat report writes object diffs on several lines, which the RED classifier rejects. Task 1's target assertion therefore compares `.status` as a string.

## Verification
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: pass (71 files, 1123 tests)
- `NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts`: steps (a) to (f) ok, "verify-discogs-import OK"
- `grep -rn "type: ADD_TO_COLLECTION_JOB_TYPE" src --include=*.ts | grep -v "\.test\.ts" | wc -l`: 1

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-03's Change match and Retry import buttons can call `DELETE /api/spines/{id}/import` and `POST /api/spines/{id}/retry` and rely on the answers listed above.
- Plan 04-09's "Retry all failed" can loop over failed spines with `retrySpine`.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
