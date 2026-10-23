---
phase: 03-discogs-match
plan: 11
subsystem: discogs
tags: [discogs, manual-search, release-link, dialog, react, route-handler, jobs]
status: complete

requires:
  - phase: 03-discogs-match
    provides: "03-10 POST /api/spines/{id}/search { mode: 'again' } and enqueueExplicitSearch; 03-05 search_spine branches; 03-09 candidates GET and CandidateRow; 03-03 ReleaseSchema, toCandidateFromRelease and the fake GET /releases/{id}"
provides:
  - "parseDiscogsRef(input) and MASTER_REFUSAL in src/lib/discogs-ref.ts (client-safe), pinned by discogs-ref.test.ts"
  - "POST /api/spines/{id}/search modes text and ref (400 master, 400 invalid_ref, 400 empty text; text that reads as a release becomes a release search)"
  - "enqueueExplicitSearch kinds manual (search_spine, inputs rawText only) and release (fetch_release), keyed search:{searchId}, not blocked by a queued auto search"
  - "fetch_release job handler (runFetchRelease, FetchReleasePayload): one paced GET /releases/{id}, done with one stored result or not_found"
  - "GET /api/discogs/searches/{id}: DialogSearchDto for manual and release searches (404 for auto/again)"
  - "POST /api/spines/{id}/candidates { searchId, releaseId }: addManualCandidate copies from stored results (404 search_not_found / release_not_found, 409 not_done, 201 { candidate })"
  - "parseStoredResults(json) in store.ts; SearchResultDto, DialogSearchDto, DIALOG_RESULTS_MAX, DIALOG_INPUT_MAX in discogs-types.ts"
  - "DiscogsSearchDialog with its Search Discogs… trigger; CandidateRowContent and CandidateThumb src override"
  - "verify-discogs-search step (h)"
affects: [03-12]

actuals:
  tokens: 17250
  tasks: 2
  commits: 2
plan_head_before: ba022d9672ec309c82a4d2f4b1c05e681d21f22e
plan_head_after: 00fe570a87b6beb25a17c1152b972c171fa331bd

tech-stack:
  added: []
  patterns:
    - "Dialog searches store results on the search row only; a candidate exists only after the owner's explicit pick, copied server-side from that row"
    - "One pure parser shared by the client form and the route, with the route's answer authoritative"

key-files:
  created:
    - src/lib/discogs-ref.ts
    - src/lib/discogs-ref.test.ts
    - src/server/jobs/handlers/fetch-release.ts
    - src/app/api/discogs/searches/[id]/route.ts
    - src/components/discogs-search-dialog.tsx
  modified:
    - src/lib/discogs-types.ts
    - src/lib/candidate-format.ts
    - src/app/api/spines/[id]/search/route.ts
    - src/app/api/spines/[id]/candidates/route.ts
    - src/server/discogs/enqueue.ts
    - src/server/discogs/store.ts
    - src/server/jobs/handlers/index.ts
    - src/server/jobs/handlers/search-spine.ts
    - src/components/candidate-row.tsx
    - src/components/discogs-matches.tsx
    - scripts/verify-discogs-search.ts

key-decisions:
  - "search_spine never replaces auto candidates for a manual search; a manual search's inputs carry only rawText, so until Plan 03-12's own branch it runs just the text stage and stores results on the row"
  - "Ref mode with a value that is not a release reference answers 400 invalid_ref; text mode with a release reference becomes a release search (server re-parse is authoritative)"
  - "addManualCandidate upserts on (spine_id, 'manual', release_id) and refreshes search_id, fields and created_at, so re-adding moves it to the top"
  - "QUEUED_LINE, SEARCHING_LINE and pausedLine moved to src/lib/candidate-format.ts so the card and the dialog share them without a component import cycle"

patterns-established:
  - "CandidateRowContent renders a candidate's content inside any container (card li, dialog radio option) with an optional cover route"

requirements-completed: [DISC-06]

duration: 8min
completed: 2026-10-21

coverage:
  - deliverable: "parseDiscogsRef classifies every pasted release, master and text form"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/lib/discogs-ref.test.ts"
        status: pass
  - deliverable: "Pasted release link fetches that release once through the lane and adding it pins it first as manual"
    human_judgment: false
    verification:
      - kind: command
        ref: "node scripts/verify-discogs-search.ts (h)"
        status: pass
  - deliverable: "Search Discogs dialog: trigger, disabled tooltip, prefill and select, master field error, unselected release with check-it line, Adding… state, toast and focus return"
    human_judgment: true
    rationale: "Dialog interaction, focus and visual states are not exercised by an automated test; verify at end-of-phase UAT"
  - deliverable: "Route refusals for the candidates POST (foreign, automatic, queued, unknown release, non-JSON)"
    human_judgment: true
    rationale: "Implemented here; Plan 03-12 Task 2 adds the route tests that prove each refusal"
---

# Phase 3 Plan 11: Search Discogs dialog, paste-a-release path Summary

