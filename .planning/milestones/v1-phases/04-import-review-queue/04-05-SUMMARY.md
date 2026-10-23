---
phase: 04-import-review-queue
plan: 05
subsystem: ui
tags: [review-status, nuqs, filter, read-model, sonner, verify]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 imports table and not_on_discogs; 04-10 ImportDto.phase/instanceId, REVIEW_STATUSES, REVIEW_STATUS_LABELS, SPINE_ACTION_EVENT, scripts/lib/import-flow.ts"
provides:
  - "src/lib/review-status.ts: reviewStatusOf (D-10), parseStatusParam, leftCount, emptyByStatus, movedOutOf, nextShownId"
  - "GET /api/spines: spine.reviewStatus, counts.byStatus, statusById, photoProgress, ?status= filter (ANDs with ?review=1)"
  - "discogsActive also true while a listed import is waiting or importing (3 s poll during imports)"
  - "ReviewStatusFilter + useStatusFilter (nuqs ?status=, scroll: true); exported Count"
  - "Two-row SpinesFilterBar: status group (overflow-x-auto, w-max), then standalone Needs review Toggle and photo Select"
  - "Moved-out-of-filter toast 'Spine #{n} moved to {Status}' with Show, focus to the next card's Discogs section"
  - "scripts/verify-review-queue.ts steps (a) to (d)"
affects: [04-09, 04-14, 04-13, 04-08]

actuals:
  tokens: 14352
  tasks: 2
  commits: 4
plan_head_before: 2be888252fc0bc701bf16f640773ab30b5c38d74
plan_head_after: 1ffd4e553fbd6a0ad1422c8d8704b6aeeac94092

tech-stack:
  added: []
  patterns:
    - "Read-model status: getSpines derives one review status per listed spine; counts, statusById and photoProgress cover the photo filter only, the status and review filters only narrow spines/photos"
    - "Moved-out explanation reads the query cache at announce time (actions refetch before announcing) and otherwise waits for exactly one later data update"
    - "data-discogs-section on the card's Discogs section and data-status-filter-item on the status items as focus anchors"

key-files:
  created:
    - src/lib/review-status.ts
    - src/lib/review-status.test.ts
    - src/components/review-status-filter.tsx
    - scripts/verify-review-queue.ts
    - .planning/phases/04-import-review-queue/tdd-evidence/04-05-task1-red.json
    - .planning/phases/04-import-review-queue/tdd-evidence/04-05-task2-red.json
  modified:
    - src/lib/scan-types.ts
    - src/server/scan/queries.ts
    - src/app/api/spines/route.ts
    - src/app/spines/page.tsx
    - src/components/spines-filter-bar.tsx
    - src/components/spines-view.tsx
    - src/components/discogs-matches.tsx
    - src/lib/spine-review.test.ts

key-decisions:
  - "reviewStatusOf also treats importPhase 'imported' as imported when instanceId is null (defensive; the read model always sets both)"
  - "A spine with no search summary (searchState null) reads pending"
  - "The moved-out toast is evaluated against the cached query data at announce time, because every owner action awaits its refetch before announceSpineAction; when the cache does not yet show the move, the next data update decides, then the announcement is dropped"
  - "Focus after a move goes to the next still-shown card in the previous order, else the nearest card before it, else the pressed status filter item"
  - "discogsActive turns on for import phases waiting and importing only (never already_in_collection or failed)"

patterns-established:
  - "Status filter state: useStatusFilter() next to useReviewFilter()/usePhotoFilter(); the SpinesView query key is ['spines', { photo, review, status }]"
  - "Verify scripts for the review queue build on scripts/lib/import-flow.ts; step letters (a)-(d) are stable for Plan 04-09"

requirements-completed: [REV-03]

