---
phase: 02-shelf-scan
plan: 12
subsystem: review-ui
tags: [filters, nuqs, toggle-group, needs-review, rescan-hint, tdd]

requires:
  - phase: 02-shelf-scan
    provides: "02-11 orphaned spines in getSpines; 02-10 editBaseAiValue merge; 02-09 SpineField PATCH; 02-08 /spines list and ?photo"
provides:
  - "needsReview (orphaned, or active with a low-confidence unedited field) and rescanHint in src/lib/spine-review.ts"
  - "getSpines({ photoId, review }) with photoOptions and filter-independent counts; parseReviewParam (exact '1')"
  - "SpinesFilterBar: All / Needs review ToggleGroup and photo Select bound to nuqs"
  - "'Nothing needs review' empty state; 'Latest scan reads' hint with 'Use new read' in SpineField"
  - "shadcn toggle-group and toggle"
affects: [phase 3 Discogs matching (filter bar gains match status filters in phase 4, REV-03)]

actuals:
  tokens: 9000
  tasks: 3
  commits: 4
plan_head_before: 341ccc61ca302d6df061f9285ce7ac7b6297687c
plan_head_after: 6f06e00f561503278519f5db34845483141ca812

tech-stack:
  added: []
  patterns:
    - "SpinesResponse.photoOptions lists every photo (id, filename, status) for the Select and for polling, independent of filters"
    - "Filter hooks useReviewFilter / usePhotoFilter wrap nuqs so the bar and the view share one URL contract"
    - "keepPreviousData keeps the list and filter bar on screen while a new filter loads"

key-files:
  created:
    - src/components/spines-filter-bar.tsx
    - src/components/ui/toggle-group.tsx
    - src/components/ui/toggle.tsx
    - .planning/phases/02-shelf-scan/tdd-evidence/02-12-task3-red.json
  modified:
    - src/lib/spine-review.ts
    - src/lib/spine-review.test.ts
    - src/lib/scan-types.ts
    - src/server/scan/queries.ts
    - src/server/scan/orphans.test.ts
    - src/app/api/spines/route.ts
    - src/app/spines/page.tsx
    - src/components/spines-view.tsx
    - src/components/spine-field.tsx
    - scripts/verify-rescan.ts

key-decisions:
  - "counts cover the photo filter but ignore the review filter, so both toggle counts stay visible in either mode"
  - "SpinesResponse gains photoOptions (every photo, newest first); 'Photo not found' is now decided by photoOptions, so an empty Needs review result for a real photo is not mistaken for an unknown id"
  - "Polling keys off photoOptions, so a scan finishing on a photo the filters hide still refreshes the counts"
  - "rescanHint compares normalized values; no hint when the latest read is empty (A-18)"

patterns-established:
  - "URL filters: exact-value parse on the server (parseReviewParam) and the same rule in the client hook"

requirements-completed: [REV-01, INGEST-04]

