---
phase: 03-discogs-match
plan: 07
subsystem: discogs
tags: [discogs, backfill, sqlite, jobs, vitest, unicode]

requires:
  - phase: 03-discogs-match
    provides: "Plan 03-03 inputs/search/store/enqueue, Plan 03-04 completeConnect, Plan 03-05 unauthed outcomes releasing the dedupe key"
provides:
  - "enqueueMissingSearches({ includeAuthFailed }, db?) connect backfill and maintenance safety net"
  - "completeConnect backfills every already-scanned active CD spine (plus auth_failed ones)"
  - "maintenance hook enqueueMissingSearches({ includeAuthFailed: false }) on every lease tick"
  - "enqueueAutoSearch same-hash baseline ignores not_connected and auth_failed searches (A-03-27)"
  - "Discogs strings capped in code points (no lone surrogates)"
  - "scripts/verify-discogs-backfill.ts e2e proof, steps (a)-(d)"
  - "inputs/search/store/enqueue unit tests and three recorded fixtures under test/fixtures/discogs/"
affects: [03-08, 03-10, 03-11, 03-13]

actuals:
  tokens: 21000
  tasks: 2
  commits: 3
plan_head_before: 2600f4ac9fb9c5e1a8f3caff14a787fe20eec914
plan_head_after: a439bc1b3d5b427cedde1f4fe4ae1db110bde94d

tech-stack:
  added: []
  patterns:
    - "Cheap read first, IMMEDIATE write transaction only when the read finds work (lease-tick hooks)"
    - "Recorded Discogs fixtures (verbatim RESEARCH key sets, made-up values) read with fs in unit tests"

key-files:
  created:
    - scripts/verify-discogs-backfill.ts
    - src/server/discogs/inputs.test.ts
    - src/server/discogs/search.test.ts
    - src/server/discogs/store.test.ts
    - src/server/discogs/enqueue.test.ts
    - test/fixtures/discogs/search-hit.json
    - test/fixtures/discogs/search-empty.json
    - test/fixtures/discogs/release.json
  modified:
    - src/server/discogs/enqueue.ts
    - src/server/discogs/connect.ts
    - src/server/jobs/handlers/index.ts
    - src/server/discogs/search.ts

key-decisions:
  - "The same-hash baseline is the newest auto/again search that did not end not_connected or auth_failed (A-03-27): equivalent outcome to skipping only the latest, without creating and deleting a row every lease tick when an older done search holds the dedupe key"
  - "A backfill error inside completeConnect is logged and never changes the connect's outcome"
  - "enqueueMissingSearches takes an optional db (defaults to getDb().$client) so the export stays callable with only the options object"

patterns-established:
  - "Lease-tick hooks: SELECT outside a transaction, open tx.immediate() only when there is work"

requirements-completed: [DISC-03]

