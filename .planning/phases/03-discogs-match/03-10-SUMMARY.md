---
phase: 03-discogs-match
plan: 10
subsystem: discogs
tags: [discogs, search-again, retry, dedupe, react, route-handler]
status: complete

requires:
  - phase: 03-discogs-match
    provides: "03-07 enqueueAutoSearch and inputs.ts hashing; 03-05 search_spine 'again' handling; 03-08/03-09 discogsForSpines, DiscogsMatches header and notice-line slots"
provides:
  - "POST /api/spines/{id}/search { mode: 'again' } (201 { searchId }; 415, 400, 404, 409 not_searchable / not_connected / busy)"
  - "enqueueExplicitSearch(db, { spineId, kind: 'again' }) with dedupe key search:{searchId}, in one IMMEDIATE transaction"
  - "SpineDiscogsDto.fieldsChanged and fieldsChangedSince(latest, fields) in queries.ts"
  - "DiscogsMatches: Search again / Retry search (matchesAction), Queuing… pending state, inline 'Couldn't start the search: {reason}.', fields-changed notice line"
  - "verify-discogs-search step (g)"
affects: [03-11, 03-12]

actuals:
  tokens: 9900
  tasks: 2
  commits: 2
plan_head_before: a2fbeebe3a04fd66e2e69ed9a86b52bba1fa3f8d
plan_head_after: 358df3bbe117deeb012db385708eb7e78b9e2584

tech-stack:
  added: []
  patterns:
    - "Explicit owner actions use a per-row dedupe key (search:{searchId}); refusals are checked inside the same IMMEDIATE transaction as the write"

key-files:
  created:
    - src/app/api/spines/[id]/search/route.ts
    - src/app/api/spines/[id]/search/route.test.ts
  modified:
    - src/server/discogs/enqueue.ts
    - src/server/discogs/enqueue.test.ts
    - src/server/discogs/queries.ts
    - src/server/discogs/queries.test.ts
    - src/lib/discogs-types.ts
    - src/components/discogs-matches.tsx
    - scripts/verify-discogs-search.ts

key-decisions:
  - "fieldsChanged ignores a latest search that ended not_connected or skipped: it never reached Discogs, so no matches are out of date (the backfill re-searches those)"
  - "enqueueExplicitSearch re-checks spine state and busy inside its IMMEDIATE transaction so two quick clicks cannot both pass; busy = latest auto/again search still queued with a queued or running (or unlinked) job"
  - "Retry search shows for any failed state (including auth failures, which the route answers 409 not_connected); Search again only when fieldsChanged and not queued or searching"

patterns-established:
  - "Read-model fieldsChanged hashes current spine_fields through the same searchInputs/inputHash as the enqueue, so both agree on what counts as a change"

requirements-completed: [DISC-05]

duration: 6min
completed: 2026-10-21

coverage:
  - deliverable: "POST /api/spines/{id}/search refusals and 201"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/app/api/spines/[id]/search/route.test.ts"
        status: pass
  - deliverable: "Identical re-searches always run (per-search dedupe key)"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/server/discogs/enqueue.test.ts#enqueueExplicitSearch"
        status: pass
      - kind: command
        ref: "node scripts/verify-discogs-search.ts (g)"
        status: pass
  - deliverable: "fieldsChanged in the read model"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/server/discogs/queries.test.ts#fieldsChanged (D-14)"
        status: pass
      - kind: command
        ref: "node scripts/verify-discogs-search.ts (g)"
        status: pass
  - deliverable: "Search again / Retry buttons, Queuing… state, inline error, narrow-window wrapping"
    human_judgment: true
    rationale: "Flow over time and 360px wrapping are visual (plan human-check, UI E7 overflow backstop)"
---

# Phase 3 Plan 10: Search again and Retry search Summary

**After an edit the spine card says "Fields changed since last search." and offers Search again; it and Retry search post { mode: 'again' } to a new route that queues a fresh search keyed search:{searchId}, so identical re-searches are never swallowed.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-21T05:25:48Z
- **Completed:** 2026-10-21T05:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- POST /api/spines/{id}/search answers 415 for non-JSON, 400 for a bad body, 404 for an unknown spine, 409 not_searchable, not_connected or busy, and otherwise 201 { searchId }.
- enqueueExplicitSearch creates an 'again' search from the current inputs with its own dedupe key, so it runs even when the inputs match an earlier search (Pitfall 1).
- SpineDiscogsDto.fieldsChanged compares the latest auto/again search's input hash with the current normalized fields. Whitespace-only edits don't count.
- The matches header shows Search again (when fieldsChanged and not queued or searching) or Retry search (when failed). While pending it shows a spinner and "Queuing…". A refused request shows an inline role=alert error. On success it invalidates ['spines'] and ['discogs-candidates', id] and dispatches app:status-refresh. The fields-changed notice is priority 2, after not-connected.
- verify-discogs-search step (g): changing Owen Ashby's artist to Juniper Vale starts no search but flips fieldsChanged. Search again then finishes done at artist_title with 3 candidates and clears the flag. Two more identical re-searches add 2 searches and 2 jobs.

## Task Commits

1. **Task 1 (tracer): Search again end to end** - `011c8bd` (feat)
2. **Task 2: refusals, dedupe and fieldsChanged tests** - `358df3b` (test)

## Files Created/Modified

- `src/app/api/spines/[id]/search/route.ts` - POST mode 'again'
- `src/app/api/spines/[id]/search/route.test.ts` - route contract
- `src/server/discogs/enqueue.ts` - enqueueExplicitSearch
- `src/server/discogs/queries.ts` - fieldsChanged, fieldsChangedSince, FIELDS_SQL
- `src/lib/discogs-types.ts` - SpineDiscogsDto.fieldsChanged
- `src/components/discogs-matches.tsx` - header action, notice line, inline error
- `scripts/verify-discogs-search.ts` - step (g)
- `src/server/discogs/enqueue.test.ts`, `src/server/discogs/queries.test.ts` - new cases

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fieldsChanged ignores never-ran searches**
- **Found during:** Task 1
- **Issue:** Read literally, a spine whose latest search ended not_connected or skipped would show "Fields changed since last search." after an edit, even though that search never reached Discogs and made no matches.
- **Fix:** fieldsChangedSince returns false for those statuses. Pinned by a queries test.
- **Files modified:** src/server/discogs/queries.ts, src/server/discogs/queries.test.ts
- **Commit:** 011c8bd, 358df3b

**2. [Rule 3 - Blocking] The existing discogsForSpines toEqual test needed the new field**
- **Found during:** Task 1
- **Fix:** Added `fieldsChanged: false` to the expected not-searched summary.
- **Commit:** 011c8bd

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking). **Impact:** None on scope.

## TDD Note

Task 2 is tdd="true", but the tracer Task 1 already shipped the behaviour, so the new tests passed on their first run (no RED phase). To check they really discriminate, I temporarily set the dedupe key back to a fixed per-spine key. The enqueue and route tests then failed, and I restored the per-search key.

## Issues Encountered

None.

## Verification

- `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test`: all pass (55 files, 821 tests)
- `node scripts/verify-discogs-search.ts`: "verify-discogs-search OK", with step (g) printing ok
- Acceptance greps: enqueueExplicitSearch in route (2), fieldsChanged in queries.ts (3), "Fields changed since last search." in discogs-matches.tsx (1), 'busy' in route (2)

## Next Phase Readiness

Ready for 03-11, which extends the same route's Body with the text and ref modes and adds Search Discogs… to the header action group.

## Self-Check: PASSED
