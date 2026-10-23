---
phase: 03-discogs-match
plan: 09
subsystem: ui
tags: [discogs, react, tanstack-query, shadcn, collapsible, polling]
status: complete

requires:
  - phase: 03-discogs-match
    provides: "03-08 listCandidates/discogsForSpines, CandidateList/CandidateRow, DiscogsMatches notice-line slot, SpinesResponse.discogsActive and discogs { connected, pausedUntil }, verify-discogs-search (c2)"
provides:
  - "GET /api/spines/{id}/candidates (CandidatesResponse in D-10 order; 404 NOT_FOUND for unknown, superseded, dismissed)"
  - "src/components/ui/collapsible.tsx (shadcn Collapsible)"
  - "CandidateList({ spineId, candidates, total }) with Show all {n} / Show fewer under ['discogs-candidates', spineId]"
  - "spinesRefetchInterval(data, status) and DISCOGS_POLL_MS in src/lib/photo-status.ts"
  - "DiscogsNotConnectedAlert on /spines"
  - "Paused countdown notice line (pausedLine) in DiscogsMatches"
  - "verify-discogs-search step (c3)"
affects: [03-10, 03-11, 03-12]

actuals:
  tokens: 8217
  tasks: 3
  commits: 3
plan_head_before: 4f03e32ba799cc1bd3a3bb7ffedadfc85c982680
plan_head_after: 81d6db4e2d1a58c45e87346f092feae85ce5751b

tech-stack:
  added: []
  patterns:
    - "Lazy secondary list under its own query-key prefix (['discogs-candidates', id]), never ['spines', ...] (Pitfall 4)"
    - "Fastest-applicable refetch interval: collect applicable intervals, Math.min, else false"

key-files:
  created:
    - src/components/ui/collapsible.tsx
    - src/app/api/spines/[id]/candidates/route.ts
    - src/app/api/spines/[id]/candidates/route.test.ts
    - src/lib/candidate-format.test.ts
    - src/components/discogs-not-connected-alert.tsx
  modified:
    - src/components/candidate-list.tsx
    - src/components/discogs-matches.tsx
    - src/components/spines-view.tsx
    - src/lib/photo-status.ts
    - src/lib/photo-status.test.ts
    - src/server/discogs/queries.test.ts
    - scripts/verify-discogs-search.ts

key-decisions:
  - "The candidates route lists a spine only when its state is active or orphaned; unknown, superseded and dismissed all answer the same 404 NOT_FOUND body as the reattach route"
  - "Show all fetches only when opened (RestOfList mounts inside CollapsibleContent while open) and renders rows beyond the first 3 from the response; the cached list is reused on reopen"
  - "The paused line shows only for a queued spine while connected, uses 'second' for 1 like the header tooltip, and its 1 s interval stops at pausedUntil and on unmount"

patterns-established:
  - "spinesRefetchInterval is the single /spines polling rule; photosRefetchInterval stays for the /upload photos list"

requirements-completed: [DISC-03, DISC-04]

duration: 6min
completed: 2026-10-21
---

# Phase 3 Plan 09: Show all, details rules and live /spines Summary

**Show all lazily loads every stored Discogs match from a new candidates route, the details/format/label rules are pinned by tests, and /spines polls every 3 s while lookups run, shows a not-connected Alert, and counts down a Discogs pause.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-21T05:18:22Z
- **Completed:** 2026-10-21T05:24:11Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- GET /api/spines/{id}/candidates returns listCandidates order; unknown, superseded and dismissed spines get a 404 (T-03-41).
- CandidateList adds "Show all {n}" / "Show fewer" for more than 3 candidates, with two skeleton rows while loading, "Couldn't load the other matches." with "Try again" on error, and focus back on the trigger when it collapses.
- Tests cover the details line, format and label rules, plus D-10 ordering and dedupe.
- /spines polling: 1.5 s while a photo is active, 3 s while discogsActive, 3 s after a failed poll. The fastest applicable interval wins, and polling stops when none applies.
- The page-level "Discogs isn't connected" Alert links to Settings through an outline "Open Settings" button. Queued spines show the paused countdown.

## Task Commits

1. **Task 1 (tracer): Show all brings in every stored match**: `7983827` (feat)
2. **Task 2: details, format, labels and order pinned by tests**: `c21f67c` (test)
3. **Task 3: polling, not-connected Alert, paused countdown**: `81d6db4` (feat)

## Files Created/Modified

- `src/components/ui/collapsible.tsx`: shadcn Collapsible (registry copy, house formatting, no package change)
- `src/app/api/spines/[id]/candidates/route.ts`: GET for every candidate of a spine
- `src/components/candidate-list.tsx`: Show all / Show fewer with a lazy query
- `src/components/discogs-matches.tsx`: passes spineId/total to CandidateList; paused notice line with countdown
- `src/lib/photo-status.ts`: `DISCOGS_POLL_MS`, `spinesRefetchInterval`
- `src/components/spines-view.tsx`: uses spinesRefetchInterval; renders the not-connected Alert
- `src/components/discogs-not-connected-alert.tsx`: the /spines notice
- Tests: `candidate-format.test.ts`, `candidates/route.test.ts`, `queries.test.ts` (one new case), `photo-status.test.ts` (four new cases)
- `scripts/verify-discogs-search.ts`: step (c3)

## Decisions Made

See key-decisions in the frontmatter.

## Deviations from Plan

**1. [TDD - unexpected GREEN] Task 2 tests passed on first run**
- **Found during:** Task 2 RED
- **Issue:** Plan 03-08 had already implemented `detailsLine`/`formatText`/`labelsText` to the full rules, and Task 1 had added the route, so the new tests were green before any Task 2 implementation.
- **Investigation:** A mutation check (MAX_LABELS 3 and qty > 0) failed 6 of the format tests, which confirms the tests detect regressions. No implementation change was needed, so Task 2 is a single `test(...)` commit with no `feat(...)` follow-up.
- **Files modified:** none beyond the tests

**2. queries.test.ts already existed (Plan 03-08)**: it was extended with one case (a release both found and added manually lists once as manual; candidateCount counts the deduped total) instead of being created.

## Verification

- `corepack pnpm test`: 54 files, 805 tests passed. Typecheck and lint are clean.
- `node scripts/verify-discogs-search.ts`: steps (a) to (f), including (c2) and (c3), passed and printed "verify-discogs-search OK".
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts` and `verify-rescan.ts` both passed.
- Tracer gate (auto mode): Task 1's `<verify>` was re-run end-to-end and passed before expansion.
- Human checks (the Show all expand/collapse look and the narrow-window layout; live refresh and the countdown over time) are deferred to the end-of-phase UAT.

## Issues Encountered

None.

## Next Phase Readiness

- Plans 03-10/03-11 can invalidate `['discogs-candidates', spineId]` after a search or add, as the UI-SPEC Polling section requires.

## Self-Check: PASSED
