---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 09
subsystem: ui
tags: [nextjs, react-query, shadcn, radix, selection, bulk-import, sonner]

requires:
  - phase: 06-04
    provides: "SpineDto.bulk (eligible, reason, item), SpinesResponse.bulk (BulkRunDto), discogs.preferredCountry"
  - phase: 06-06
    provides: "POST /api/spines/bulk-import (201 BulkStartResponse, 409 bulk_running / nothing_to_import / not_connected)"
  - phase: 06-11
    provides: "demo twin of POST /api/spines/bulk-import (src/demo/routes/bulk.ts) and the simulated run"
  - phase: 06-12
    provides: "useFallbackFilter (?fallback=1) for the Show fallbacks toast action"
provides:
  - "src/components/ui/checkbox.tsx: shadcn Checkbox with checked='indeterminate' (Minus icon)"
  - "src/lib/bulk-selection.ts: eligibleShownIds, pruneSelection, selectAllState"
  - "src/lib/bulk-copy.ts: dialogTitle, dialogBody, startErrorText, progressLine, selectedCountText, importButtonLabel, selectAllLabel, ELIGIBILITY_REASON_TEXT, eligibilityReasonText, importDisabledReason, lastResultLine, startSkipsToast, batchDoneToast, hasRunFinished"
  - "src/components/spine-selection.tsx: SelectionProvider, useSpineSelection, SpineSelectCheckbox"
  - "src/components/bulk-import-dialog.tsx: BulkImportDialog, bulkStartBody, startBulkImport, topMatchId"
  - "src/components/bulk-import-bar.tsx: BulkImportBar"
affects: [06-10, phase-06-verification]

actuals:
  tokens: 13200
  tasks: 3
  commits: 7
plan_head_before: 0b0ac1210fd9b7761eb6c5edda2acc5c44fd6be8
plan_head_after: 818f5905e9dca6910ffe489a3f88916d9bdd4192

tech-stack:
  added: []
  patterns:
    - "Controlled selection: SpinesView owns the Set, prunes it with pruneSelection after every data update and passes the pruned view to SelectionProvider, so the count never lags the cards"
    - "The Start request is an exported pure body builder (bulkStartBody) plus a fetch wrapper (startBulkImport) so the exact POST body is unit-tested with fetch mocked"
    - "Run-finished detection is a pure predicate over two ref Sets (seen running, toasted), so a reload after a run never toasts"

key-files:
  created:
    - src/components/ui/checkbox.tsx
    - src/lib/bulk-selection.ts
    - src/lib/bulk-selection.test.ts
    - src/components/spine-selection.tsx
    - src/components/bulk-import-bar.tsx
    - src/components/bulk-import-dialog.tsx
    - src/components/bulk-import-dialog.test.ts
  modified:
    - src/lib/bulk-copy.ts
    - src/lib/bulk-copy.test.ts
    - src/components/compact-spine-card.tsx
    - src/components/photo-section.tsx
    - src/components/spines-view.tsx

key-decisions:
  - "SelectionProvider is controlled by SpinesView (selected + updater) so pruneSelection lives where the data is; useSpineSelection returns null outside it and the checkbox and bar render nothing there"
  - "importDisabledReason order: no selection, then reconnect (needsReconnect), then connect, then a running run"
  - "batchDoneToast puts the job-time changed skips after duplicates and before failed; counts in the toast are not pluralized, matching the UI-SPEC copy ('1 skipped as duplicates')"
  - "The start-with-skips toast uses toast.info; the finished toast lasts 10 s"

patterns-established:
  - "WithReason: a disabled control inside a focusable span carrying its Tooltip, reused for Select all shown and Import"

requirements-completed: [BULK-04, BULK-05, BULK-10, BULK-12]

coverage:
  - id: D1
    description: "Selection helpers: eligible shown ids in list order, pruning to allowed ids, and the tri-state Select all"
    requirement: BULK-04
    verification:
      - kind: unit
        ref: "src/lib/bulk-selection.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Confirm dialog: title with count, folder and pressing phrase; body with the low-confidence sentence; Keep reviewing and Start import; exact { items: [{ spineId, candidateId }] } POST body and refusal reason"
    requirement: BULK-05
    verification:
      - kind: unit
        ref: "src/components/bulk-import-dialog.test.ts"
        status: pass
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#dialogTitle"
        status: pass
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#dialogBody"
        status: pass
      - kind: unit
        ref: "src/demo/routes-coverage.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Copy for ineligible reasons (none for a failed import, D-20), disabled Import tooltips, last-result line and start-with-skips toast"
    requirement: BULK-04
    verification:
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#eligibilityReasonText"
        status: pass
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#importDisabledReason"
        status: pass
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#lastResultLine"
        status: pass
    human_judgment: false
  - id: D4
    description: "Batch-finished toast copy and action, once per run seen running"
    requirement: BULK-10
    verification:
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#batchDoneToast"
        status: pass
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#hasRunFinished"
        status: pass
    human_judgment: false
  - id: D5
    description: "Demo export renders the bulk bar (Select all shown) with zero /api or Discogs requests"
    requirement: BULK-12
    verification:
      - kind: command
        ref: "node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect 'spines/=Select all shown' --expect 'settings/=Preferred country'"
        status: pass
    human_judgment: false
  - id: D6
    description: "End-to-end click path in a browser: sticky bar placement, tooltips on disabled checkboxes, focus moves, wrapping at 360px, live progress, toast timing across polls and reloads, and the dialog title wrapping a 60-char folder and 40-char country"
    requirement: BULK-05
    verification: []
    human_judgment: true
    rationale: "The plan's human-checks need a browser; no dev server was started because the owner's server holds port 3001"

duration: 7min
completed: 2026-10-25
status: complete
---

# Phase 06 Plan 09: Bulk Selection, Bar and Confirm Dialog Summary

**Every /spines card now has a select checkbox. Ineligible cards show a disabled box whose tooltip gives the reason. A sticky bar offers tri-state "Select all shown ({e})", the selected count, Clear selection and the accent "Import {s} selected". The confirm dialog ("Import {n} to {folder} as Canadian pressings") POSTs only spine and candidate ids. The bar then shows "Bulk import: {d} / {n} done" during the run and "Last bulk import: …" after it. One toast per watched run summarizes the result, with Show failed or Show fallbacks.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-25T08:25:16Z
- **Completed:** 2026-10-25T08:32:48Z
- **Tasks:** 3
- **Files modified:** 12 (7 created, 5 modified)

## Accomplishments

- The shadcn `Checkbox` came from the registry. It uses the installed `radix-ui`, and `package.json` and `pnpm-lock.yaml` are unchanged against `0e0c54d`. I added `checked="indeterminate"` support with a Minus icon.
- `SpineSelectCheckbox` sits first in the compact card header and in the full card's `leading` slot.
  - Eligible spines get a plain checkbox labelled `Select spine #n`.
  - Ineligible spines get a disabled box inside a `tabIndex={0}` span. The span carries a Tooltip and an `sr-only` copy of the reason, linked through `aria-describedby`.
  - The hit area is 32px (`after:-inset-2`).
- After every data update, SpinesView prunes the selection with `pruneSelection(selected, eligibleShownIds(data.spines))`. Filter changes and polls drop anything not shown or no longer eligible.
- `BulkImportBar` has these parts:
  - The tri-state Select all is disabled with "Nothing shown can be imported" when nothing shown can be picked.
  - The selected count is mono and announced through `aria-live`.
  - Clear selection appears only when something is selected, then moves focus to Select all.
  - It shows the progress line while a run is running and the last-result line after it.
  - The Import button is disabled with a tooltip giving the reason: no selection, connect, reconnect, or a run still running.
- `BulkImportDialog` takes the AlertDialog pending and error pattern:
  - While starting it shows "Starting…" and disables both buttons; Escape and Keep reviewing are blocked.
  - On failure it shows an inline `role="alert"` line: "Couldn't start the import: {reason}. Try again."
  - On success it clears the selection, invalidates `['spines']`, dispatches `app:status-refresh` and focuses Select all. If the server skipped picks, it shows the start-with-skips toast.
- The finished-run toast (10 s) fires once, only for a run this browser saw running. Show failed sets `?status=failed`, and Show fallbacks turns `?fallback=1` on.

## Task Commits

