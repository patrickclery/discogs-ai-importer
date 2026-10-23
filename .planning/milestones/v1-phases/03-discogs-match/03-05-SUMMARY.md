---
phase: 03-discogs-match
plan: 05
subsystem: api
tags: [discogs, rate-limit, jobs, sqlite, retry-after, vitest]

requires:
  - phase: 03-discogs-match
    provides: "Plan 03-01: discogsFetch error classes, discogsGate, getDiscogsAuth/isAuthInvalid; Plan 03-03: runSearchSpine happy path, finishSearch/recordSearchError, fake /__control at429/retryAfter/at5xx/revoked"
provides:
  - JobDeferredError (types.ts) and deferJob / releaseDedupeKey (queue.ts)
  - processNext 'deferred' outcome; runLane lane gate; pure laneWaitMs()
  - laneGates in handlers/index.ts (discogs reads discogsGate().pausedUntil())
  - search_spine branches - skipped, not_connected, auth_failed, paused-gate deferral, 429 deferral, 5xx 'unavailable' + retry, 4xx 'rejected' failed
  - parseRetryAfter limited to delta-seconds and the three RFC 9110 HTTP-date forms
  - gate.test.ts, search-spine.test.ts, deferral tests in queue.test.ts and worker.test.ts
  - verify-discogs-search steps (e) 429 resume and (f) revoked sign-in (f is last)
affects: [03-06, 03-07, 03-08, 03-13]

actuals:
  tokens: 13300
  tasks: 2
  commits: 4

plan_head_before: c87144ff3fee6c87e8c938ee0fc436354168e589
plan_head_after: a299bd11dbd948679159608dc43e5f95e05ce12d

tech-stack:
  added: []
  patterns:
    - "A handler defers its job by throwing JobDeferredError(runAfter); the worker matches it by name and calls the attempt-fenced deferJob, which restores the attempt claimNext added"
    - "Per-lane pause: laneGates[lane]() returns an epoch ms; runLane sleeps min(wait, 1000) and claims nothing until it passes"
    - "Searches that end for lack of a sign-in release their job's dedupe key so a later connect can queue the same search again"

key-files:
  created:
    - src/server/jobs/handlers/search-spine.test.ts
    - src/server/discogs/gate.test.ts
    - .planning/phases/03-discogs-match/tdd-evidence/03-05-task1-red.json
    - .planning/phases/03-discogs-match/tdd-evidence/03-05-task2-red.json
  modified:
    - src/server/jobs/types.ts
    - src/server/jobs/queue.ts
    - src/server/jobs/worker.ts
    - src/server/jobs/handlers/index.ts
    - src/server/jobs/handlers/search-spine.ts
    - src/server/jobs/queue.test.ts
    - src/server/jobs/worker.test.ts
    - src/server/discogs/gate.ts
    - test/fixtures/fake-discogs.mjs
    - scripts/verify-discogs-search.ts

key-decisions:
  - "An orphaned spine skips only kind 'auto' searches; an explicit Search again (kind 'again') on an orphaned spine still runs"
  - "A DiscogsAuthError with no status (sign-in removed mid-run) finishes not_connected; any other auth error finishes auth_failed. Both release the dedupe key"
  - "A 404 from search is treated like 400/403/422: finished failed with error_kind 'rejected', no retry"
  - "Owner-facing search error text is cut to 160 characters; the queue's last_error keeps its 1000-character cap"
  - "The fake's injected 429 carries no rate-limit headers, as the plan asks. RESEARCH notes the live unauthenticated 429 did carry them. Either way the client works: observe() ignores missing headers"

patterns-established:
  - "Compare worker-facing error classes by name (JobDeferredError joins WorkerStoppedError), because HMR can leave two class copies"
  - "TDD RED evidence from vitest: rerun the target with -t and --reporter=tap-flat, because vitest prints multi-line toMatchObject diffs unindented and that breaks TAP"

requirements-completed: [DISC-02]

