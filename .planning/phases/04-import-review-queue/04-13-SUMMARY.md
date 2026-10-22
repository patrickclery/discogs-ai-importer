---
phase: 04-import-review-queue
plan: 13
subsystem: ui
tags: [react, shadcn, alert-dialog, duplicates, discogs, imports]

requires:
  - phase: 04-import-review-queue
    provides: "04-03 AddToCollectionButton, ConfirmedMatch, import-view helpers; 04-04 409 duplicate confirm, allowDuplicate, POST import/link-existing and import/another; 04-10 DuplicateBody and ImportDto.existing"
provides:
  - "duplicateDialogTitle(body) and alreadyLine(existing) in src/lib/import-view.ts, plus ALREADY_DECISION_LINE"
  - "DuplicateImportDialog (both crops, Cancel / Add another copy) and parseDuplicateBody"
  - "Add button opens the dialog on a 409 duplicate and resends { candidateId, allowDuplicate: true }"
  - "AlreadyInCollection: Link existing copy (accent), Add another copy (outline), then Change match, inside ConfirmedMatch for already_in_collection"
  - "CandidateList and AddToCollectionButton take the spine's cropUrl"
affects: [04-14, phase-4-uat]

actuals:
  tokens: 7500
  tasks: 2
  commits: 4
plan_head_before: 349427ab14b5bf04cf8473bc126ebe6c3ea76d4f
plan_head_after: a970f313ffb6d52599785a5edb8d86fc50c768f8

tech-stack:
  added: []
  patterns:
    - "A trigger-less AlertDialog owned by the button that got the 409: onCloseAutoFocus is prevented and focus goes back to that button on Cancel, or to Change match after a confirmed add"
    - "Discogs dates are shown as the calendar date Discogs wrote (YYYY-MM-DD prefix, Intl en-GB in UTC), never shifted by the viewer's time zone"

key-files:
  created:
    - src/components/duplicate-import-dialog.tsx
    - src/components/already-in-collection.tsx
    - .planning/phases/04-import-review-queue/tdd-evidence/04-13-task1-red.json
    - .planning/phases/04-import-review-queue/tdd-evidence/04-13-task2-red.json
  modified:
    - src/lib/import-view.ts
    - src/lib/import-view.test.ts
    - src/components/add-to-collection-button.tsx
    - src/components/confirmed-match.tsx
    - src/components/candidate-list.tsx
    - src/components/discogs-matches.tsx

key-decisions:
  - "The Add button owns the duplicate request (one fetch path for both sends); DuplicateImportDialog is presentational, with pending and error props"
  - "A failed allowDuplicate resend uses addErrorText, so already_confirmed and not_on_discogs keep their mapped copy inside the dialog; anything else reads 'Couldn't add it: {reason}.'"
  - "Crop URLs render only when they start with /api/files/ (T-04-33); otherwise the ImageOff placeholder shows"
  - "alreadyLine formats the date Discogs recorded (the YYYY-MM-DD in date_added) and drops ', added {date}' for anything that is not a real calendar date"
  - "While Link or Add another copy is in flight, Change match is disabled too, and the reverse"
  - "After Add another copy succeeds, focus moves to Change match (the panel is waiting again, as after Retry). Link moves no focus because the panel then has no buttons"

patterns-established:
  - "Panel sub-components that share ConfirmedMatch's action row take a trailing ReactNode (the Change match button) and report their pending state up"

requirements-completed: [IMP-03]

coverage:
  - id: D1
    description: "The duplicate dialog title names the other spine's photo and #m: 'Already imported from …' when done, 'Already being imported from …' while in progress"
    requirement: IMP-03
    verification:
      - kind: unit
        ref: "src/lib/import-view.test.ts#duplicateDialogTitle (D-04, IMP-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Clicking Add on a release another spine holds opens the AlertDialog with both crops and captions before anything is written; Cancel writes nothing and returns focus to Add; Add another copy shows Adding… with both buttons disabled, resends with allowDuplicate, and on failure stays open with a role=alert line"
    requirement: IMP-03
    verification:
      - kind: other
        ref: "NEXT_DIST_DIR=.next/verify corepack pnpm typecheck && corepack pnpm lint"
        status: pass
    human_judgment: true
    rationale: "The dialog, the two crops, focus return and the 120-character filename wrapping are visual and interactive; no component test renders them. The phase-end human check covers them"
  - id: D3
    description: "alreadyLine: '1 copy in {folder}, added 30 Nov 2015.' / '{k} copies, the first in {folder}, added …'; the Discogs date wins over the local time zone; an unparseable date drops the added part"
    requirement: IMP-03
    verification:
      - kind: unit
        ref: "src/lib/import-view.test.ts#alreadyLine (D-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Already in your collection panel shows the warning icon, both lines, Link existing copy (accent), Add another copy and Change match. Pending labels Linking…/Adding… disable the other buttons; errors read 'Couldn't link it: …' or 'Couldn't add it: …' inline; link shows the toast"
    requirement: IMP-03
    verification:
      - kind: other
        ref: "NEXT_DIST_DIR=.next/verify corepack pnpm typecheck && corepack pnpm lint"
        status: pass
    human_judgment: true
    rationale: "Needs the owner's real Discogs collection to reach already_in_collection, plus a visual check of the accent button and wrapping at 360 px"
  - id: D5
    description: "No regressions: typecheck, Biome and the full unit suite"
    verification:
      - kind: other
        ref: "NEXT_DIST_DIR=.next/verify corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test (1481 tests; the timing tests in cli.test.ts and match.test.ts pass when re-run alone)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 13: Duplicate dialog and Already in your collection Summary