coverage:
  - id: D1
    description: "reviewStatusOf gives one status per spine in D-10 order; parseStatusParam accepts only the six exact values; leftCount; movedOutOf; nextShownId"
    requirement: REV-03
    verification:
      - kind: unit
        ref: "src/lib/review-status.test.ts (42 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/spines: every listed spine has reviewStatus, counts.byStatus sums to counts.all, statusById and photoProgress cover the photo filter"
    requirement: REV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-review-queue.ts#(a)"
        status: pass
    human_judgment: false
  - id: D3
    description: "?status= narrows the list, unknown values read as All, ?status=imported&review=1 keeps the same counts"
    requirement: REV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-review-queue.ts#(b)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/spines renders the status filter (Filter by status, Not on Discogs, Needs review)"
    requirement: REV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-review-queue.ts#(c)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A marked spine moves from not_found to not_on_discogs; statusById still names it while ?status=not_found lists none"
    requirement: REV-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-review-queue.ts#(d)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Moved-out toast with Show, focus to the next card's Discogs section, sideways scrolling status row and wrapping row 2"
    verification: []
    human_judgment: true
    rationale: "Toast timing, focus movement and sideways scrolling are only visible in a browser (plan Task 2 human-check)"

duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 05: Review status filter with counts Summary

**Every listed spine now gets one D-10 review status on the server. `/spines` shows a "Filter by status" group (All, Pending, Matched, Imported, Not found, Not on Discogs, Failed, each with a count) above a standalone Needs review toggle and the photo menu. `?status=` narrows the list and survives a reload. When the owner's own action moves a spine out of the active filter, a toast says "Spine #n moved to {Status}" with Show.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-22T10:03:12Z
- **Completed:** 2026-10-22T10:11:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- `reviewStatusOf` applies D-10 top-down: imported, not_on_discogs, failed (import or search, A-04-09), matched, not_found, pending. `parseStatusParam` accepts only the six exact values (T-04-19).
- `getSpines({ photoId, review, status })` sets `reviewStatus` on every listed spine. It returns `counts.byStatus`, `statusById` and `photoProgress` over the photo filter, and it ignores the status and review filters for all three. The status and review filters AND together.
- `discogsActive` is now also true while a listed import is waiting or importing. This is the missing 3 s poll during imports that the 04-10 and 04-03 summaries flagged.
- `ReviewStatusFilter` scrolls sideways in an `overflow-x-auto -mx-1 px-1 pb-1` wrapper at `w-max`. Failed's count turns `text-destructive` above 0. Items with a count of 0 stay enabled. Clicking the pressed item keeps it pressed.
- `SpinesView` listens for `SPINE_ACTION_EVENT`. It shows the moved-out toast with a Show action (switches to that status) and moves focus to the next card's Discogs section, or to the pressed status item when no card is left. Background transitions never toast.
- `scripts/verify-review-queue.ts` passes steps (a) to (d).

## Task Commits

1. **Task 1: Tracer, status filter with counts**
   - RED `af18ac9` (test)
   - GREEN `b353c76` (feat)
2. **Task 2: Moved-out-of-filter toast and focus**
   - RED `cc645cb` (test)
   - GREEN `1ffd4e5` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | Evidence |
|------|-----|-------|----------|
| 1 | `af18ac9` | `b353c76` | `tdd-evidence/04-05-task1-red.json`: RED_EVIDENCE_OK. The target "reviewStatusOf (D-10 order) > a failed import is failed" failed with `'pending'` instead of `'failed'` because `reviewStatusOf` was a stub. The stub exported every symbol, so the file loaded, and 19 behavior tests failed on assertions. |
| 2 | `cc645cb` | `1ffd4e5` | `tdd-evidence/04-05-task2-red.json`: RED_EVIDENCE_OK. The target "movedOutOf > names the new status when the spine left the active filter" failed with `null` instead of `'matched'`. The three null cases passed against the stub. |

No REFACTOR commits were needed. Task 1 was a tracer, and auto mode re-ran `verify-review-queue` after the GREEN commit before Task 2 began. It passed.

