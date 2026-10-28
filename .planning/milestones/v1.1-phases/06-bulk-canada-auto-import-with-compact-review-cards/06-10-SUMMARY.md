---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 10
subsystem: testing
tags: [e2e, verify-script, fake-discogs, bulk-import, crash-safety]
status: complete

requires:
  - phase: 06-06
    provides: POST /api/spines/bulk-import
  - phase: 06-02
    provides: resolve_pressing job, bulk_runs/bulk_items store
  - phase: 04
    provides: import-flow helpers, hang-after-commit fake mode, D-07 reconcile
provides:
  - GET /masters/{id}/versions on test/fixtures/fake-discogs.mjs (case-sensitive country, major_formats membership, paging, unknown-master shape)
  - scripts/verify-bulk-import.ts (steps a-e, live-stack bulk proof)
affects: [06-verification, phase-06-uat]

actuals:
  tokens: 7300
  tasks: 2
  commits: 2
plan_head_before: d3c9cbe6930f9d06788f9f05498da18cb8a1a6a2
plan_head_after: 1eb46cbae3511efafb6d76317278c3afc7089cc8

tech-stack:
  added: []
  patterns:
    - "Later verify steps isolate on a fresh re-encoded photo: earlier photos' spines set superseded in SQL and the fake collection emptied via /__control"
    - "Pacing is proven by setting the fake limit to 60/min before connect, so every request the gate sends carries the 60 header"

key-files:
  created:
    - scripts/verify-bulk-import.ts
  modified:
    - test/fixtures/fake-discogs.mjs

key-decisions:
  - "Fake limit set to 60/min before connect (not just before the run) so the gate's spacing is already 1112 ms when the run starts; reset to 600 for steps d-e"
  - "Steps d and e isolate by superseding earlier photos' spines in SQL and emptying the fake collection, so bulk picks are neither local duplicates (D-09) nor held already-in-collection (D-05)"

requirements-completed: [BULK-06, BULK-08, BULK-11]

coverage:
  - id: D1
    description: "Fake Discogs answers GET /masters/{id}/versions with Canadian and UK versions, exact case-sensitive filters, paging and the unknown-master shape"
    requirement: BULK-06
    verification:
      - kind: e2e
        ref: "node scripts/verify-bulk-import.ts (step c)"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-import.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A real bulk run adds each spine's Canadian CD (or the top match as fallback_no_version) exactly once, one versions request per lookup with country Canada and format CD, requests paced at least 900 ms apart"
    requirement: BULK-08
    verification:
      - kind: e2e
        ref: "node scripts/verify-bulk-import.ts (step c)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A second start while a run is going answers 409 bulk_running and writes no run"
    requirement: BULK-08
    verification:
      - kind: e2e
        ref: "node scripts/verify-bulk-import.ts (step d)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SIGKILL mid-run with an add POST held, then restart: the run finishes, the held copy is adopted, no release is added twice"
    requirement: BULK-11
    verification:
      - kind: e2e
        ref: "node scripts/verify-bulk-import.ts (step e)"
        status: pass
    human_judgment: false
  - id: D5
    description: "On a real Discogs test account, stopping the app mid bulk import and restarting leaves each album in the collection once, Canadian when listed"
    requirement: BULK-11
    verification: []
    human_judgment: true
    rationale: "Live Discogs account behaviour cannot be exercised by tests (fixtures only); this is the plan's human-check"

duration: 6min
completed: 2026-10-25
---

# Phase 6 Plan 10: Bulk Import Live-Stack Proof Summary

**The fake Discogs now serves `GET /masters/{id}/versions`. `scripts/verify-bulk-import.ts` runs the built app, the worker and the gate against it, and checks four things: each Canadian pressing is added exactly once, the run is paced at about 1.1 s per request, only one run can go at a time, and a SIGKILL mid-run never adds a copy twice.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-25T08:36:06Z
- **Completed:** 2026-10-25T08:42:38Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- The fake's versions route:
  - Master r+50000 lists a Canadian CD (id r+700000, catno `-CA`) and the UK original.
  - Master 51011 lists only the UK version.
  - Unknown masters answer items 8135288 with three unrelated Canadian CDs.
  - `country` is matched exactly and case-sensitively, `format` by membership in major_formats, and per_page/page are honoured.
- Step (c): the tracer-shelf run picked 5 spines.
  - It added 701001, 701031 and 701041 (preferred, Canada) and 1011 (fallback_no_version). The second TR-200 spine was skipped as a duplicate.
  - It made 5 versions requests, all with country=Canada and format=CD.
  - The 13 requests were at least 1110 ms apart, and no stored error names the username.
- Step (d): the first start answered 201 and an immediate second start answered 409 bulk_running. Only one bulk_runs row was written.
- Step (e): the app was SIGKILLed with 701001's add POST held. After the restart the run finished with 4 releases, each with one copy and one POST, and 701001 was adopted with post_count 1.

## Task Commits

1. **Task 1: Tracer, fake versions plus the bulk run proof (a-c)** - `9e8de1b` (feat)
2. **Task 2: One run at a time plus the crash mid-run proof (d-e)** - `1eb46cb` (feat)

## Tracer Feedback Gate

Auto mode was on. After the Task 1 commit, `VERIFY_SKIP_BUILD=1 node scripts/verify-bulk-import.ts` was re-run and passed, so Task 2 went ahead.

## Files Created/Modified
- `test/fixtures/fake-discogs.mjs`: the versions route, its header contract and its fixtures.
- `scripts/verify-bulk-import.ts`: steps a-e. It prints `verify-bulk-import: all steps passed`.

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

**1. [Rule 3 - Blocking] Reads use `withDb` instead of `withWritableDb`**
- **Issue:** The plan asked for bulk_items to be read through withWritableDb with SELECTs only. The read-only `withDb` helper already does that.
- **Fix:** Reads go through `withDb`. `withWritableDb` is used only for the SQL that supersedes earlier photos' spines in steps d and e.
- **Commit:** 9e8de1b, 1eb46cb

**2. [Rule 3 - Blocking] The fake's limit is set to 60/min before connect**
- **Issue:** The fake defaults to 600/min (112 ms spacing). The gate learns the limit only from response headers, so a limit set just before the run might leave the first pair of run requests too close together.
- **Fix:** `/__control { limit: 60 }` is set before connect. It goes back to 600 for steps d and e.
- **Commit:** 9e8de1b

**Total deviations:** 2 (both Rule 3). **Impact:** none on scope.

## Issues Encountered
- The first run failed with a 400: the start body is strict, so the picks were sending extra keys. The extra fields are now stripped before the POST.

## Verification
- `node scripts/verify-bulk-import.ts` (fresh build): passed, all steps.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-import.ts`: passed.
- `grep -c "/masters/" test/fixtures/fake-discogs.mjs` = 4; `SIGKILL` = 5; `bulk_running` = 4.
- tsc and biome are clean.

## User Setup Required
None.

## Next Phase Readiness
The bulk pipeline is proven end to end. The one check left is the human one: run a bulk import on a test Discogs account, interrupt it, and restart.

## Self-Check: PASSED
- scripts/verify-bulk-import.ts and test/fixtures/fake-discogs.mjs exist.
- Commits 9e8de1b and 1eb46cb are ancestors of HEAD.