coverage:
  - id: D1
    description: "A 429 mid-batch pauses the whole Discogs lane for Retry-After, and every search still finishes on attempt 1 with no API request during the pause"
    requirement: DISC-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-search.ts#(e)"
        status: pass
      - kind: unit
        ref: "src/server/jobs/queue.test.ts#deferJob and releaseDedupeKey"
        status: pass
      - kind: unit
        ref: "src/server/jobs/worker.test.ts#429 deferral and the lane gate"
        status: pass
    human_judgment: false
  - id: D2
    description: "A revoked sign-in costs at most one search request for a batch; the rest finish auth_failed without a request, no job is left queued or failed, and dedupe keys are released"
    requirement: DISC-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-search.ts#(f)"
        status: pass
      - kind: unit
        ref: "src/server/jobs/handlers/search-spine.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Not connected, vanished spines (superseded, dismissed, orphaned for auto), 5xx retry and 4xx failure each behave as specified without a wasted request"
    requirement: DISC-02
    verification:
      - kind: unit
        ref: "src/server/jobs/handlers/search-spine.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The pacing gate interval, slowdown threshold, pause adjacency and Retry-After parsing are pinned at and around each threshold"
    requirement: DISC-02
    verification:
      - kind: unit
        ref: "src/server/discogs/gate.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Existing proofs still pass"
    verification:
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1 node scripts/{verify-skeleton,verify-scan,verify-scan-recovery,verify-restart,verify-rescan,verify-discogs}.ts"
        status: pass
      - kind: unit
        ref: "corepack pnpm test (643 tests)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 05: 429 Deferral and Search Failure Branches Summary

**When Discogs answers 429, the job goes back on the durable queue at the gate's resume time with its attempt restored, and the whole Discogs lane stops claiming until the pause ends. Searches that cannot succeed end without a request: a revoked sign-in, no connection, or a spine that is gone. Retry-After now accepts only real HTTP-dates.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-21T01:39:11Z
- **Completed:** 2026-10-21T01:48:37Z
- **Tasks:** 2 (tracer + auto, both TDD)
- **Files modified:** 14

## Accomplishments
- `JobDeferredError` and `deferJob`: a 429 never counts as a failed attempt. The job returns to `queued` with `run_after` set to the resume time, and its attempt count is restored. The write is fenced to the claim that made the attempt. A restart during a pause still respects `run_after`.
- Lane gate: `runLane` checks `laneGates[lane]()` before it claims. While Discogs is paused, the lane sleeps (up to 1 s at a time), so a backlog is not claimed and deferred one job at a time.
- `search_spine` checks these cases in order before sending anything:
  - an already-finished search returns
  - a vanished spine finishes `skipped`
  - no sign-in finishes `not_connected`
  - a sign-in already known to be invalid finishes `auth_failed`
  - a paused gate defers the job
- During the cascade, by response:
  - 429: the job is deferred
  - 401: `auth_failed`, and the client turns on Reconnect needed
  - network error or 5xx: recorded as `unavailable` and rethrown, so the 2 s / 4 s backoff applies, up to 3 attempts
  - other 4xx: `failed` / `rejected` at once
- The two sign-in outcomes release the job's dedupe key.
- verify-discogs-search (e): with a 2 s Retry-After, the next request arrived 2002 ms after the 429, and all 6 jobs succeeded on attempt 1. (f): a revoked sign-in cost 1 search request for 6 spines.

## Task Commits

1. **Task 1 (tracer): a 429, a revoked sign-in, a disconnect or a vanished spine never loses work**
   - RED: `d76a96d` (test)
   - GREEN: `85847a0` (feat)
2. **Task 2: the pacing gate behaves exactly at its limits**
   - RED: `565777f` (test)
   - GREEN: `a299bd1` (fix)

## TDD Gate Compliance

- **Task 1 RED:** `search-spine.test.ts > a 401 finishes auth_failed, ...`, rerun filtered with `-t` and `--reporter=tap-flat`. It failed with "promise rejected DiscogsAuthError instead of resolving" because the old handler records the error and rethrows. The classifier returned `RED_EVIDENCE_OK` (target_test_failed).
  - Semantic check: the target ran and failed on its planned assertion.
  - The unfiltered jobs run also failed the deferJob, releaseDedupeKey, laneWaitMs and JobDeferredError tests, because those exports did not exist yet.
  - Evidence: `tdd-evidence/03-05-task1-red.json`.
- **Task 1 GREEN:** 152/152 jobs and discogs tests pass, and verify-discogs-search ends with OK.
- **Task 2 RED:** `gate.test.ts > "1.5" gives null` failed with "expected 1000 to be null", because `Date.parse` reads "1.5" as a 2001 date. The classifier returned `RED_EVIDENCE_OK`.
  - The same cause failed the `-3`, ISO-date and asctime cases. A zone-less asctime date was read as local time.
  - The other 37 gate tests passed against the existing gate.
  - Evidence: `tdd-evidence/03-05-task2-red.json`.
- **Task 2 GREEN:** 101/101 discogs tests pass.
- **REFACTOR:** none needed.

## Decisions Made
- An orphaned spine skips only automatic searches. An explicit Search again still runs, because the owner asked for it.
- An auth error with no HTTP status means the sign-in disappeared mid-run, so it reads as `not_connected`. A 401 reads as `auth_failed`.
- A 404 from search counts as rejected (no retry), like 400/403/422.
- Search error text is cut to 160 characters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Retry-After parsing accepted non-dates and misread asctime**
- **Found during:** Task 2 (RED)
- **Issue:** `parseRetryAfter` passed any non-integer to `Date.parse`. That turned `'1.5'`, `'-3'` and ISO dates into a clamped 1 s pause instead of the 60 s fallback. It also read a zone-less asctime date in local time.
- **Fix:** accept only the three RFC 9110 HTTP-date shapes, and append GMT to asctime.
- **Files modified:** src/server/discogs/gate.ts
- **Commit:** a299bd1

**2. [Note] Fake 429 headers versus the live probe**
- The plan says the live 429 carried no rate-limit headers. RESEARCH line 165 records `x-discogs-ratelimit: 25` / `remaining: 0` on the live unauthenticated 429.
- The fake follows the plan: empty body, `content-type: application/json`, no rate-limit headers.
- The client handles both: `observe()` ignores missing headers, and with the live headers it would only slow pacing further.

---

**Total deviations:** 1 auto-fixed bug, plus 1 documentation note. **Impact:** none beyond scope. All changed files are in the plan's file list, apart from the TDD evidence records.

## Issues Encountered
- Vitest's TAP reporter prints multi-line `toMatchObject` diffs without indentation, so the RED classifier rejected the unfiltered report. Rerunning only the target test with `-t` produced valid TAP.

## User Setup Required
None.

## Next Phase Readiness
- Plan 03-06 can read `discogsGate().pausedUntil()` for its "paused, resumes in Ns" status.
- Plan 03-07's backfill can re-queue `not_connected` / `auth_failed` searches. Their dedupe keys are already released. It should not re-enqueue `auth_failed` from the maintenance hook.
- Plan 03-08 can treat a failed search_spine job whose search row stays `queued` with `error_kind 'unavailable'` as "Search failed". 4xx searches are already `failed` / `rejected`.
- verify-discogs-search: insert new steps before `stepRevoked` (f), which must stay last.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED

- All 4 created files exist, and commits d76a96d, 85847a0, 565777f and a299bd1 are on HEAD.
- Acceptance greps:
  - `deferJob` 1, `releaseDedupeKey` 1
  - worker `JobDeferredError` 1, `laneGates` 2
  - gate `Math.ceil` 3
- Plan verification passed: typecheck, lint, and 643/643 unit tests. verify-discogs-search OK, including (e) and (f).
- verify-skeleton, verify-scan, verify-scan-recovery, verify-restart, verify-rescan and verify-discogs all OK (NEXT_DIST_DIR=.next/verify, VERIFY_SKIP_BUILD=1).
- The prod `.next/BUILD_ID` did not change, and :3001 answered throughout.
