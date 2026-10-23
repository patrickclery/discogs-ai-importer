---
phase: 03-discogs-match
plan: 08
subsystem: ui
tags: [discogs, react, tanstack-query, sqlite, read-model, shadcn]

requires:
  - phase: 03-discogs-match
    provides: "03-03 discogs_searches / discogs_candidates tables and DTO constants; 03-05 handler statuses and error kinds; 03-06 GET /api/discogs/thumb/{candidateId}; 03-01 getDiscogsAuth and discogsGate"
provides:
  - "SpineDto.mediaKind and SpineDto.discogs (state, candidateCount, topCandidates, failure)"
  - "SpinesResponse.discogsActive and SpinesResponse.discogs { connected, pausedUntil }"
  - "src/server/discogs/queries.ts: discogsForSpines, listCandidates, searchStateOf, anyDiscogsActive, discogsConnection"
  - "SearchStateBadge, DiscogsMatches, CandidateList, CandidateRow, CandidateThumb components"
  - "src/lib/candidate-format.ts: detailsLine, labelsText, formatText, searchFailureText"
  - "OrphanFooter exported from spine-card.tsx; /spines cards compose OrphanFooter + DiscogsMatches"
  - "verify-discogs-search step (c2)"
affects: [03-09, 03-10, 03-11, 03-12, 04-collection]

actuals:
  tokens: 10076
  tasks: 1
  commits: 1
plan_head_before: a3539bbff26b465635aef870169b781d5778932e
plan_head_after: 1abeefc97b24cca3d6bdfcba72225046d8c12e07

tech-stack:
  added: []
  patterns:
    - "Per-page Discogs summary in two queries (latest search via ROW_NUMBER over json_each(@ids), candidates via json_each), ordered and deduped in TS"
    - "Card footer composition: orphan row first, then DiscogsMatches (Pitfall 3)"

key-files:
  created:
    - src/server/discogs/queries.ts
    - src/server/discogs/queries.test.ts
    - src/lib/candidate-format.ts
    - src/components/search-state-badge.tsx
    - src/components/discogs-matches.tsx
    - src/components/candidate-list.tsx
    - src/components/candidate-row.tsx
  modified:
    - src/lib/discogs-types.ts
    - src/lib/scan-types.ts
    - src/server/scan/queries.ts
    - src/components/spine-card.tsx
    - src/components/photo-section.tsx
    - src/components/spines-view.tsx
    - src/lib/spine-review.test.ts
    - scripts/verify-discogs-search.ts

key-decisions:
  - "Stored candidates win over Not searched and No matches: a spine with any stored candidate (manual or from an earlier search) reads as '{n} candidates'; a done search with zero stored candidates reads as No matches"
  - "Search summaries are computed over every listed spine (before the review filter), so discogsActive keeps polling while a hidden spine is still being looked up"
  - "discogs.connected uses a try/catch helper (discogsConnection) so an unreadable secrets file means not connected, never a 500, as in GET /api/status"
  - "Failure reasons are cut to 160 code points server-side; the UI strips trailing periods and falls back to 'something went wrong' when no reason is stored"

patterns-established:
  - "searchStateOf(latest, candidateCount) is the single D-11 state mapping; later plans (Show all, Search again, dialog) reuse it via discogsForSpines/listCandidates"

requirements-completed: [DISC-03, DISC-04]

coverage:
  - id: D1
    description: "/api/spines carries each spine's mediaKind, search state, deduped candidate count, top 3 candidates in D-10 order and failure; discogsActive and discogs.connected"
    requirement: DISC-03
    verification:
      - kind: unit
        ref: "src/server/discogs/queries.test.ts#searchStateOf (D-11) and discogsForSpines and listCandidates (D-10)"
        status: pass
      - kind: integration
        ref: "node scripts/verify-discogs-search.ts step (c2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each /spines card shows the search-state badge last in its status slot and a Discogs matches section with up to 3 candidate rows (cover, verbatim title, details line, tags, discogs.com link); orphaned cards keep Re-attach/Dismiss above it"
    requirement: DISC-04
    verification:
      - kind: integration
        ref: "node scripts/verify-discogs-search.ts step (c2) (/spines HTML contains Discogs matches, the verbatim title, the release link, Catalog number match, No matches)"
        status: pass
    human_judgment: true
    rationale: "Visual layout (64px covers, clamped titles, wrapping at 360px, placeholder on a failed cover) and the not-connected / queued / failed lines need an owner look on port 3001"
  - id: D3
    description: "Phase 2 flows unaffected by the SpineDto changes"
    verification:
      - kind: integration
        ref: "VERIFY_SKIP_BUILD=1 NEXT_DIST_DIR=.next/verify node scripts/verify-scan.ts && node scripts/verify-rescan.ts"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 08: Spine card lookup state and Discogs matches Summary

**Every /spines card now shows its Discogs lookup state as a badge, plus up to three candidate releases (cover, verbatim "Artist - Title", year · country · label · catno · format, tags, discogs.com link). The data comes from a two-query read model with D-10 ordering and dedupe.**

