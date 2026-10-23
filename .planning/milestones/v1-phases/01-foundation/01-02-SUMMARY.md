---
phase: 01-foundation
plan: 02
subsystem: jobs
tags: [jobs, queue, worker, lease, sqlite, retry, backoff, portability, hmr]

requires:
  - phase: 01-01
    provides: queue.ts, worker.ts, worker_lease table, paths.ts, scripts/lib/server.ts harness, dev job hooks
  - phase: 01-06
    provides: Vitest harness, useTempDataDir(), queue.test.ts happy path, proxy Origin rules
provides:
  - Retry with 2 s / 4 s backoff then failed; recovery that never exceeds max_attempts runs
  - Per-handler timeout via AbortSignal raced against the handler
  - worker_lease: one worker per DATA_DIR across processes, takeover of dead/stale holders
  - Exit hook (stopWorker + closeDb) so a stopped app leaves only app.db
  - resolveData() traversal guard (absolute, `..`, sibling-prefix)
  - StatusResponse.lease
  - verify-restart, verify-hmr, verify-portability e2e proofs
affects: [01-03, 01-04, phase-2, phase-3, phase-4]

tech-stack:
  added: []
  patterns:
    - "Attempt-guarded complete/failOrRetry: only the claim that produced attempt N may write"
    - "Lease-gated lanes with a generation counter; lease loss aborts in-flight with WorkerStoppedError and leaves the row for recovery"
    - "Abort reasons compared by error name, not instanceof (HMR can leave two class copies)"
    - "All worker timers unref()"

key-files:
  created:
    - src/server/jobs/lease.ts
    - src/server/jobs/lease.test.ts
    - src/server/storage/paths.test.ts
    - scripts/lib/jobs.ts
    - scripts/verify-restart.ts
    - scripts/verify-hmr.ts
    - scripts/verify-portability.ts
  modified:
    - src/server/jobs/queue.ts
    - src/server/jobs/queue.test.ts
    - src/server/jobs/worker.ts
    - src/server/jobs/handlers/noop.ts
    - src/server/storage/paths.ts
    - src/server/boot.ts
    - src/app/api/status/route.ts
    - src/app/api/dev/jobs/route.ts
    - src/lib/status-types.ts

key-decisions:
  - "complete() and failOrRetry() take an optional attempt guard; a stale claim (job recovered and re-claimed elsewhere) cannot overwrite the new run (failOrRetry returns 'stale')"
  - "A handler aborted because the worker stopped or lost its lease writes nothing; the job stays running and the next lease holder's recovery requeues or fails it"
  - "stopWorker() removes the globalThis worker so a later startWorker() starts fresh; it releases the lease only if it held it"
  - "Dev jobs route reuses the exported NoopPayload schema from the handler, so failTimes/writeFile are validated at the edge"

requirements-completed: [FOUND-04, FOUND-02]

coverage:
  - id: R1
    description: "Retry after 2 s then 4 s, failed after attempt 3 and never run again; recovery fails jobs interrupted on the final attempt"
    requirement: FOUND-04
    verification:
      - kind: unit
        ref: "src/server/jobs/queue.test.ts"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-restart.ts (scenario B)"
        status: pass
    human_judgment: false
  - id: R2
    description: "SIGKILL mid-job then restart completes every job exactly once (J1 attempts 2, J2/J3 attempts 1, 3 rows)"
    requirement: FOUND-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-restart.ts (scenario A)"
        status: pass
    human_judgment: false
  - id: R3
    description: "Second process on the same DATA_DIR reports worker null, takes over within 10 s of the holder's SIGKILL"
    requirement: FOUND-04
    verification:
      - kind: unit
        ref: "src/server/jobs/lease.test.ts"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-restart.ts (scenario C)"
        status: pass
    human_judgment: false
  - id: R4
    description: "Hot reload of worker.ts, page.tsx, instrumentation.ts keeps bootId, starts=1 and pid"
    requirement: FOUND-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-hmr.ts"
        status: pass
    human_judgment: false
  - id: R5
    description: "SIGTERM leaves only app.db; copy-and-delete to a new path keeps counts and files; no absolute path stored; escaping paths fail"
    requirement: FOUND-02
    verification:
      - kind: unit
        ref: "src/server/storage/paths.test.ts"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-portability.ts; verify-restart scenario D"
        status: pass
    human_judgment: false

actuals:
  tokens: 12155
  tasks: 3
  commits: 5
plan_head_before: 8bd4db9b8976cf942e140dedf055f91b98941829
plan_head_after: 3b70d5c667be22f2d89553a6bd8176aa93c72e66

duration: 7min
completed: 2026-10-19
status: complete
---

# Phase 1 Plan 02: Restart-safe queue and single worker Summary

**Lease-gated single worker per DATA_DIR with 2 s/4 s retry backoff, crash recovery capped at 3 runs, per-handler AbortSignal timeouts and a traversal-guarded resolveData, proven by kill -9, HMR, two-process and copy-the-folder scripts.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-19T06:05:47Z
- **Completed:** 2026-10-19
- **Tasks:** 3/3
- **Files:** 16 changed

## Accomplishments

- queue.ts: `backoffMs`, `failOrRetry`, `recoverRunningJobs` (immediate transaction; final-attempt interruptions fail with "interrupted after final attempt").
- worker.ts: per-job AbortController raced against the handler, lease-gated lanes, 5 s heartbeat, `stopWorker()`; `getWorkerInfo()` is null unless this process holds the lease.
- lease.ts: acquire when absent/ours/stale (>15 s)/dead pid, all in one immediate transaction.
- boot.ts: once-only `process.once('exit')` hook: stopWorker then closeDb (WAL checkpoint).
- noop handler: `failTimes` and `writeFile` (via `resolveData`, idempotent overwrite).
- 43 unit tests (queue, paths, lease incl. 500-step three-holder invariant); 3 e2e scripts.

## Task Commits

1. **Task 1: retry/recovery/dedupe/timeout/resolveData**: `8def52d` (test, red), `7f0226f` (feat)
2. **Task 2: worker lease + exit hook**: `4f9f98b` (test, red), `78379f3` (feat)
3. **Task 3: e2e proofs**: `3b70d5c` (test)

## Verification

- `corepack pnpm test`: 43/43 pass; `corepack pnpm typecheck`: 0 errors; `corepack pnpm lint`: clean
- `node scripts/verify-restart.ts`: verify-restart OK (~30 s)
- `VERIFY_SKIP_BUILD=1 node scripts/verify-portability.ts`: verify-portability OK
- `node scripts/verify-hmr.ts`: verify-hmr OK; `git diff --exit-code` on the three touched files is clean
- Regression: `verify-skeleton` and `verify-guard` still OK
- `ls drizzle/*.sql | wc -l` = 1 (no migration); no script imports from src/; no stray server processes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Attempt guard on complete/failOrRetry**
- **Found during:** Task 1
- **Issue:** After a lease loss, the old process could complete or fail a job that the new holder had recovered and re-claimed.
- **Fix:** Optional `attempt` argument; writes require `status = 'running' AND attempts = attempt`. `failOrRetry` returns `'stale'` when it no longer owns the claim (contract listed only `'queued' | 'failed'`). Aborts with `WorkerStoppedError` skip DB writes.
- **Files:** src/server/jobs/queue.ts, src/server/jobs/worker.ts
- **Commit:** 7f0226f, 78379f3

**2. [Rule 2 - Correctness] Dev jobs route validates the extended noop payload**
- **Found during:** Task 1
- **Issue:** The route kept its own `{ ms }` schema, so bad `failTimes`/`writeFile` would be stored rather than rejected with a 400.
- **Fix:** `NoopPayload` exported from handlers/noop.ts and imported by the route (file outside `files_modified`).
- **Commit:** 7f0226f

**3. [Rule 3 - Blocking/DRY] Added scripts/lib/jobs.ts**
- Shared status/job helpers for the three verify scripts (not in `files_modified`). Imports nothing from src/.
- **Commit:** 3b70d5c

## Known Stubs

None.

## Next Phase Readiness

- Phase 2 can enqueue Claude jobs on the anthropic lane; handlers must be idempotent and honor `ctx.signal` (timeout and stop both abort it).
- Restart dev after handler edits (Pitfall 9); HMR never starts a second worker.

## Self-Check: PASSED