1. **Task 1 (tracer): Select all, Import, confirm, Start**: `195e452` (test, RED), `001168e` (feat, GREEN), `e201f7b` (fix: route named once for the acceptance grep)
2. **Task 2: Per-card checkboxes, pruning, disabled states, last result**: `1c65407` (test, RED), `f9effb0` (feat, GREEN)
3. **Task 3: Finished-run toast and demo export check**: `5b9239b` (test, RED), `818f590` (feat, GREEN)

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | 195e452 | `tdd/06-09-task1-red.json`: RED_EVIDENCE_OK. Target "dialogTitle > names the count, the folder and Canadian pressings" failed on `toBe` against a stub returning '' | 001168e |
| 2 | 1c65407 | `tdd/06-09-task2-red.json`: RED_EVIDENCE_OK. Target "startSkipsToast > names what started…" failed on `toBe` against a stub returning '' | f9effb0 |
| 3 | 5b9239b | `tdd/06-09-task3-red.json`: RED_EVIDENCE_OK. Target "batchDoneToast > adds the job-time changed skips" failed on `toBe` against a stub returning an empty message | 818f590 |

Semantic assessment: each target ran and failed on its planned assertion against stubs that compiled. In the unfiltered RED runs, 20, 8 and 5 new tests failed on their assertions; the 4 `hasRunFinished` false cases passed against the always-false stub, as expected. Every existing test passed.

Tracer gate (auto mode): after GREEN and the fix commit, I re-ran the full Task 1 `<verify>`. The package diff was empty, 60 tests passed, and tsc and biome were clean, so the plan went on to Task 2.

## Verification

- Plan `<verification>`: tsc exited 0 and biome found no issues in 685 files.
  - `vitest run`: 120 files and 2170 tests. In the full run, one test failed: `src/server/claude/cli.test.ts > escalates to SIGKILL after 3 s`. It is a timing flake in an unrelated file and passes alone (41/41).
  - `build-demo.ts`: verify-export PASS.
  - `smoke.ts` with all six `--expect` markers: PASS 4 pages, zero /api requests.
- Acceptance greps:

  | Check | Count |
  |-------|-------|
  | `/api/spines/bulk-import` in the dialog | 1 |
  | `BulkImportBar` in spines-view | 2 |
  | `SpineSelectCheckbox` in compact-spine-card / photo-section | 2 / 2 |
  | `pruneSelection` in spines-view | 3 |
  | `export function batchDoneToast` | 1 |
  | `hasRunFinished` in spines-view | 2 |

## Decisions Made

- The selection is controlled by SpinesView, which passes the pruned view to the provider. The count is therefore right on the same render as the data, before the prune effect writes the raw state.
- `useSpineSelection()` returns null outside the provider. PhotoSection and the cards render no checkbox there, so existing card tests are unchanged.
- The dialog's request is tested through the exported `bulkStartBody` and `startBulkImport` with fetch mocked. The tests use `renderToStaticMarkup` in a node environment and cannot click.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The route was named twice in the dialog file**
- **Found during:** Task 1 acceptance check
- **Issue:** A doc comment repeated `/api/spines/bulk-import`, so the acceptance grep printed 2 instead of 1.
- **Fix:** I reworded the comment.
- **Files modified:** src/components/bulk-import-dialog.tsx
- **Commit:** e201f7b

Recorded in the plan context and carried out as written:
- Per D-20 a failed import is selectable, so "Import failed. Use Retry import on this card." is never shown. A test asserts that no reason text exists for a failed import.
- The finished toast adds " {k} skipped because they changed."

**Total deviations:** 1 auto-fixed (Rule 1). **Impact:** none on behavior.

## Issues Encountered

- `src/server/claude/cli.test.ts` SIGKILL timing test is flaky under full-suite load. It is out of scope and passes when run alone.

## Next Phase Readiness

- Ready for 06-10. The browser checks are left for phase verification: the click path, tooltips, focus moves, the 360px wrap, the dialog title wrap with a 60-character folder and a 40-character country, and toast timing across reloads.

## Self-Check: PASSED

- All 7 created files exist on disk.
- All 7 commits (195e452, 001168e, e201f7b, 1c65407, f9effb0, 5b9239b, 818f590) are ancestors of HEAD.