**"Search Discogs…" on every card opens a dialog where a pasted Discogs release link or number is fetched by one paced GET /releases/{id}, shown unselected next to the spine crop, and added on an explicit pick as a manual candidate copied server-side from the stored result.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-21T05:34:13Z
- **Completed:** 2026-10-21T05:42Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- parseDiscogsRef reads bare numbers (1-10 digits, at least 1), [r…]/r… and discogs.com or www.discogs.com links with /release/{id} anywhere in the path (with or without a scheme) as releases. It reads [m…]/m… and /master/ links as masters. Everything else is text, including other hosts, '0', 11 digits and malformed URLs. `new URL` only runs inside try.
- The search route takes a discriminated body: again, text and ref, with values capped at 500 characters. The server re-parses. A master answers 400 { error: 'master' }, empty text answers 400, and the again answers are unchanged.
- enqueueExplicitSearch handles kinds manual and release. Neither is blocked by a queued auto search, and both work for orphaned spines of any media kind.
- The fetch_release handler uses search-spine's checks (skipped, not_connected, auth_failed, paused gate, 429 defer, 401, 5xx retry, other 4xx failed). On success it stores exactly one result with stage 'release', and on 404 it finishes not_found. It never writes discogs_candidates.
- GET /api/discogs/searches/{id} maps row and job status to queued/searching/done/no_match/not_found/failed. It returns at most 25 results with alreadyListed, totalCount and the gate's pausedUntil.
- POST /api/spines/{id}/candidates accepts only { searchId, releaseId }. It copies the release from that spine's own done manual or release search, and the new candidate lists first, tagged "Added manually".
- In the dialog, the crop sits for comparison above one input. The input is prefilled with artist + title, else the catalog number, and is focused and selected on open. A master link sets the field error with aria-invalid and sends nothing. A release is one unselected radio option under the check-it line. "Add to candidates" shows "Adding…" with both footer buttons disabled. On success the dialog closes, the toast "Added {title} to spine #{n}" shows, focus returns to the trigger, and the dialog invalidates ['spines'] and ['discogs-candidates', id] and fires app:status-refresh. When Discogs is not connected, the trigger is disabled with the tooltip "Connect Discogs in Settings first" on a focusable wrapping span.

## Task Commits

1. **Task 1 (tracer): paste a release, check it, add it** - `d77d6cc` (feat)
2. **Task 2: parser table tests** - `00fe570` (test)

## Files Created/Modified

- `src/lib/discogs-ref.ts`, `src/lib/discogs-ref.test.ts`: the parser and its table
- `src/server/jobs/handlers/fetch-release.ts`, `index.ts`: the fetch_release handler and its registration (60 s timeout)
- `src/app/api/discogs/searches/[id]/route.ts`: dialog polling
- `src/app/api/spines/[id]/search/route.ts`: text and ref modes
- `src/app/api/spines/[id]/candidates/route.ts`: the POST that adds a manual candidate
- `src/server/discogs/enqueue.ts`, `store.ts`: explicit kinds; parseStoredResults, addManualCandidate
- `src/server/jobs/handlers/search-spine.ts`: no auto-candidate replacement for non-auto searches
- `src/components/discogs-search-dialog.tsx`, `discogs-matches.tsx`, `candidate-row.tsx`: the dialog, its trigger and CandidateRowContent
- `src/lib/discogs-types.ts`, `src/lib/candidate-format.ts`: DTOs and shared state copy
- `scripts/verify-discogs-search.ts`: step (h)

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Manual searches must not replace automatic candidates**
- **Found during:** Task 1
- **Issue:** This plan enqueues kind manual on search_spine, but the manual branch arrives only in Plan 03-12. Without a guard, a manual search would run the cascade and replace the spine's auto candidates, which breaks D-16.
- **Fix:** search_spine skips replaceAutoCandidates unless the search kind is auto or again. Manual inputs carry only rawText, so the cascade runs just the text stage and its results stay on the row.
- **Files modified:** src/server/jobs/handlers/search-spine.ts, src/server/discogs/enqueue.ts
- **Commit:** d77d6cc

**2. [Rule 3 - Blocking] The dialog needs CandidateRow content inside a radio option, with a different cover route**
- **Fix:** I split out CandidateRowContent and gave CandidateThumb an optional src. CandidateRow renders exactly what it did before.
- **Commit:** d77d6cc

**3. [Rule 3 - Blocking] Shared state copy without a component import cycle**
- **Fix:** QUEUED_LINE, SEARCHING_LINE and pausedLine moved from discogs-matches.tsx to src/lib/candidate-format.ts. Only discogs-matches used them.
- **Commit:** d77d6cc

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking). **Impact:** No change to scope.

## TDD Note

Task 2 is tdd="true", but the tracer Task 1 had already shipped the parser, so the 30 table tests passed on their first run (no RED phase). To check that the tests discriminate, I temporarily removed the host allowlist and the id >= 1 check. Four tests failed, and the file was restored from git.

## Known Stubs

| File | Line | Reason |
|------|------|--------|
| src/components/discogs-search-dialog.tsx | NOTHING_TO_ADD_LINE | no_match, not_found and failed show a neutral "Nothing to add from this search." line. Plan 03-12 adds the UI-SPEC copy for each, which is grep-guarded as absent before that plan. |
| src/components/discogs-search-dialog.tsx | thumbSrc | Result covers point at /api/discogs/searches/{id}/thumb/{releaseId}, which Plan 03-12 adds. Until then the Disc3 placeholder shows (as the plan specifies). |

Both are recorded in .planning/WINDOWS.md.

## Issues Encountered

None.

## Verification

- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`: all pass (56 files, 851 tests)
- `node scripts/verify-discogs-search.ts`: step (h) printed "ok: ref search done with release 1820636 (one GET, project UA); added as manual and listed first", step (f) is still last, and the run ended with "verify-discogs-search OK"
- Acceptance greps: fetch_release in handlers/index.ts (1), addManualCandidate in the candidates route (2), the master copy in discogs-ref.ts (1), parseDiscogsRef in the search route (3)
- Tracer gate (auto mode): the verify re-ran green before expansion

## Next Phase Readiness

Ready for 03-12: the manual branch in search_spine (per_page 25), the dialog cover route, the remaining dialog copy and states, and the route/store/fetch-release tests.

## Self-Check: PASSED
