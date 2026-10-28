---
phase: 05-stubbed-demo-site
plan: 04
subsystem: demo-runtime
tags: [demo, review, imports, in-memory, fetch-shim]
status: complete

requires: ["05-01", "05-03"]
provides:
  - "src/demo/ops/review.ts: editField, startSearch/startSearchAgain, matchRecordings, dialogSearchDto, addManualCandidate, setNotOnDiscogs, listReattachCandidates, reattachSpine, dismissSpine, plus findSpine/isListed/discogsReady/mayBeOnDiscogs helpers"
  - "src/demo/ops/imports.ts: startImport (local duplicate + remote hold), cancelImport, linkExisting, addAnotherCopy, retrySpine, retryAllFailed"
  - "src/demo/routes/review.ts and src/demo/routes/imports.ts: 15 demo routes with the real bodies and status codes"
  - "src/demo/routes/http.ts: readBody/fail/reply with the real 415/400 bodies and a 250 ms mutation delay"
affects: [05-05, 05-06, 05-07, 05-08]

actuals:
  tokens: 24600
  tasks: 2
  commits: 4
plan_head_before: 082bdfb6e04c269c37e1618150cbfe1a3b8ea210
plan_head_after: d787f768c3fca0eda24e8560310ae1a72df3d937

tech-stack:
  added: []
  patterns:
    - "Demo ops are pure functions of (state, input, now) returning result unions; route handlers map them to the real status codes and call emit()"
    - "A search replaces auto candidates lazily: old rows get removedAt = readyAt, new rows addedAt = readyAt"
    - "An import's outcome is decided when it is scheduled; retry and Add another copy reschedule the same row, like the real store"

key-files:
  created:
    - src/demo/ops/review.ts
    - src/demo/ops/review.test.ts
    - src/demo/ops/imports.ts
    - src/demo/ops/imports.test.ts
    - src/demo/routes/http.ts
  modified:
    - src/demo/routes/review.ts
    - src/demo/routes/imports.ts
    - src/demo/store.ts
    - src/demo/read-model.ts

key-decisions:
  - "Search again with unchanged inputs replays the spine's recording; edited inputs run the recordings matcher (every word in title, labels or catno), capped at 10 candidates"
  - "Dialog text search uses the same matcher over every recorded release plus the canned one; a pasted release id outside the recordings returns the canned release 5822653, keeping the pasted id as the search's releaseId"
  - "A new copy is added to the in-memory collection when the import is scheduled (removed again on Change match), so the duplicate and already-in-collection rules see it at once"
  - "Already-in-collection holds only on copies no import records, matching the real handler (the other spine's recorded copy never causes a hold)"

patterns-established:
  - "Runtime ids use the demo-run-* prefixes (demo-run-search, demo-run-cand, demo-run-import) so they never collide with seed ids"
  - "Demo route tests drive handle() with fake setTimeout (vi.useFakeTimers toFake setTimeout) plus the setClock test clock"

requirements-completed: [DEMO-03, DEMO-08]

coverage:
  - id: R1
    description: "Field edit/revert, Search again, dialog text/ref searches, candidates, not on Discogs, reattach and dismiss answer the real contracts and settle"
    requirement: DEMO-08
    verification:
      - kind: unit
        ref: "src/demo/ops/review.test.ts"
        status: pass
  - id: R2
    description: "Imports, duplicate and already-in-collection warnings, Change match, Retry and Retry all failed run the real phases; polling stops"
    requirement: DEMO-08
    verification:
      - kind: unit
        ref: "src/demo/ops/imports.test.ts"
        status: pass
  - id: R3
    description: "Demo export still builds and renders the seeded shelf with zero /api network requests"
    requirement: DEMO-03
    verification:
      - kind: e2e
        ref: "node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect \"spines/=cd-spines.heic\""
        status: pass

duration: 7min
completed: 2026-10-23
---

# Phase 5 Plan 04: Demo Review and Import Actions Summary