coverage:
  - id: D1
    description: "Needs review filter: orphaned plus low-confidence unedited spines, photos without matches omitted, counts match the list, only ?review=1 filters"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "src/lib/spine-review.test.ts#needsReview (02-12, D-07)"
        status: pass
      - kind: unit
        ref: "src/server/scan/orphans.test.ts#getSpines review lists only the spines that need review, with both counts"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(g2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Filter bar (toggle never empty, photo Select with All photos first, scroll to top, survives reload) and the 'Nothing needs review' empty state"
    requirement: REV-01
    verification:
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(g2) server HTML has the toggle and Select"
        status: pass
    human_judgment: true
    rationale: "Toggle interaction, Select behavior, scroll reset, reload persistence and fit at 360px/1280px are interactive and visual (UI E4 backstop); no component test harness exists"
  - id: D3
    description: "Edited field after re-scan shows 'Latest scan reads “{new}”' and 'Use new read' sets the value to that read"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/lib/spine-review.test.ts#rescanHint (02-12, D-15)"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(g)"
        status: pass
    human_judgment: true
    rationale: "Clicking 'Use new read' and seeing the hint and Edited badge disappear is an interactive check deferred to end-of-phase verification"

duration: 5min
completed: 2026-10-20
status: complete
---

# Phase 2 Plan 12: Needs Review Filter and Latest-Scan Hint Summary

**`/spines` now has a filter bar: an All / Needs review toggle with mono counts and a photo Select, both kept in the URL (`?review=1`, `?photo=`). Needs review lists orphaned spines and spines with a low-confidence unedited field. After a re-scan, an edited field whose new read differs shows "Latest scan reads “…”" with a one-click "Use new read".**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-20T05:16:41Z
- **Completed:** 2026-10-20T05:21:42Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- `needsReview` returns true for every orphaned spine and for an active spine with a non-empty, unedited field below the threshold. It returns false for superseded and dismissed spines.
- `getSpines({ photoId, review })`:
  - With review on, it lists only flagged spines and drops photos that have none.
  - `counts` (all = active plus orphaned, needsReview) cover the photo filter and ignore the review filter.
  - The new `photoOptions` lists every photo for the Select.
  - The route and page accept only `?review=1` (T-02-28).
- `SpinesFilterBar`:
  - The ToggleGroup is `outline` and can never be emptied. Its pressed state uses the muted `bg-accent`, not the accent colour.
  - The Select is `w-64`, with "All photos" first and then truncated filenames newest first. Changing it scrolls to the top (nuqs `scroll: true`).
- `SpinesView` keys its query on `{ photo, review }` and keeps the previous data while a new filter loads. With nothing to review it shows "Nothing needs review" and an outline "Show all spines" button.
- `rescanHint` plus a SpineField Caption line: a Sparkles icon in `text-warning`, "Latest scan reads “{new}”", and an underlined "Use new read" button that PATCHes the read through the existing mutation.

## Task Commits

1. **Task 1: Tracer, Needs review filter**: `051f975` (feat)
2. **Task 2: Photo filter and empty state, needsReview tests**: `0733647` (test)
3. **Task 3: Latest-scan hint**: `8408309` (test, RED), `6f06e00` (feat, GREEN)

## Files Created/Modified

- `src/lib/spine-review.ts`: `needsReview` (now uses state), `rescanHint`.
- `src/server/scan/queries.ts`: `getSpines` with review, `parseReviewParam`.
- `src/lib/scan-types.ts`: `PhotoOption`, `SpinesResponse.photoOptions`.
- `src/app/api/spines/route.ts`, `src/app/spines/page.tsx`: the `?review` param.
- `src/components/spines-filter-bar.tsx`: `SpinesFilterBar`, `useReviewFilter`, `usePhotoFilter`.
- `src/components/spines-view.tsx`: wires in the filter bar and "Nothing needs review"; "Photo not found" now checks `photoOptions`.
- `src/components/spine-field.tsx`: the re-scan hint line.
- `src/components/ui/toggle-group.tsx`, `toggle.tsx`: shadcn components (font-semibold changed to font-medium, Biome-fixed).
- `scripts/verify-rescan.ts`: (g) checks the hint on X's title; new step (g2) checks `?review=1`.

## Decisions Made

See key-decisions in the frontmatter. The one that changes the response shape is `photoOptions`. Without it the Select would lose the other photos whenever `?photo` or `?review` narrowed `photos`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `photoOptions` added to SpinesResponse**
- **Found during:** Task 1
- **Issue:** `photos` is narrowed by both filters, so the Select could not list every photo. Two other problems followed: an empty Needs review result would have shown "Photo not found", and polling stopped when the only analyzing photo was filtered out.
- **Fix:** `getSpines` returns `photoOptions` (id, filename, status). The view uses it for the Select, the not-found check, the photo count and polling.
- **Files modified:** src/lib/scan-types.ts, src/server/scan/queries.ts, src/components/spines-view.tsx
- **Commit:** 051f975

**2. [Rule 2 - Missing critical] Automated coverage for the review filter and the hint**
- **Found during:** Tasks 1 and 3
- **Issue:** The plan's automated checks only re-ran the existing verify scripts, so nothing asserted `?review=1` or the hint.
- **Fix:** Added a `getSpines` review test to orphans.test.ts, step (g2) to verify-rescan (orphan included, counts match, `?review=true` does not filter), and a hint assertion to step (g) for X's re-read title.
- **Files modified:** src/server/scan/orphans.test.ts, scripts/verify-rescan.ts
- **Commits:** 051f975, 6f06e00

**3. [Scope] Task 2's Select and empty state shipped in Task 1**
- The tracer built the full filter bar and the empty state, so Task 2 only added the needsReview tests.

---

**Total deviations:** 2 auto-fixed (both missing critical) plus 1 scope note.
**Impact on plan:** The only API change is one added response field. No new packages: `shadcn add` wrote only the two registry files and `package.json` is unchanged.

## TDD Gate Compliance

- **Task 2:** No RED was possible because the Task 1 tracer already implements `needsReview`; the 6 tests lock the rule. A mutation check showed they catch a regression: dropping the orphan branch fails "is true for an orphaned spine even when every field is fine".
- **Task 3 RED** (`8408309`): the target "returns the new read when an edited field was re-read differently" failed on its assertion against a stub returning null. The classifier returned `RED_EVIDENCE_OK`; the evidence is in `tdd-evidence/02-12-task3-red.json`. Semantic assessment: valid.
- **Task 3 GREEN** (`6f06e00`): 36 spine-review tests pass. No REFACTOR was needed.

## Issues Encountered

None.

## User Setup Required

None.

## Verification

- `corepack pnpm test` (470 tests), `lint`, `typecheck` and `build` all pass.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts` prints `verify-rescan OK`, including the hint and (g2): Needs review lists 1 of 6 spines.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts` prints `verify-scan OK`.
- Human checks are deferred to end of phase (backstop): toggle and Select behavior, reload persistence, scroll reset, fit at 360px and 1280px, and "Use new read" clearing the hint and the Edited badge.

## Next Phase Readiness

All 12 plans have summaries. Phase complete, ready for phase verification.

## Self-Check: PASSED