coverage:
  - id: D1
    description: "Connecting looks up every already-scanned active CD spine exactly once; lease ticks and a reconnect add nothing"
    requirement: DISC-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-backfill.ts steps (a)-(c)"
        status: pass
      - kind: unit
        ref: "src/server/discogs/enqueue.test.ts#backfills every active CD spine once; a second call enqueues nothing"
        status: pass
    human_judgment: false
  - id: D2
    description: "A revoked sign-in's auth_failed spines are never re-queued by the maintenance hook; reconnecting searches each once more; failed searches are never re-queued automatically"
    requirement: DISC-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-backfill.ts step (d)"
        status: pass
      - kind: unit
        ref: "src/server/discogs/enqueue.test.ts#re-picks an auth_failed latest search only with includeAuthFailed"
        status: pass
      - kind: unit
        ref: "src/server/discogs/enqueue.test.ts#never re-enqueues a spine whose latest search failed"
        status: pass
    human_judgment: false
  - id: D3
    description: "Input normalization, cascade stages, candidate mapping, catno pin, stable ranking and candidate replacement pinned on recorded shapes"
    requirement: DISC-03
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/discogs (inputs, search, store, enqueue tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Capped Discogs strings (title, country, labels, formats, release combined title) never split a surrogate pair"
    verification:
      - kind: unit
        ref: "src/server/discogs/search.test.ts#a capped title never splits a surrogate pair"
        status: pass
      - kind: unit
        ref: "src/server/discogs/search.test.ts#a capped release title never splits a surrogate pair"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 07: Connect Backfill and Search Rule Tests Summary

**Connecting Discogs now queues one search for every CD spine already scanned. A lease-tick hook catches up never-searched spines but never loops on a revoked sign-in. 40+ unit tests pin the cascade, mapping, catno pin and enqueue rules on recorded Discogs shapes.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-21T01:59:53Z
- **Completed:** 2026-10-21T02:09:29Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- `enqueueMissingSearches` covers every active CD spine that has no auto/again search, or whose latest one ended `not_connected` (and also `auth_failed` when `includeAuthFailed` is set). It runs from `completeConnect` and from the maintenance hook.
- The e2e proof in `verify-discogs-backfill` covers four steps: (a) a shelf scanned while disconnected queues nothing; (b) connecting queues 6 searches for 6 spines; (c) idempotent across lease ticks and a reconnect; (d) after a revoke, the 6 `auth_failed` spines stay untouched for two ticks, then reconnecting searches each one once.
- Four new test files and three fixtures pin the D-08, D-09 and D-10 boundaries listed in must_haves.
- The tests found a real defect: capped Discogs strings could split a surrogate pair. They are now capped in code points.

## Task Commits

1. **Task 1: Tracer — connect backfill** - `e715a1d` (feat)
2. **Task 2 RED: cascade, mapping, pin and enqueue tests** - `b57f546` (test)
3. **Task 2 GREEN: code-point caps for Discogs strings** - `a439bc1` (feat)

## Files Created/Modified
- `src/server/discogs/enqueue.ts` - `enqueueMissingSearches`, plus a `baselineHash` that ignores unauthed searches
- `src/server/discogs/connect.ts` - runs the backfill after `saveDiscogsAuth` (errors are logged and never fail the connect)
- `src/server/jobs/handlers/index.ts` - maintenance hook
- `src/server/discogs/search.ts` - `cap()`, `text()`, format fields and the release title now use `capCodePoints`
- `scripts/verify-discogs-backfill.ts` - e2e proof
- `src/server/discogs/{inputs,search,store,enqueue}.test.ts`, `test/fixtures/discogs/*.json` - tests and recorded shapes

## Decisions Made
- The baseline for the same-hash skip is the newest auto/again search that did not end `not_connected` or `auth_failed`. Take a spine whose latest search is `auth_failed` while an older `done` search with the same inputs still holds the dedupe key. This version skips it cleanly. The literal rule would instead insert a row and delete it again on every lease tick.
- A backfill failure never changes the outcome of a connect.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Capped Discogs strings split surrogate pairs**
- **Found during:** Task 2 (RED)
- **Issue:** `cap()`, `text()`, format descriptions/qty and the release combined title used `slice(0, max)` on UTF-16 units. A 4-byte character at the boundary left a lone high surrogate in the stored candidate.
- **Fix:** Switched them to `capCodePoints` from inputs.ts.
- **Files modified:** src/server/discogs/search.ts
- **Verification:** Both RED targets got RED_EVIDENCE_OK (evidence in `tdd-evidence/03-07-task2-{title,release}-red.json`) and are now green. The full suite passes (778 tests).
- **Committed in:** a439bc1

**2. [Rule 3 - Blocking] Shared verify helpers come from scripts/lib/scan.ts**
- **Found during:** Task 1
- **Issue:** The plan says `stepStart`, `fakeVisionEnv`, `upload`, `withDb` and `countRows` come from scripts/verify-scan.ts, but they live in scripts/lib/scan.ts.
- **Fix:** Imported them from scripts/lib/scan.ts.
- **Committed in:** e715a1d

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both were needed for correctness. No scope creep.

## TDD Gate Compliance
The RED commit (`b57f546`) comes before the GREEN commit (`a439bc1`). No refactor was needed. RED targets:
- `search.test.ts > toCandidateFromSearch > a capped title never splits a surrogate pair`
- `search.test.ts > toCandidateFromRelease > a capped release title never splits a surrogate pair`

Both executed and failed on the planned `LONE_SURROGATE.test(...)` assertion: it expected false and got true. There was no load, import or syntax fault. The other new tests passed at RED because they pin behavior Plan 03-03 and Task 1 already built.

## Issues Encountered
None.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- On the owner's next connect, the 237 spines already scanned are queued for searching (about 4.5 min at the paced rate).
- Plans 03-08, 03-10 and 03-11 can import every export unchanged. `enqueueMissingSearches` was added; nothing was renamed.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED
