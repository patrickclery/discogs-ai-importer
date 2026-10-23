---
phase: 02-shelf-scan
plan: 13
subsystem: ui
tags: [tanstack-query, polling, refetchInterval, vitest, gap-closure]

requires:
  - phase: 02-shelf-scan
    provides: photosRefetchInterval, /upload photo status list, /spines view, Couldn't refresh alert (Plans 02-07, 02-10)
provides:
  - Error-aware photosRefetchInterval(photos, status) with POLL_RETRY_MS (3000)
  - QueryObserver-level regression test for failed-poll recovery on /upload and /spines
  - Corrected 02-UI-SPEC.md polling rule (line 183)
affects: [phase-02-verification, UAT test 3 re-run]

actuals:
  tokens: 3355
  tasks: 2
  commits: 3
plan_head_before: be3d8b0213f16b0df6bece7401b8bcbff1aede3b
plan_head_after: 398691a372de47e022eebb749b4a7b458a2df149

tech-stack:
  added: []
  patterns:
    - "QueryObserver tests under vitest node env: vi.hoisted window shim before importing @tanstack/react-query, fake timers + advanceTimersByTimeAsync"
    - "Polling interval helpers take the query status as a local string union, keeping lib modules free of TanStack imports"

key-files:
  created:
    - src/lib/photo-polling.test.ts
    - .planning/phases/02-shelf-scan/tdd-evidence/02-13-task1-red.json
  modified:
    - src/lib/photo-status.ts
    - src/lib/photo-status.test.ts
    - src/components/photo-status-list.tsx
    - src/components/spines-view.tsx
    - .planning/phases/02-shelf-scan/02-UI-SPEC.md

key-decisions:
  - "Retry a failed poll every 3 s (POLL_RETRY_MS) when no photo is active; active polling stays 1.5 s in both success and error state (G-02-3)"
  - "photosRefetchInterval's status parameter is required so typecheck catches any call site that is not error-aware"

patterns-established:
  - "Failed-poll recovery: refetchInterval must branch on q.state.status, because a failed refetch keeps the last data and an idle data-only rule never fetches again"

requirements-completed: [INGEST-02, REV-01]

coverage:
  - id: D1
    description: "After a failed poll with every photo Done, /upload keeps retrying and isError (the Couldn't refresh alert) clears on the first successful poll"
    requirement: INGEST-02
    verification:
      - kind: unit
        ref: "src/lib/photo-polling.test.ts#/upload: recovers from a failed poll with every photo done"
        status: pass
    human_judgment: false
  - id: D2
    description: "Same failed-poll recovery on /spines, driven by photoOptions"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "src/lib/photo-polling.test.ts#/spines: recovers from a failed poll with every photo done"
        status: pass
    human_judgment: false
  - id: D3
    description: "No idle polling while every photo is Done and polls succeed; 1.5 s polling unchanged while any photo is active"
    verification:
      - kind: unit
        ref: "src/lib/photo-polling.test.ts#does not poll while every photo is done and fetches succeed"
        status: pass
      - kind: unit
        ref: "src/lib/photo-status.test.ts#photosRefetchInterval"
        status: pass
    human_judgment: false
  - id: D4
    description: "02-UI-SPEC.md polling rule agrees with the alert copy 'retrying every few seconds'"
    verification:
      - kind: other
        ref: "grep -c 'while the last poll failed' .planning/phases/02-shelf-scan/02-UI-SPEC.md -> 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "Real-browser recovery after a prod server restart (UAT test 3 re-run on /upload and /spines)"
    verification: []
    human_judgment: true
    rationale: "Needs a running prod build, a stopped/restarted server and tab refocus; the plan defers this human-check to end-of-phase verification"

duration: 2min
completed: 2026-10-20
status: complete
---

# Phase 2 Plan 13: Failed-poll recovery (G-02-3) Summary

**photosRefetchInterval now takes the query status and retries every 3 s (POLL_RETRY_MS) after a failed poll with no active photo, so the "Couldn't refresh" alert on /upload and /spines clears by itself once the server is back.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-10-20T08:24:45Z
- **Completed:** 2026-10-20T08:26:47Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Error-aware polling: active photo -> 1500 ms; idle and last poll failed -> 3000 ms; idle and healthy -> no polling
- Both call sites (/upload `photos`, /spines `photoOptions`) pass `q.state.status`
- QueryObserver regression test reproduces the UAT bug (RED: no refetch after the failed poll) and proves recovery for both data shapes plus no idle polling
- 02-UI-SPEC.md:183 no longer contradicts the alert copy at :358

## Task Commits

1. **Task 1 (tracer): failed-poll recovery** - RED `6af1592` (test), GREEN `47fb985` (feat)
2. **Task 2: unit tests for every branch + UI-SPEC correction** - `398691a` (test)

## TDD Gate Compliance

- **RED (Task 1):** `src/lib/photo-polling.test.ts` run with `--reporter=tap-flat`; the classifier returned `RED_EVIDENCE_OK` (`target_test_failed`, 3 tests, 2 failing). Semantic assessment: both recovery tests executed and failed on the planned assertion (`expected 2 to be greater than 2`: no fetch scheduled after the failed poll) because the one-argument function ignores the query status; the idle guard passed as intended. Record: `.planning/phases/02-shelf-scan/tdd-evidence/02-13-task1-red.json`.
- **GREEN (Task 1):** `47fb985` adds `POLL_RETRY_MS` and the status branch; all 19 tests in the two files pass.
- **REFACTOR:** none needed.
- **Task 2:** its tests pin behavior Task 1 already implemented, so they passed on first run (no RED possible by plan design; see Deviations).

## Files Created/Modified
- `src/lib/photo-status.ts` - `POLL_RETRY_MS`, `PollQueryStatus`, error-aware `photosRefetchInterval`
- `src/lib/photo-polling.test.ts` - QueryObserver recovery and no-idle-polling tests
- `src/lib/photo-status.test.ts` - one case per polling-rule branch
- `src/components/photo-status-list.tsx`, `src/components/spines-view.tsx` - pass `q.state.status`
- `.planning/phases/02-shelf-scan/02-UI-SPEC.md` - corrected polling rule

## Decisions Made
- Status is typed as a local `'pending' | 'error' | 'success'` union so `photo-status.ts` stays free of TanStack imports.
- The polling test's wait uses `POLL_RETRY_MS + 500`. The RED commit used the literal 3000 because the constant did not exist yet; GREEN switched to the import.

## Deviations from Plan

**1. [Process] Task 2 tests had no RED phase**
- **Found during:** Task 2
- **Issue:** Task 2 is `tdd="true"` but pins behavior that Task 1's GREEN already implemented, so its tests passed immediately.
- **Fix:** None needed. They are committed as `test(02-13)` characterization tests, and Task 1 carries the plan's RED/GREEN evidence.
- **Committed in:** `398691a`

**2. [Rule 3 - Blocking] Biome formatting of the two call sites**
- **Found during:** Task 1
- **Issue:** The longer `photosRefetchInterval(..., q.state.status)` lines exceeded Biome's line width, so `pnpm lint` failed.
- **Fix:** `biome format --write` on the two component files (line wrap only). The `grep -cF` acceptance patterns still match.
- **Committed in:** `47fb985`

**Total deviations:** 2 (1 process note, 1 blocking formatting fix)
**Impact on plan:** None on behavior. No scope creep.

## Issues Encountered
None.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- G-02-3 closed in code. The UAT test 3 human-check (prod build, restart the server with the tab focused, on /upload and /spines) runs at end-of-phase verification.
- Plan 02-14 (G-02-5) remains in Phase 02.

## Verification
- `corepack pnpm test`, `lint`, `typecheck`, `build`: all exit 0 (no "Failed to compile")
- Acceptance greps: POLL_RETRY_MS export 1, both call-site patterns 1, UI-SPEC "while the last poll failed" 1, "corrected by G-02-3" 1, POLL_RETRY_MS in photo-status.test.ts 4

## Self-Check: PASSED

---
*Phase: 02-shelf-scan*
*Completed: 2026-10-20*