## Files Created/Modified
- `src/lib/review-status.ts`: pure status, parser, left count, moved-out and next-card rules
- `src/lib/review-status.test.ts`: 42 unit tests
- `src/lib/scan-types.ts`: `SpineDto.reviewStatus`, `counts.byStatus`, `statusById`, `photoProgress`
- `src/server/scan/queries.ts`: read-model status, counts, the status filter, and the import-aware `discogsActive`
- `src/app/api/spines/route.ts`, `src/app/spines/page.tsx`: `?status=` handling, `initialStatus`
- `src/components/review-status-filter.tsx`: `ReviewStatusFilter`, `useStatusFilter`, `Count`
- `src/components/spines-filter-bar.tsx`: two rows, standalone Needs review `Toggle`
- `src/components/spines-view.tsx`: status in the query key and fetch, moved-out toast and focus
- `src/components/discogs-matches.tsx`: `data-discogs-section` focus anchor
- `src/lib/spine-review.test.ts`: fixture gains `reviewStatus`
- `scripts/verify-review-queue.ts`: e2e steps (a) to (d)

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Focus anchor on the Discogs section**
- **Found during:** Task 2
- **Issue:** The plan says focus moves to "the first focusable control in the Discogs section" of the next card. The section had no selector to find it by.
- **Fix:** Added `data-discogs-section=""` to the root element of `DiscogsMatches`. This is a one-attribute edit to a file outside `files_modified`.
- **Files modified:** `src/components/discogs-matches.tsx`
- **Committed in:** `1ffd4e5`

**2. [Rule 1 - Bug] Moved-out check at announce time**
- **Found during:** Task 2
- **Issue:** Every owner action awaits its `['spines']` refetch before it calls `announceSpineAction`. If the toast logic waited only for "the next data update", it would miss the update that already happened and wait for a poll that may never come.
- **Fix:** The listener first checks the cached query data. Only when the cache does not show the move yet does it wait for one later update, then drop the announcement.
- **Files modified:** `src/components/spines-view.tsx`
- **Committed in:** `1ffd4e5`

**3. [Scope] Step (d) marks the spine through `withWritableDb`**
- The plan says `withDb`, but that helper opens the database read-only. `withWritableDb` from `import-flow.ts` is the writable equivalent.

---

**Total deviations:** 3 (1 blocking, 1 bug, 1 helper choice)
**Impact on plan:** None on scope. All are needed for the planned behavior.

## Known Stubs
- While a status filter is set and no spine matches, `/spines` shows no sections and no empty state. When Needs review is also on, it shows the old "Nothing needs review" copy. Plan 04-14 owns the per-status and combined empty states, the "{i} imported · {l} left" description and the photo-header progress. This plan already computes `photoProgress` and `leftCount` for it.

## Issues Encountered
- Importing `REVIEW_STATUSES` (a value) from `src/lib/import-types.ts` into the verify script makes Node print a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning on stderr. Stdout and the result are unaffected.

## Verification
- `corepack pnpm vitest run src/lib/review-status.test.ts`: 42 passed
- `NEXT_DIST_DIR=.next/verify corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: pass (74 files, 1199 tests)
- `node scripts/verify-review-queue.ts`: (a) to (d) ok, "verify-review-queue OK" (built in `.next/verify`)
- `VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-search.ts`: OK. `VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-import.ts`: OK
- Acceptance greps: reviewStatusOf in queries (2), byStatus in scan-types (2), useStatusFilter (2), ReviewStatusFilter in the filter bar (2), "Filter by status" (1), SPINE_ACTION_EVENT in spines-view (4), "moved to" (1)

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-14 can render the per-status empty states, the page description (with `leftCount`) and the per-photo progress (with `photoProgress`).
- Plan 04-09 can extend `verify-review-queue.ts` after step (d) and use `counts.byStatus.failed` for Retry all failed.
- End-of-phase human check (plan Task 2): on `/spines`, pick Pending, then Add on the first card. Expect the toast with Show and focus on the next card. Then check that the status row scrolls sideways on a narrow window.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
