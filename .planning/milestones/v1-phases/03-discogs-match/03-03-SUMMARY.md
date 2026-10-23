---
phase: 03-discogs-match
plan: 03
subsystem: api
tags: [discogs, search, sqlite, drizzle, jobs, zod]

requires:
  - phase: 03-discogs-match
    provides: "Plan 03-01: discogsFetch, discogsGate, getDiscogsAuth/isAuthInvalid, fake Discogs with /__control, scripts/lib/discogs.ts"
provides:
  - Migration 0002 with discogs_searches and discogs_candidates (row types DiscogsSearchRow, DiscogsCandidateRow)
  - src/lib/discogs-types.ts (SEARCH_KINDS, SEARCH_STATUSES, SEARCH_STAGES, CANDIDATE_SOURCES, CandidateFormat)
  - inputs.ts normalizeInput/searchInputs/inputHash/loadSpineInputs (plus capCodePoints)
  - search.ts buildStages/runCascade/parseSearchResponse/toCandidateFromSearch/toCandidateFromRelease/rankCandidates/normalizeCatno and the Search/Release zod schemas
  - store.ts createSearch/setSearchJob/getSearch/finishSearch/recordSearchError/replaceAutoCandidates/latestAutoSearch
  - enqueue.ts discogsReady/enqueueAutoSearch/enqueueAutoSearchesForPhoto, hooked into persistRunResult
  - search_spine handler on the discogs lane (timeoutMs 90 000)
  - fake-discogs data API (search scenario, /releases/{id}, /img/*.jpeg) and /__control at429, retryAfter, at5xx, limit
  - scripts/verify-discogs-search.ts steps (a)-(d); scripts/lib/scan.ts shared scan helpers
affects: [03-05, 03-07, 03-08, 03-09, 03-10, 03-11, 03-12, 04]

actuals:
  tokens: 27545
  tasks: 1
  commits: 1

plan_head_before: 4f6c9d822486b2a28f165b6a50f63c1f6a2ade5f
plan_head_after: 52cc7f4cc6a20a490e0c5bfde8ace12e4d933c49

tech-stack:
  added: []
  patterns:
    - "Auto searches are enqueued inside persistRunResult's IMMEDIATE transaction; enqueueAutoSearch's own db.transaction becomes a savepoint there"
    - "discogsReady() never throws, so an unreadable secrets file cannot fail a scan"
    - "The handler searches the inputs captured on the search row at enqueue time, so input_hash always describes what Discogs was asked"
    - "finishSearch is a compare-and-set on status 'queued'; candidates are replaced only when this run finished the row"

key-files:
  created:
    - src/lib/discogs-types.ts
    - src/server/discogs/inputs.ts
    - src/server/discogs/search.ts
    - src/server/discogs/store.ts
    - src/server/discogs/enqueue.ts
    - src/server/jobs/handlers/search-spine.ts
    - drizzle/0002_discogs_match.sql
    - drizzle/meta/0002_snapshot.json
    - scripts/verify-discogs-search.ts
    - scripts/lib/scan.ts
  modified:
    - src/server/db/schema.ts
    - drizzle/meta/_journal.json
    - src/server/scan/store.ts
    - src/server/jobs/handlers/index.ts
    - test/fixtures/fake-discogs.mjs
    - scripts/lib/discogs.ts
    - scripts/verify-scan.ts

key-decisions:
  - "search_spine searches the inputs stored on the search row (inputs_json), not a fresh read of spine_fields, so a field edit between enqueue and run cannot make input_hash lie; the read model's fields-changed check (D-14) catches the edit"
  - "finishSearch runs first in the result transaction and replaceAutoCandidates only when it moved the row from queued, so a replayed or duplicate run never overwrites another run's candidates"
  - "results_json on a finished auto search holds the mapped, ranked candidates (at most 10)"
  - "discogsReady() swallows secrets-file errors and returns false: a scan must never fail because Discogs credentials are unreadable"
  - "A thrown search error is recorded on the row (error_kind = error class name) and rethrown for the worker's retry; Plan 03-05 replaces this with the classified branches"

patterns-established:
  - "Fake Discogs log entries carry the arrival time t and the answered status; image requests log as surface 'img' and never touch the rate counter"
  - "Verify scripts import scan helpers from scripts/lib/scan.ts, never from scripts/verify-scan.ts"

requirements-completed: [DISC-02, DISC-03]

coverage:
  - id: D1
    description: "Boot applies migration 0002: the live app.db has discogs_searches and discogs_candidates and one __drizzle_migrations row per drizzle/*.sql file"
    requirement: DISC-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-search.ts#(a)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A connected owner's finished tracer-shelf scan enqueues exactly one auto search_spine job per active CD spine (6, including the two identical TR-200 spines), and every job succeeds"
    requirement: DISC-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-search.ts#(b) (c)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The cascade stops at the first stage with results (catno, artist_title, text, or no_match) and stores up to 10 candidates with the verbatim title, deduped labels, year, country, formats, thumb, master id, and the exact catalog-number match pinned first and flagged"
    requirement: DISC-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-search.ts#(c)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every /database/search request carries type=release, format=CD, per_page=10, page=1, the project User-Agent and a PLAINTEXT signature with oauth_token, and all API requests are at least 100 ms apart"
    requirement: DISC-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-search.ts#(d)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Existing proofs still pass after the scan-store hook and the fake's changes"
    verification:
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1 node scripts/{verify-skeleton,verify-scan,verify-scan-recovery,verify-restart,verify-rescan,verify-discogs}.ts"
        status: pass
      - kind: unit
        ref: "corepack pnpm test (541 tests)"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 03: Automatic Discogs Search Summary

**Each finished scan now queues one paced, signed Discogs search per CD spine. The search tries the catalog number, then artist and title, then free text, and keeps the top 10 CD releases from the first step that finds anything. An exact catalog-number match is moved to the top. Results go in a new candidates table shared by automatic and manual matches.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-21T01:20:09Z
- **Completed:** 2026-10-21T01:28:32Z
- **Tasks:** 1 (tracer)
- **Files modified:** 17

## Accomplishments
- Migration 0002 adds `discogs_searches` (one row per search attempt) and `discogs_candidates`. The candidates table has a `source` column (auto or manual) and a unique key on spine, source and release, so an auto refresh never touches manual rows (D-16).
- `persistRunResult` queues the searches inside the same transaction that marks the run done. A re-scan only re-queues spines whose search inputs changed (D-08). Spines with identical fields each get their own search.
- The `search_spine` handler runs the search steps through `discogsFetch` with the shared rate gate. Each Discogs result is checked on its own, so one malformed result is dropped without failing the search. The handler then sorts the candidates and saves them together with the finished search row in one transaction.
- The fake Discogs server now answers searches deterministically (so the catalog-number pin has to reorder results), serves releases and thumbnail images, and can inject a 429 or 5xx on demand for Plan 03-05.

## Task Commits

1. **Task 1: Tracer, a connected owner's finished scan gets each CD spine looked up and its candidates stored** - `52cc7f4` (feat)

## Files Created/Modified
- `src/lib/discogs-types.ts` - search kinds, statuses, stages, candidate sources, CandidateFormat
- `src/server/db/schema.ts`, `drizzle/0002_discogs_match.sql`, `drizzle/meta/*` - the two tables and row types
- `src/server/discogs/inputs.ts` - input normalizing (NFC, collapse, 200 code points) and the sha256 input hash
- `src/server/discogs/search.ts` - stage builder, cascade, zod schemas, candidate mapping, catno pin
- `src/server/discogs/store.ts` - search-row and candidate writes
- `src/server/discogs/enqueue.ts` - discogsReady and the auto-search enqueue points
- `src/server/jobs/handlers/search-spine.ts`, `handlers/index.ts` - handler and registration
- `src/server/scan/store.ts` - the scan-done hook
- `test/fixtures/fake-discogs.mjs`, `scripts/lib/discogs.ts` - data API, failure injection, log status and arrival time
- `scripts/verify-discogs-search.ts` - e2e steps (a)-(d)
- `scripts/lib/scan.ts`, `scripts/verify-scan.ts` - shared scan helpers moved out (see Deviations)

## Decisions Made
- The handler searches the inputs that were saved on the search row when it was queued, not the spine's current fields. That way the stored input hash always matches what was sent to Discogs. An edit made while the search waits shows up as "Fields changed" (D-14).
- The search row is marked finished first, and the auto candidates are replaced only if this run did that. A replayed run cannot overwrite the candidates of the run that finished first.
- `discogsReady()` never throws. An unreadable secrets file means no auto searches, not a failed scan.
- For now, a search error is recorded on the row and rethrown so the worker retries it. Plan 03-05 adds the specific handling for 429, 401, 5xx, other 4xx, not connected and vanished spines.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify-scan helpers moved into scripts/lib/scan.ts**
- **Found during:** Task 1
- **Issue:** `scripts/verify-scan.ts` calls `runMain` at module top level, so importing `stepStart`, `upload`, `withDb` or `fakeVisionEnv` from it would also run the whole verify-scan (known since 03-01).
- **Fix:** Moved `Ctx`, `sha256`, `upload`, `withDb`, `countRows`, `storedFile`, `renderJpeg`, `fakeVisionEnv` and `stepStart` unchanged into `scripts/lib/scan.ts`, and added `waitPhotoDone`. `verify-scan.ts` imports them from there.
- **Files modified:** scripts/lib/scan.ts, scripts/verify-scan.ts
- **Verification:** verify-scan OK, verify-discogs-search OK
- **Committed in:** 52cc7f4

**2. [Rule 2 - Correctness] discogsReady() cannot fail a scan**
- **Found during:** Task 1
- **Issue:** `getDiscogsAuth()` reads secrets.json and can throw on a corrupt file. Inside `persistRunResult`, that would have rolled back a finished, already-paid scan.
- **Fix:** `discogsReady()` catches the error and returns false.
- **Committed in:** 52cc7f4

**3. [Rule 1 - Bug] The fake logs request arrival time**
- **Found during:** Task 1
- **Issue:** The fake now logs after it answers (so it can record the status). Logging the time of the answer would have measured handling time instead of request spacing.
- **Fix:** The fake now records `t` when the request arrives and adds `status` to each entry.
- **Committed in:** 52cc7f4

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 correctness, 1 bug)
**Impact on plan:** No scope creep. `scripts/lib/scan.ts` and `scripts/lib/discogs.ts` are the only files outside the plan's file list.

## Issues Encountered
- TR-201's fake result has catno `TR-201`, so it is correctly pinned and flagged `catno_match`. The verify expectation was corrected to match.

## User Setup Required
None.

## Next Phase Readiness
- Plan 03-05 can add the classified error branches in `runSearchSpine` (it already records errors with `recordSearchError` and returns early on a finished row). It can use the fake's `at429`, `retryAfter`, `at5xx` and `revoked` controls.
- Plan 03-07 can build `enqueueMissingSearches` on `enqueueAutoSearch` and pin the `inputs.ts` and `search.ts` rules in unit tests.
- Plans 03-08 and 03-11 read `discogs_candidates` ordered by `rank` and use `toCandidateFromRelease`. The fake's `/releases/{id}` is ready for that.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 10 created files exist and commit 52cc7f4 is on HEAD. Acceptance: 3 sql files, 2 CREATE TABLE, schema/store/index greps pass, and verify-discogs-search ends with OK. Plan verification: typecheck, lint, 541/541 unit tests, plus verify-skeleton, verify-scan, verify-scan-recovery, verify-restart, verify-rescan and verify-discogs all OK (NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1). The prod `.next/BUILD_ID` was unchanged, and :3001 answered 200 throughout.