**Every action on the demo's Spines page now works in memory with the real request and response contracts. That covers field edits, Search again, the Search Discogs dialog, candidates, Not on Discogs, add to collection, the duplicate and already-in-collection warnings, Change match, Retry and Retry all failed. Each moves through the real states after short delays, and polling always stops.**

## Performance

- **Duration:** about 7 min (10:11 to 10:19 UTC)
- **Tasks:** 2
- **Files:** 9 (5 created, 4 modified)

## Accomplishments

- **Review routes (9):** PATCH fields, POST search, GET discogs/searches/:id, GET/POST candidates, POST not-on-discogs, GET/POST reattach, POST dismiss. Each uses strict zod copies of the real schemas and the real error bodies, including the fields route's bare `{ error }` style and the 415 JSON-only guard.
- **Import routes (6):** POST/DELETE import, link-existing, another, retry, retry-failed. The 409 duplicate body passes `parseDuplicateBody`, with the other spine's photo, number and a `/demo-assets/` crop.
- **States:** a search goes queued (0 ms), searching (+400 ms), then done (+1600 ms). An import goes waiting (0 ms), importing (+700 ms), then imported or already in collection (+2200 ms). Every mutation answers after 250 ms.
- **Verification:** demo tests pass 107 of 107 and the full suite passes 1713 of 1713. tsc and biome are clean. The scratch demo export passed verify-export (365 files) and smoke made zero /api requests.

## Task Commits

1. **Task 1: Review actions:** `289a5ef` (test, RED), `809805f` (feat, GREEN)
2. **Task 2: Import actions:** `ec53a5b` (test, RED), `d787f76` (feat, GREEN)

## TDD Gate Compliance

- Task 1 RED `289a5ef`: 24 of 25 review tests failed against the empty route group. The one that passed was "a field that does not feed the search", which only reads seeded state once the 501 is ignored. GREEN `809805f`: 25 of 25 pass.
- Task 2 RED `ec53a5b`: all 17 import tests failed. GREEN `d787f76`: 17 of 17 pass.
- No refactor commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Candidates needed a removal time**
- **Found during:** Task 1
- **Issue:** The real search replaces a spine's auto candidates only when it finishes. With no timers, the demo had no way to keep the old candidates until readyAt and then swap them.
- **Fix:** Added an optional `removedAt` to `DemoCandidate`. `candidatesOf` and `importOf` now use a new `candidateListedAt(c, now)`. Also exported `sameInputs` and `importRowAt` from the read model, and added an optional `releaseId` to `DemoSearch` for `DialogSearchDto.releaseId`.
- **Files modified:** src/demo/store.ts, src/demo/read-model.ts
- **Commit:** 809805f

**2. [Rule 3 - Blocking] Shared body parser**
- **Found during:** Task 1
- **Issue:** Both route groups need the same 415/400 handling and the 250 ms mutation delay.
- **Fix:** Added `src/demo/routes/http.ts`. It was not listed in files_modified. Only the two group files import it, and the dispatcher is unchanged.
- **Commit:** 809805f

**3. [Rule 2 - Missing critical] Orphan re-attach and dismiss implemented in full**
- **Found during:** Task 1
- **Issue:** The plan only asked to mirror the active, unknown, superseded and dismissed answers. A later re-scan (05-05) could produce orphaned spines, and they would then get wrong answers.
- **Fix:** Implemented the real orphan rules: the CANDIDATE filter, the field merge on re-attach, and `has_import` on dismiss.
- **Commit:** 809805f

**Total deviations:** 3 auto-fixed. **Impact:** no scope change. The real app is untouched; every change is under src/demo.

## Issues Encountered

- The Change match "checking" path (202) cannot be reached in the demo, because no demo import fails after its intent is written. It is mirrored by cancelling at once.

## Known Stubs

None.

## Threat Flags

None. T-05-18 is mitigated: every body is parsed in try/catch against a strict schema, and the field and dialog length caps are enforced. T-05-19 is mitigated: tests assert discogsActive false, imports.left 0 and backlog 0 after every readyAt. T-05-21 is mitigated: cropUrl comes only from `demoAssetUrl`.

## Self-Check: PASSED
