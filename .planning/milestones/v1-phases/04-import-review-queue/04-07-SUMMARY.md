---
phase: 04-import-review-queue
plan: 07
subsystem: scan, discogs
tags: [sqlite, better-sqlite3, re-scan-merge, orphans, auto-search, tdd]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 imports table and spines.not_on_discogs; 04-10 SpineDto.import (phase) and notOnDiscogs"
provides:
  - "keepSpine retire rule: edited, non-failed-import or marked spines are orphaned, never superseded"
  - "Re-attach CANDIDATE excludes targets with a non-failed import or the mark"
  - "dismissSpine 'has_import' result, mapped to 409 by POST /api/spines/{id}/dismiss"
  - "DismissSpineButton disabled with the UI-SPEC tooltip while a non-failed import exists"
  - "AUTO_SEARCH_ELIGIBLE_SQL guard on every automatic Discogs search path"
affects: [04-08, 04-12, 04-14, re-scan, review-ui]

actuals:
  tokens: 9000
  tasks: 2
  commits: 4
plan_head_before: e05e2171b2b6532821b5c3e09ce55e0405aae439
plan_head_after: 4fcb86b6221314caeba42f05c0235135a410e5cf

tech-stack:
  added: []
  patterns:
    - "Shared SQL guard fragment over alias `s` (AUTO_SEARCH_ELIGIBLE_SQL), reused in selectors and in the per-spine transaction"
    - "Single conditional UPDATE, then classify the zero-change case (not_found / has_import / conflict)"

key-files:
  created:
    - .planning/phases/04-import-review-queue/tdd-evidence/04-07-task1-red.json
    - .planning/phases/04-import-review-queue/tdd-evidence/04-07-task2-red.json
  modified:
    - src/server/scan/merge.ts
    - src/server/scan/merge.test.ts
    - src/server/scan/orphans.ts
    - src/server/scan/orphans.test.ts
    - src/app/api/spines/[id]/dismiss/route.ts
    - src/components/dismiss-spine-button.tsx
    - src/server/discogs/enqueue.ts
    - src/server/discogs/enqueue.test.ts

key-decisions:
  - "A spine is kept as orphaned on re-scan when it has an edit, a non-failed import or the not-on-Discogs mark; a failed-only import does not keep it (A-04-16)"
  - "Automatic searches (photo scan, connect backfill incl. auth_failed replay, maintenance) skip spines with a non-failed import or the mark; explicit searches are untouched (A-04-15)"
  - "Dismiss of an orphan with a non-failed import is refused as has_import (409); a marked orphan with no import can still be dismissed"

patterns-established:
  - "Pitfall 5 guard: any rule that retires or replaces a spine checks EXISTS imports with status <> 'failed' and not_on_discogs"

requirements-completed: [IMP-04, REV-05]

coverage:
  - id: D1
    description: "A re-scan keeps a spine with a non-failed import or the not-on-Discogs mark as orphaned (No longer detected), never superseded; failed-only imports are superseded as before"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/scan/merge.test.ts#an unmatched old spine with an import in status %s is orphaned, never superseded"
        status: pass
      - kind: unit
        ref: "src/server/scan/merge.test.ts#an unmatched old spine marked not on Discogs is orphaned"
        status: pass
      - kind: unit
        ref: "src/server/scan/merge.test.ts#an unmatched old spine whose only import failed is superseded (A-04-16)"
        status: pass
      - kind: integration
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-rescan.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-attach never lists or accepts a target with a non-failed import or the mark"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/scan/orphans.test.ts#a target with an import in status %s is not a candidate and re-attach onto it is a conflict"
        status: pass
      - kind: unit
        ref: "src/server/scan/orphans.test.ts#a target marked not on Discogs is not a candidate and re-attach onto it is a conflict"
        status: pass
    human_judgment: false
  - id: D3
    description: "Dismiss refuses an orphan with a non-failed import (has_import, 409); failed-only and marked orphans can be dismissed"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/scan/orphans.test.ts#dismiss of an orphan with an import in status %s is has_import and keeps it orphaned"
        status: pass
      - kind: unit
        ref: "src/server/scan/orphans.test.ts#dismiss of an orphan whose only import failed dismisses it"
        status: pass
    human_judgment: false
  - id: D4
    description: "UI-SPEC E14 partial: an orphaned spine with an import lists under No longer detected with its confirmed-match panel, and its Dismiss spine button is disabled with the tooltip"
    verification: []
    human_judgment: true
    rationale: "Visual and interaction check of the disabled button and tooltip on the /spines page; no component test renders it"
  - id: D5
    description: "Automatic Discogs searches skip spines with a non-failed import or the mark; failed-only imports are searched; Search again is unchanged"
    requirement: REV-05
    verification:
      - kind: unit
        ref: "src/server/discogs/enqueue.test.ts#imported, importing and marked spines (A-04-15)"
        status: pass
      - kind: integration
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-backfill.ts"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 07: Keep imported and marked spines through re-scans Summary

