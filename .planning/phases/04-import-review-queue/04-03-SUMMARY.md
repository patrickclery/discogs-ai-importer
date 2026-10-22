---
phase: 04-import-review-queue
plan: 03
subsystem: ui
tags: [discogs, imports, react, tanstack-query, confirmed-match, tdd]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 POST /api/spines/{id}/import; 04-10 ImportDto, canChangeMatch/canRetry, useImportUi, announceSpineAction; 04-12 DELETE /api/spines/{id}/import and POST /api/spines/{id}/retry"
provides:
  - "src/lib/import-view.ts: addFolderName, addButtonLabel, addDisabledReason, addErrorText, importStateLine, importFailureLine, changeMatchState, BEING_ADDED_TOOLTIP, RETRY_FIRST_TOOLTIP, CHANGE_STARTED_ERROR"
  - "AddToCollectionButton (Add to {folder}) on every card candidate row, inline and under Show all"
  - "ConfirmedMatch panel: snapshot box, waiting/paused/importing/imported/linked/failed lines, Retry import, Change match"
  - "CandidateRowContent actions slot; CandidateList card-level pending id and inline Add error"
  - "DiscogsMatches: 'Confirmed match' label, no search actions, panel body while an import exists"
  - "focusInCard(spineId, attr), ADD_BUTTON_ATTR, CHANGE_MATCH_ATTR for post-action focus"
affects: [04-04, 04-05, 04-08, 04-13, 04-14]

actuals:
  tokens: 11070
  tasks: 2
  commits: 3
plan_head_before: 9d0a729c82723c8ecb9f8d35efa7c4763cad590e
plan_head_after: 38492ef13535aa1119c2f561b456de3685b8778d

tech-stack:
  added: []
  patterns:
    - "Card copy lives in pure src/lib/import-view.ts helpers pinned by unit tests; components only render them"
    - "Disabled-with-reason buttons: Tooltip on a focusable wrapping span, inner button tabIndex -1"
    - "Post-action focus: focusInCard(spineId, data-attr) in a requestAnimationFrame after the refetch"

key-files:
  created:
    - src/lib/import-view.ts
    - src/lib/import-view.test.ts
    - src/components/add-to-collection-button.tsx
    - src/components/confirmed-match.tsx
    - .planning/phases/04-import-review-queue/tdd-evidence/04-03-task2-red.json
  modified:
    - src/components/candidate-row.tsx
    - src/components/candidate-list.tsx
    - src/components/discogs-matches.tsx

key-decisions:
  - "The panel's state lines name the import's own folder (dto.folderName, D-03), not the current Settings folder; the Add label uses the Settings folder"
  - "Change match disabled tooltip: 'Retry first…' only for a failed import; every other non-changeable state uses 'It's being added now…'"
  - "After a 409 started, Change match stays disabled while that import id is still waiting or importing; the inline error hides once the spine is imported"
  - "After Retry import succeeds, focus moves to Change match (the Retry button is gone); the spec only fixed focus for Add and Change match"
  - "An import card's notice line keeps not connected and the search's paused countdown only; the import's own paused countdown is in the panel's state line, so it never shows twice"
  - "importFailureLine: removed reads 'the spine was removed before the import ran' and a missing reason reads 'something went wrong' in the other line"

patterns-established:
  - "Import UI copy constants and helpers come from src/lib/import-view.ts; 04-04/04-08/04-13 extend it rather than inlining strings"

requirements-completed: [IMP-01, REV-04]

coverage:
  - id: D1
    description: "Add to {folder} label, the not-connected and reconnect disabled reasons, and the inline Add error copy (already confirmed, not on Discogs, other)"
    requirement: IMP-01
    verification:
      - kind: unit
        ref: "src/lib/import-view.test.ts#addButtonLabel, addDisabledReason, addErrorText"
        status: pass
    human_judgment: false
  - id: D2
    description: "Waiting, importing, imported (with relative time) and linked state lines name the import's folder"
    verification:
      - kind: unit
        ref: "src/lib/import-view.test.ts#importStateLine"
        status: pass
    human_judgment: false
  - id: D3
    description: "Import failure copy for every D-09 kind and the Change match enabled/tooltip rule"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "src/lib/import-view.test.ts#importFailureLine (D-09), changeMatchState (D-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Clicking Add shows Adding… and greys the card's other Adds; the section turns into 'Confirmed match' with only the chosen release and moves Waiting → Importing → Imported; Change match brings the list back; a failed import shows the reason and Retry import puts it back to waiting; focus moves after each action"
    requirement: IMP-01
    verification:
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts (confirm route behavior unchanged)"
        status: pass
    human_judgment: true
    rationale: "The click flow, polling transitions and focus movement happen in the browser; the project has no browser test runner (plan human-check)"
  - id: D5
    description: "At 360 px the action row wraps, the confirmed box keeps the 64 px thumb, and a 60-character folder name in Add to … truncates with the full name in its title"
    verification: []
    human_judgment: true
    rationale: "Visual layout backstop truths; checked by eye at 360 px and 1280 px"

duration: 5min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 03: Add to collection and the confirmed-match panel Summary

**Each card candidate now has an outline "Add to {folder}" button that posts only `{ candidateId }`. Once a match is confirmed, the card's Discogs section becomes "Confirmed match" and shows the chosen release from the import snapshot with a live state line: waiting (or the paused countdown), importing, imported or linked. A failed import shows its D-09 reason (reconnect failures get an Open Settings link) with Retry import. Change match is offered only when the API's `canChangeMatch` allows it, and every error appears inline instead of as a toast.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-22T09:56:12Z
- **Completed:** 2026-10-22T10:01:40Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `src/lib/import-view.ts` holds all of the card's import copy and rules as pure helpers, pinned by 34 unit tests.
- `AddToCollectionButton`:
  - It is on every inline row and every Show all row. The Search Discogs dialog rows get no button (IMP-01 prohibition).
  - While one Add is pending, every Add on the card is disabled (Pitfall 8).
  - When Discogs is not connected, the button is disabled and a tooltip says why.
  - Errors appear as one inline `role="alert"` line under the list.
- `ConfirmedMatch`:
  - The box shows the stored snapshot. When there is no snapshot it falls back to "Release {id}" with the Disc3 placeholder.
  - It has a state line for each phase, Retry import, and Change match with its tooltips.
  - A 409 started shows the started copy, refreshes the panel and keeps Change match disabled.
  - After Add, focus moves to Change match. After Change match, it moves to the first Add.
- `DiscogsMatches`: when the spine has an import, the label reads "Confirmed match", the header has no Search again or Search Discogs…, and the notice line is trimmed. An imported card shows no notice line.

## Task Commits

1. **Task 1: Tracer, Add to {folder} and the confirmed-match panel**: `219d379` (feat)
2. **Task 2: Failed state, Retry import, Change match**
   - RED `9777ee5` (test)
   - GREEN `38492ef` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | Evidence |
|------|-----|-------|----------|
| 2 | `9777ee5` | `38492ef` | `tdd-evidence/04-03-task2-red.json`: RED_EVIDENCE_OK. Target test "importFailureLine (D-09) > auth gives the reconnect line" ran and failed on its planned assertion: the stub returned `''` instead of `'Import failed: Discogs rejected the connection.'`. Because the stubs exported every new symbol, the file loaded, and all 17 new tests failed on assertions while the 17 Task 1 tests passed. |

Task 1 was a `type="tracer"` task without `tdd="true"`. Its tests were written alongside the code. Auto mode ran the tracer gate: typecheck, lint and all 1139 tests passed again before Task 2 began.

## Files Created/Modified
- `src/lib/import-view.ts`: Add label, disabled reason, Add error, state lines, failure lines, Change match state
- `src/lib/import-view.test.ts`: 34 unit tests
- `src/components/add-to-collection-button.tsx`: `AddToCollectionButton`, `focusInCard`, focus data attributes
- `src/components/confirmed-match.tsx`: `ConfirmedMatch`, `confirmedCandidate`
- `src/components/candidate-row.tsx`: an `actions` slot on `CandidateRowContent` and `CandidateRow`
- `src/components/candidate-list.tsx`: card-level pending id, an Add on inline and Show all rows, the inline error
- `src/components/discogs-matches.tsx`: confirmed label and body, and the notice line while an import exists

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

**1. [Scope split] The failure copy moved from Task 1 to Task 2**
- Task 1's action listed `importFailureLine`, but Task 2 says to extend `import-view.ts` with "the failure copy (D-09 classes), tests first". Writing it in Task 2 gave a real RED for it. The final exports match the plan's artifact list.

**2. [Rule 2 - Missing critical] `addErrorText` helper**
- The Add error mapping (already_confirmed, not_on_discogs, other) went into a pure helper so the UI-SPEC copy is unit-tested. It is not a component-only branch.

**Total deviations:** 2 (both organisational, no behavior change). **Impact:** none.

## Known Stubs
- `ConfirmedMatch` renders no state line and no decision buttons for `already_in_collection`. It shows only the box and Change match. Plan 04-13 owns that decision, as the plan states.
- "/spines polls every 3 s while it waits" (UI-SPEC E7): `discogsActive` does not yet count queued or running import jobs. Plan 04-05 owns that rule, so until it lands a waiting card refreshes only on the existing polling triggers.

## Issues Encountered
None.

## Verification
- `corepack pnpm vitest run src/lib/import-view.test.ts`: 34 passed
- `NEXT_DIST_DIR=.next/verify corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: pass (73 files, 1157 tests)
- `NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts`: steps (a) to (f) ok, "verify-discogs-import OK"
- Acceptance greps: AddToCollectionButton in candidate-list (2), ConfirmedMatch in discogs-matches (2), "Confirmed match" (1), actions in candidate-row (8), "Retry import" in confirmed-match (2), "Change match" (5), the Retry first tooltip in import-view (1)

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-04 can open `DuplicateImportDialog` from `AddToCollectionButton` on 409 `duplicate`. The button already reads the error code before falling back to `failureReason`.
- Plan 04-13 can add the already-in-collection line and decision buttons to `ConfirmedMatch`'s state line and action row.
- The end-of-phase human check (plan Task 2 `<human-check>`) covers the click flow, the transitions, focus, and the 360 px wrapping and truncation.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
