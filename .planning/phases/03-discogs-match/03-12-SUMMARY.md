---
phase: 03-discogs-match
plan: 12
subsystem: discogs
tags: [discogs, manual-search, dialog, react, route-handler, jobs, tests]
status: complete

requires:
  - phase: 03-discogs-match
    provides: "03-11 search route text/ref modes, enqueueExplicitSearch manual/release, fetch_release, GET /api/discogs/searches/{id}, candidates POST, DiscogsSearchDialog; 03-06 ensureThumb; 03-05 search_spine branches"
provides:
  - "search_spine kind manual branch: one GET /database/search { q, type=release, format=CD, per_page=25, page=1 }, at most 25 stored results, total from pagination, never writes discogs_candidates"
  - "GET /api/discogs/searches/{id}/thumb/{releaseId}: dialog result covers from stored results_json only (manual and release searches)"
  - "Dialog states: Already listed badge, first-25 note, no-results, not-found, search-failed copy, paused countdown, polite role=status announcement"
  - "useSecondsUntil hook shared by discogs-matches and the dialog (src/components/use-seconds-until.ts)"
  - "fetch-release.test.ts; search route mode tests; candidates POST refusal tests; manual-over-auto store test"
  - "verify-discogs-search steps (i) and (j), (f) still last"
affects: [03-verification, 04]

actuals:
  tokens: 15800
  tasks: 2
  commits: 4
plan_head_before: ad4cc735bbec2647134f473446947d671d7efd92
plan_head_after: f4017a569bd4d7f8fc4a595684b8d811043f6f5b

tech-stack:
  added: []
  patterns:
    - "Dialog covers resolve the URL server-side from the search row, keyed by (searchId, releaseId), mirroring the candidate cover route"

key-files:
  created:
    - src/app/api/discogs/searches/[id]/thumb/[releaseId]/route.ts
    - src/app/api/discogs/searches/[id]/thumb/[releaseId]/route.test.ts
    - src/components/use-seconds-until.ts
    - src/server/jobs/handlers/fetch-release.test.ts
  modified:
    - src/server/jobs/handlers/search-spine.ts
    - src/server/jobs/handlers/search-spine.test.ts
    - src/components/discogs-search-dialog.tsx
    - src/components/candidate-row.tsx
    - src/components/discogs-matches.tsx
    - src/app/api/spines/[id]/search/route.test.ts
    - src/app/api/spines/[id]/candidates/route.test.ts
    - src/server/discogs/store.test.ts
    - scripts/verify-discogs-search.ts

key-decisions:
  - "A manual search with an empty stored query finishes failed (rejected) without a request, rather than sending q=''"
  - "The dialog cover route serves only manual and release searches and requires a 1-10 digit releaseId, matching the polling route's 404 for auto/again"
  - "The polite status announces only done ('{n} results') and no_match (the no-results copy), as the UI-SPEC specifies; not-found and failed are visible text only"

patterns-established:
  - "CandidateRowContent takes alreadyListed for the dialog-only secondary badge"

requirements-completed: [DISC-06]

duration: 7min
completed: 2026-10-21

coverage:
  - deliverable: "Manual search_spine branch: one CD-only request of 25, results on the row only"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/server/jobs/handlers/search-spine.test.ts (kind manual)"
        status: pass
      - kind: command
        ref: "node scripts/verify-discogs-search.ts (i)"
        status: pass
  - deliverable: "Dialog result covers from stored results only (T-03-34)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/app/api/discogs/searches/[id]/thumb/[releaseId]/route.test.ts"
        status: pass
  - deliverable: "fetch_release 200 / 404 / defer / auth branches"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/server/jobs/handlers/fetch-release.test.ts"
        status: pass
  - deliverable: "Search route modes and candidates POST refusals (T-03-42)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/app/api/spines/[id]/search/route.test.ts, src/app/api/spines/[id]/candidates/route.test.ts"
        status: pass
  - deliverable: "Manual picks survive a later automatic search and stay first (D-16)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/server/discogs/store.test.ts"
        status: pass
      - kind: command
        ref: "node scripts/verify-discogs-search.ts (j)"
        status: pass
  - deliverable: "Dialog text results, empty, loading, not-found, failed, add-failed states; 25-result scroll in a 600 px window"
    human_judgment: true
    rationale: "Visual dialog states, focus and scrolling are not exercised by an automated test; verify at end-of-phase UAT (the plan's human-check steps)"
---

# Phase 3 Plan 12: Search Discogs dialog free-text search Summary