**Re-scan merge, re-attach, dismiss and every automatic Discogs search now treat a spine with a non-failed import or the not-on-Discogs mark as locked: it stays listed as orphaned, cannot be a re-attach target or be dismissed, and is never auto-searched again.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-22T10:13:08Z
- **Completed:** 2026-10-22T10:18:13Z
- **Tasks:** 2
- **Files modified:** 8 (plus 2 RED evidence records)

## Accomplishments
- `mergeRunIntoSpines` uses a `keepSpine` check (edit OR non-failed import OR mark), so a re-scan can no longer retire an imported spine and surface an un-imported replacement (RESEARCH Pitfall 5, T-04-27).
- Re-attach `CANDIDATE` excludes targets with a non-failed import or the mark; `reattachSpine` onto one answers conflict.
- `dismissSpine` returns `has_import` for such an orphan; the route answers 409 `{ error: 'has_import' }` with the UI-SPEC sentence, and `DismissSpineButton` renders disabled inside a focusable span with that tooltip (T-04-28).
- `AUTO_SEARCH_ELIGIBLE_SQL` guards `enqueueAutoSearchesForPhoto`, `enqueueMissingSearches` (including the auth_failed replay) and `enqueueAutoSearch` itself (T-04-29).

## Task Commits

1. **Task 1 (tracer): re-scan, re-attach and dismiss keep imported spines**
   - RED `bdedde3` (test), GREEN `b2b5127` (feat)
2. **Task 2: automatic searches leave imported, importing and marked spines alone**
   - RED `871b299` (test), GREEN `4fcb86b` (feat)

No REFACTOR commits (nothing to clean up).

## TDD Gate Compliance

- **Task 1 RED:** 14 new cases failed on their assertions. Recorded target `merge.test.ts > ... > an unmatched old spine with an import in status imported is orphaned, never superseded` (tap-flat): expected `orphaned`, actual `superseded`. Classifier: `RED_EVIDENCE_OK`. Semantic assessment: the target ran and failed on the planned assertion; no load or fixture fault.
- **Task 1 GREEN:** 40/40 in merge and orphans tests.
- **Task 2 RED:** 8 new cases failed on their assertions; the failed-only import and Search again cases passed already, as intended (unchanged behavior). Recorded target `enqueueAutoSearch for a spine with an import in status imported returns false and creates no row`: expected `false`, actual `true`. Classifier: `RED_EVIDENCE_OK`.
- **Task 2 GREEN:** 33/33 enqueue tests.
- Tracer feedback gate: auto mode, verify re-run (typecheck, lint, 1218 tests, verify-rescan OK), then expanded to Task 2.

## Files Created/Modified
- `src/server/scan/merge.ts`: `keepSpine` retire rule.
- `src/server/scan/orphans.ts`: CANDIDATE exclusion, `OPEN_IMPORT` fragment, `DismissResult` `'has_import'`.
- `src/app/api/spines/[id]/dismiss/route.ts`: maps `has_import` to 409.
- `src/components/dismiss-spine-button.tsx`: disabled trigger with tooltip; exports `DISMISS_BLOCKED_REASON`.
- `src/server/discogs/enqueue.ts`: exported `AUTO_SEARCH_ELIGIBLE_SQL` and its three uses.
- The `*.test.ts` files: the behavior cases, with imports seeded by direct SQL.

## Decisions Made
- `dismissSpine` keeps the single conditional UPDATE and classifies a zero-change result afterwards: not_found if missing, conflict if not orphaned, has_import if an open import exists.
- An active spine with an import still gets `conflict` from dismiss (it isn't orphaned), so the existing error copy stays correct for that case.

## Deviations from Plan

None. The plan was executed as written. Verify commands ran with `NEXT_DIST_DIR=.next/verify` (also for `verify-discogs-backfill`) so the production `.next` serving port 3001 was never rebuilt, as the orchestrator required.

## Issues Encountered
None.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plans 04-08 and 04-14 can rely on `has_import` and the disabled Dismiss state for the E14 orphan card. `AUTO_SEARCH_ELIGIBLE_SQL` is exported for reuse.
- UI check pending at end of phase: an orphaned imported spine shows a disabled Dismiss spine button with its tooltip.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