## Performance

- **Duration:** 6 min (wall clock per the recorded start/end)
- **Started:** 2026-10-21T02:10:55Z
- **Completed:** 2026-10-21T02:17:10Z
- **Tasks:** 1 (tracer)
- **Files modified:** 15

## Accomplishments
- The read model covers every listed spine in two SQL queries, whatever the spine count. `getSpines` attaches `discogs` and `mediaKind` to each spine and adds `discogsActive` and `discogs { connected, pausedUntil }`.
- `searchStateOf` is the one D-11 mapping. It covers job queued/running/failed/succeeded-while-queued, done, no_match, failed (`unavailable` → fixed copy), `auth_failed` (→ auth copy), and not_connected/skipped (→ Not searched).
- New components:
  - `SearchStateBadge`, with the six states.
  - `DiscogsMatches`: header, at most one notice line, and a body by state with the UI-SPEC copy.
  - `CandidateList`, which shows the top 3.
  - `CandidateRow` / `CandidateThumb`: a lazy 64x64 cover with a Disc3 placeholder on a missing or failed image, plus a link built from the integer release id only.
- Orphaned cards render `OrphanFooter` above the matches section, and `SpineCard`'s `footer ?? OrphanFooter` fallback is unchanged.
- No candidate can be selected, confirmed or clicked (the D-12 prohibition holds).

## Task Commits

1. **Task 1: Tracer, each CD spine card on /spines shows its lookup state and top Discogs matches** - `1abeefc` (feat)

Tracer feedback gate (auto mode): `<verify>` was re-run end to end and passed. typecheck, lint, 784 unit tests and `verify-discogs-search OK` with step (c2) all passed.

## Files Created/Modified
- `src/server/discogs/queries.ts`: discogsForSpines, listCandidates, searchStateOf, anyDiscogsActive, discogsConnection
- `src/server/discogs/queries.test.ts`: state mapping, D-10 order/dedupe, latest-search-with-job
- `src/lib/candidate-format.ts`: detailsLine (labels deduped, at most 2 then +k more; format `2×CD, Album`; `No details on Discogs`), searchFailureText
- `src/lib/discogs-types.ts`: SearchState, SearchFailure, CandidateDto, SpineDiscogsDto, CandidatesResponse, INLINE_CANDIDATES
- `src/lib/scan-types.ts`: SpineDto.mediaKind/discogs, SpinesResponse.discogsActive/discogs
- `src/server/scan/queries.ts`: selects d.media_kind; getSpines attaches the summaries
- `src/components/search-state-badge.tsx`, `discogs-matches.tsx`, `candidate-list.tsx`, `candidate-row.tsx`: new UI
- `src/components/spine-card.tsx`: OrphanFooter exported
- `src/components/photo-section.tsx`: SpineView wires statusSlot and footer; PhotoSection takes connected/pausedUntil
- `src/components/spines-view.tsx`: threads data.discogs into each PhotoSection
- `src/lib/spine-review.test.ts`: fixture gains mediaKind/discogs
- `scripts/verify-discogs-search.ts`: step (c2)

## Decisions Made
See key-decisions in the frontmatter. The most visible one: stored candidates take precedence over Not searched / No matches, so a manual add always shows as "{n} candidates".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Unit tests for the state mapping and D-10 order**
- **Found during:** Task 1
- **Issue:** The failure mapping and manual/catno/rank dedupe order had no automated check. verify-discogs-search only reaches done and no_match.
- **Fix:** Added `src/server/discogs/queries.test.ts` (6 tests). `detailsLine` tests are left to Plan 03-09, which pins those rules.
- **Files modified:** src/server/discogs/queries.test.ts
- **Committed in:** 1abeefc

**2. [Rule 2 - Missing Critical] Connected flag cannot 500 the page**
- **Found during:** Task 1
- **Issue:** The plan's `getDiscogsAuth() !== null` throws if secrets.json is unreadable, which would fail `/api/spines` and `/spines`.
- **Fix:** `discogsConnection()` wraps the call in try/catch, the same way `discogsStatus` does.
- **Files modified:** src/server/discogs/queries.ts
- **Committed in:** 1abeefc

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both are small correctness additions, with no scope creep.

## Issues Encountered
None.

## Known Stubs
- `src/components/discogs-matches.tsx`: the `pausedUntil` prop is accepted but not rendered yet. Plan 03-09 adds the paused notice line with its countdown.
- `src/components/discogs-matches.tsx`: the right-aligned header action group is empty. Plans 03-10 (Search again / Retry search) and 03-11 (Search Discogs…) fill it.

Both are planned slots, and neither blocks this plan's goal.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 03-09 can use `listCandidates` for the Show all route, `discogsActive` for polling, and `pausedUntil` for the paused line.
- Plans 03-10 and 03-11 add buttons to the empty header action group in `DiscogsMatches`.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED
