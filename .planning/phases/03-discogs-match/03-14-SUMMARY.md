---
phase: 03-discogs-match
plan: 14
subsystem: discogs-match
status: complete
tags: [discogs, read-model, enqueue, gap-closure, CR-01, WR-01]
requires: [03-13]
provides:
  - "effectiveSearch: card state from a covering baseline when the latest search never reached Discogs"
  - "UNSEARCHED_STATUSES / NON_BASELINE_STATUSES and their SQL lists: the one shared status rule"
  - "notSearchedLine: which not-searched line the card body shows"
affects: [src/server/discogs, src/components/discogs-matches.tsx]
tech-stack:
  added: []
  patterns:
    - "Status lists in SQL are built only from typed SearchStatus constants (statusListSql)"
    - "End-to-end tests drive the real search_spine handler against a stub fetch on a fake clock, one job at a time"
key-files:
  created:
    - src/server/discogs/reactivated-spine.test.ts
    - .planning/phases/03-discogs-match/03-14-red-evidence.json
    - .planning/phases/03-discogs-match/03-14-red-evidence-task2.json
  modified:
    - src/server/discogs/store.ts
    - src/server/discogs/queries.ts
    - src/server/discogs/enqueue.ts
    - src/components/discogs-matches.tsx
    - src/components/discogs-matches.test.ts
decisions:
  - "A latest search in UNSEARCHED_STATUSES over a baseline that covers the current inputs shows the baseline's outcome (D-11); fieldsChanged still comes from the baseline hash"
  - "NON_BASELINE_STATUSES = UNSEARCHED_STATUSES + auth_failed; the SQL list order changed to (not_connected, skipped, auth_failed), meaning unchanged"
metrics:
  duration: 4min
  completed: 2026-10-21
  tasks: 2
  files: 6
actuals:
  tokens: 9500
  tasks: 2
  commits: 4
plan_head_before: 882610869801dcc880c592bab0d4da97602aa518
plan_head_after: 9aefe9cf5d88e6724b05a97d2ac0ca936c1173a3
---

# Phase 03 Plan 14: CR-01 re-activated spines and the shared status rule Summary

A re-activated CD spine is now either auto-searched again through the lease-tick maintenance hook or re-scan merge, or shows the real result of the baseline search that already covered its inputs. "Waiting its turn" appears only when the maintenance hook will queue the spine, and a 12-row invariant table proves it.

## What changed

- **reactivated-spine.test.ts (new, 4 tests):** CR-01 re-attach through the real `maintenance` array, the re-scan path (same transaction, no tick), Re-attach before the job runs (done, not skipped), and the covered-baseline case.
- **queries.ts:** the LATEST_SQL baseline CTE now carries status, error_kind, error and job status. The new `effectiveSearch()` returns the baseline row when the latest status is in UNSEARCHED_STATUSES and baseline_hash equals `inputHash(searchInputs(fields))`. `searchStateOf` maps UNSEARCHED_STATUSES to not_searched before the switch, so no literal status labels remain.
- **store.ts:** added `UNSEARCHED_STATUSES`, `NON_BASELINE_STATUSES` and `UNSEARCHED_STATUSES_SQL`. `NON_BASELINE_STATUSES_SQL` is rebuilt through a private `statusListSql` typed on SearchStatus (T-03-45).
- **enqueue.ts:** the backfill selector uses `UNSEARCHED_STATUSES_SQL`. The includeAuthFailed branch and the WR-01 no-write-lock precheck are unchanged.
- **discogs-matches.tsx:** the exported `notSearchedLine(spine, connected)` drives Body's not-searched branch. Rendered output is unchanged.
- **discogs-matches.test.ts:** added the invariant table (waiting line iff `enqueueMissingSearches` queues), the notSearchedLine mapping, and the same-millisecond ULID ordering tie.

## TDD Gate Compliance

| Task | RED commit | GREEN commit | RED evidence |
|------|-----------|--------------|--------------|
| 1 | 57b3a7d | 2aabf4a | `03-14-red-evidence.json`: RED_EVIDENCE_OK. Target "a re-activated spine whose baseline already searched its current inputs…" failed with `expected 'not_searched' to be 'no_match'`. The other 3 tests already passed at HEAD, because 6219ea8/1e0d5b7 had landed the key release and backfill. |
| 2 | 082f998 | 9aefe9c | `03-14-red-evidence-task2.json`: RED_EVIDENCE_OK. Target "notSearchedLine: …" failed with `TypeError: notSearchedLine is not a function`. The 4 not_searched invariant rows failed for the same reason. The other rows and the ordering tie already held after Task 1 and are pinned now. |

There was no refactor step. Tracer gate (auto mode): the Task 1 verify passed again end to end (4/4) before expanding.

## Verification

- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` all exit 0, with 956 tests passing (938 before) across 64 files.
- Acceptance greps: enqueue.ts has 2 UNSEARCHED_STATUSES_SQL and 0 literal lists. queries.ts has 0 literal `'not_connected'`/`'skipped'` outside comments and 5 UNSEARCHED_STATUSES. There is 1 `export function notSearchedLine`, the test file has 7 notSearchedLine, reactivated-spine.test.ts has 6 maintenance, and queries.ts has 4 baseline_status.
- Human check (backstop, end-of-phase): on the Spines page at port 3001, re-attach a "No longer detected" spine and reload after about 10 s. It should show Queued, then Searching, then matches or "Discogs found nothing", and never stay on "waiting its turn".

## Deviations from Plan

**1. [Rule 3 - Blocking] Single-line state assertion added before toMatchObject in the covered-baseline test.**
- **Found during:** Task 1 RED.
- **Issue:** Vitest's tap-flat reporter emits toMatchObject diffs as multi-line, unindented YAML. The RED classifier rejected that as malformed TAP.
- **Fix:** added `expect(discogs?.state).toBe('no_match')` ahead of the planned `toMatchObject`, so the report is valid TAP. The planned assertion is still there.
- **Commit:** 57b3a7d.

**2. [Rule 2] An extra check in the covered-baseline test:** the maintenance hook runs while s0 is orphaned, and the test asserts that it adds no search (prohibition "MUST NOT queue … not active").

The RED evidence JSON files are committed in the phase directory as TDD gate records.

## Known Stubs

None.

## Self-Check: PASSED