**Before a second copy is made, the owner now sees a warning. Clicking Add on a release that another spine already holds opens a dialog showing both spines' crops. Nothing is added unless they pick "Add another copy". A held already-in-collection import names the existing copy's folder and Discogs date, and offers Link existing copy, Add another copy and Change match.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-22T10:43:55Z
- **Completed:** 2026-10-22T10:49:37Z
- **Tasks:** 2
- **Files modified:** 10 (8 source, 2 TDD evidence)

## Accomplishments
- `duplicateDialogTitle()` and `alreadyLine()` hold the UI-SPEC copy and are unit-tested. `alreadyLine` pluralizes copies and formats the date as "30 Nov 2015". It never prints Invalid Date.
- `DuplicateImportDialog`: the title wraps long filenames, and the body copy comes from the UI-SPEC. Two crop wells sit side by side (stacked below 640 px) with line-clamped captions that carry a full-text `title`. Cancel writes nothing. Add another copy shows a spinner and "Adding…" with both buttons disabled. A failure leaves the dialog open with an inline `role="alert"` line.
- `AddToCollectionButton` opens the dialog on a 409 `duplicate` and the button goes back to idle. The confirm resends `{ candidateId, allowDuplicate: true }`. On success it invalidates `['spines']`, dispatches `STATUS_REFRESH_EVENT`, announces the action and focuses Change match.
- `AlreadyInCollection` shows a TriangleAlert in text-warning, the copy line and the decision line, and posts to `/import/link-existing` or `/import/another`. Link shows the toast "Spine #n linked to the copy already in your collection". Errors stay inline under the action row.

## Task Commits

1. **Task 1 (tracer): the duplicate dialog on Add**
   - RED `160cc48` (test)
   - GREEN `98a31b7` (feat)
2. **Task 2: Already in your collection panel**
   - RED `80f1c31` (test)
   - GREEN `a970f31` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | Evidence |
|------|-----|-------|----------|
| 1 | `160cc48` | `98a31b7` | `tdd-evidence/04-13-task1-red.json`: RED_EVIDENCE_OK. The target "names the photo and spine an import already finished from" failed on its toBe (expected `Already imported from shelf-2.jpg, spine #3`, got `''`) against a stub that returns an empty string. The module loaded, so this was an assertion failure, not a load fault. |
| 2 | `80f1c31` | `a970f31` | `tdd-evidence/04-13-task2-red.json`: RED_EVIDENCE_OK. The target "one copy names its folder and the date it was added" failed on its toBe against an empty-string stub. |

No REFACTOR commits were needed. The tracer gate ran in auto mode: after Task 1 GREEN, typecheck, lint and the full unit suite passed again before Task 2 started.

## Files Created/Modified
- `src/components/duplicate-import-dialog.tsx`: `DuplicateImportDialog`, `parseDuplicateBody`, `DUPLICATE_DIALOG_BODY`
- `src/components/already-in-collection.tsx`: `AlreadyInCollection`, `linkToast`
- `src/components/add-to-collection-button.tsx`: the 409 duplicate path, the allowDuplicate resend and the dialog focus handling
- `src/components/confirmed-match.tsx`: renders `AlreadyInCollection` for already_in_collection, with Change match as its trailing button
- `src/components/candidate-list.tsx`, `src/components/discogs-matches.tsx`: pass the spine's `cropUrl` down
- `src/lib/import-view.ts`, `src/lib/import-view.test.ts`: `duplicateDialogTitle`, `alreadyLine`, `ALREADY_DECISION_LINE` and tests

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] This spine's crop passed down to the Add button**
- **Found during:** Task 1
- **Issue:** The dialog has to show this spine's crop next to the other spine's, but `AddToCollectionButton` only received `spineId` and `spineNumber`.
- **Fix:** Added a `cropUrl` prop to `CandidateList` and `AddToCollectionButton`. `DiscogsMatches` passes `spine.crop?.url ?? null`.
- **Files modified:** `src/components/candidate-list.tsx`, `src/components/discogs-matches.tsx` (neither is in the plan's file list)
- **Committed in:** `98a31b7`

**2. [Rule 2 - Security] Crop URLs restricted to /api/files/**
- **Found during:** Task 1 (T-04-33 mitigation)
- **Fix:** `safeCropUrl` renders a crop only when its URL starts with `/api/files/`. Anything else shows the placeholder.
- **Committed in:** `98a31b7`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 security)
**Impact on plan:** No scope creep. Two extra files each gained one prop.

## Issues Encountered
- In the full-suite runs, the timing tests `cli.test.ts` (SIGKILL / process-group timeout) and `match.test.ts` (spike pairing) failed. A Plex transcoder was using about 1000% CPU at the time (load average 24). Both files pass when re-run alone (51/51). They are unrelated to this plan's files.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- IMP-03's UI half is in place. The phase-end human check covers the overlapping-photo dialog and the already-in-collection panel against the owner's real collection.
- 04-14 can rely on `AlreadyInCollection` and the dialog. Neither changes any API shape.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