**Typing in the Search Discogs dialog now runs one paced, CD-only GET /database/search for up to 25 results. The results show with covers served from the stored results, already-listed releases are flagged, and every empty, paused, not-found and failed state has its UI-SPEC copy. New tests cover fetch-release, the search modes, the candidates refusals and the rule that manual picks beat automatic ones.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-21T05:44:00Z
- **Completed:** 2026-10-21T05:51Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- search_spine kind manual sends exactly one request: q = the stored query, type=release, format=CD, per_page=25, page=1. It stores at most 25 results with total_count from pagination.items and finishes done or no_match. It runs the same skipped, not_connected, auth_failed, paused-gate and 429 checks as an automatic search and never touches discogs_candidates.
- GET /api/discogs/searches/{id}/thumb/{releaseId} reads the cover URL from that search's results_json, sends it through ensureThumb (allowlisted host, no redirects) and answers 307 to /api/files/discogs-thumbs/… or 404 with nosniff.
- Dialog changes:
  - The "Already listed" secondary badge appears on rows that are already candidates, and those rows stay selectable.
  - "Showing the first 25 results…" appears when totalCount > 25.
  - The no-results line quotes the query.
  - The not-found and search-failed lines are Caption text-destructive.
  - The queued state shows the paused countdown while the gate is paused.
  - A visually hidden polite status announces "{n} results" ("1 result") or the no-results copy.
- Tests: fetch-release (10 cases), manual branch (8), dialog cover route (7), search modes (9), candidates POST refusals and re-add (8), and manual-over-auto in store.
- verify-discogs-search:
  - (i): the text search for "Static Bloom" finishes done with 1041 marked already listed. The fake logged one signed q=Static Bloom request with per_page=25, the candidate rows did not change, and the cover answered 307.
  - (j): release 999999999 ends not_found. The master link gets a 400 with no request and no new search row. Search again on TR-201 finishes done, and the manual 1820636 is still listed first.

## Task Commits

1. **Task 1 (tracer) RED: manual-branch tests** - `03ef8b2` (test)
2. **Task 1 (tracer) GREEN: manual branch, cover route, dialog states, step (i)** - `2a799c5` (feat)
3. **Task 2: fetch-release / route / store tests, not-found and failed copy, step (j)** - `84a27df` (test)
4. **REFACTOR: manual params and first-25 copy as literals** - `f4017a5` (refactor)

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The countdown hook was needed by the dialog and by discogs-matches**
- **Issue:** useSecondsUntil was private to discogs-matches.tsx, and discogs-matches already imports the dialog, so importing it back would create a cycle.
- **Fix:** Moved it unchanged to src/components/use-seconds-until.ts, and both files now import it.
- **Commit:** 2a799c5

**2. [Rule 3 - Blocking] The Already listed badge needs a slot in CandidateRowContent**
- **Fix:** Added an optional alreadyListed prop. CandidateRow renders exactly as before.
- **Commit:** 2a799c5

**3. [Rule 2 - Missing critical] Tests for the new cover route (T-03-34)**
- **Issue:** The plan lists no test for the dialog cover route, which is an SSRF-relevant surface.
- **Fix:** Added route.test.ts. It checks the 307 for a cached stored cover, and a 404 with no fetch for each of: an unknown search, an absent release, a malformed id, an automatic search, no cover, and an off-host URL.
- **Commit:** 2a799c5

**Total deviations:** 3 auto-fixed. **Impact:** No change to scope.

## TDD Gate Compliance

- Task 1: the RED commit `03ef8b2` came first, with 2 failing tests (per_page 10 instead of 25, and 10 results stored instead of 25). The GREEN commit `2a799c5` follows it.
- Task 2: Plan 03-11 had already implemented every behavior, so all new tests passed on their first run and there was no RED phase. To check that the tests can fail, I temporarily removed the kind check in addManualCandidate and the auto-only filter in replaceAutoCandidates. Four tests failed, and I restored the file from a copy (git diff was empty).

## Known Stubs

None. Both 03-11 dialog stubs in .planning/WINDOWS.md (ids 3 and 4) are now marked fixed.

## Issues Encountered

None.

## Verification

- `corepack pnpm test`: 58 files, 896 tests pass. `corepack pnpm typecheck` and `corepack pnpm lint` are clean.
- `node scripts/verify-discogs-search.ts`: (i) and (j) print "ok:", (f) is still last, and the run ends with "verify-discogs-search OK".
- Acceptance greps: "per_page" in search-spine.ts (1, set to 25), "Showing the first 25 results" in the dialog (1), "Discogs has no release" in the dialog (1). An earlier draft built these values indirectly, so both greps printed 0. The refactor commit f4017a5 writes them out as literals.
- Tracer gate (auto mode): the verify script re-ran green before Task 2.

## Next Phase Readiness

Phase 3's plans are complete. What remains is end-of-phase UAT: the dialog flow, focus, and the 25-result scroll in a 600 px window.

## Self-Check: PASSED
