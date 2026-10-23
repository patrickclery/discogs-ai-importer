---
phase: 02-shelf-scan
plan: 11
subsystem: scan
tags: [orphans, reattach, dismiss, dialog, radio-group, sqlite, tdd]

requires:
  - phase: 02-shelf-scan
    provides: "02-10 mergeRunIntoSpines (orphaned state, created_run_id), RescanButton, verify-rescan exported steps; 02-09 field edits"
provides:
  - "listReattachCandidates / reattachSpine / dismissSpine in src/server/scan/orphans.ts"
  - "GET+POST /api/spines/{id}/reattach, POST /api/spines/{id}/dismiss (415/404/409/200)"
  - "getSpines lists orphaned spines after active ones, with orphanedRunNo"
  - "loadSpineDtos / getSpineDto shared SpineDto loader in queries.ts"
  - "ReattachDialog, DismissSpineButton, orphan badge/border/footer on SpineCard, 'No longer detected ({n})' sub-heading"
  - "shadcn dialog and radio-group"
  - "test/helpers/scan-runs.ts orphanScenario fixtures"
affects: [02-12 needs-review count and latest-scan hint, phase 3 Discogs matching on stable spine ids]

actuals:
  tokens: 18800
  tasks: 2
  commits: 3
plan_head_before: 4ff2be20b727cd472d95f40e881291d6ea9ccc49
plan_head_after: d2d91ac8de8b78927898b998a2ea7a8b8faf884f

tech-stack:
  added: []
  patterns:
    - "Candidate set is a single SQL predicate reused by the list and inside the write transaction (T-02-25)"
    - "Inline dialog errors via shared failureReason() in src/lib/failure-reason.ts"
    - "Cards carry data-spine-card and Re-scan triggers data-rescan-trigger for post-dismiss focus"

key-files:
  created:
    - src/server/scan/orphans.ts
    - src/server/scan/orphans.test.ts
    - src/app/api/spines/[id]/reattach/route.ts
    - src/app/api/spines/[id]/reattach/route.test.ts
    - src/app/api/spines/[id]/dismiss/route.ts
    - src/components/reattach-dialog.tsx
    - src/components/dismiss-spine-button.tsx
    - src/components/ui/dialog.tsx
    - src/components/ui/radio-group.tsx
    - src/lib/failure-reason.ts
    - test/helpers/scan-runs.ts
    - .planning/phases/02-shelf-scan/tdd-evidence/02-11-task2-red.json
  modified:
    - src/server/scan/queries.ts
    - src/components/spine-card.tsx
    - src/components/photo-section.tsx
    - src/components/rescan-button.tsx
    - scripts/verify-rescan.ts

key-decisions:
  - "Re-attach keeps the orphan id, takes the target's detection and supersedes the target (A-20); spine_detections rows are not modified, so the target's detection still names the target in spine_id"
  - "On re-attach an edited field keeps its existing edit_base_ai_value (falling back to the previous ai_value), matching the 02-10 merge rule, instead of always using the previous ai_value"
  - "orphanedRunNo = first done run after the run of the orphan's current detection"
  - "counts.all counts every listed spine, orphans included; the Needs review rule stays for 02-12"
  - "The candidates query uses key ['reattach-candidates', id], because the field editor rewrites every ['spines', ...] query as a SpinesResponse"

patterns-established:
  - "Orphan action routes: JSON-only 415, 404 missing, 409 conflict, 200 with the result"

requirements-completed: [INGEST-04]

coverage:
  - id: D1
    description: "Re-attach: candidates are only the same photo's unedited spines created by the latest run; edits move, unedited fields follow the new read, the target is superseded, the orphan id stays active; refusals change nothing"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/server/scan/orphans.test.ts"
        status: pass
      - kind: integration
        ref: "src/app/api/spines/[id]/reattach/route.test.ts"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(i)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dismiss: only an orphan becomes dismissed, field rows stay stored, it leaves the list; 409 otherwise, 404 unknown, 415 non-JSON"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/server/scan/orphans.test.ts#dismiss"
        status: pass
      - kind: integration
        ref: "src/app/api/spines/[id]/reattach/route.test.ts#POST /api/spines/{id}/dismiss"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(j)(h)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Orphaned cards under 'No longer detected ({n})' with badge, warning border, explanation and Re-attach / Dismiss footer"
    requirement: INGEST-04
    verification:
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(g)"
        status: pass
    human_judgment: true
    rationale: "Dialog fit at 360px and 1280px, the selected-row ring, pending/empty/error states and focus after dismiss are visual and interactive; no component test harness exists (UI E11 visual backstop)"

duration: 10min
completed: 2026-10-20
status: complete
---

# Phase 2 Plan 11: Orphaned Spines (Re-attach and Dismiss) Summary

**After a re-scan, edited spines Claude no longer found show under "No longer detected" with their old crop and edits. The owner can re-attach one to a spine the latest run newly found (the edits move over and the orphan keeps its id) or dismiss it (its edits stay stored). Both actions are guarded server-side with 409s.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-20T05:04:21Z
- **Completed:** 2026-10-20T05:14:15Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- `orphans.ts` uses one SQL candidate predicate: active, same photo, `created_run_id = latest_run_id`, and no field where `value IS NOT ai_value`. Both the GET list and the write path use it. The write runs inside an `.immediate()` transaction, so a stale or forged target gets 409 and nothing changes.
- `reattachSpine` moves the orphan onto the target's detection and crop, upserts each field from the target's read with the 02-10 edit rules, and supersedes the target.
- `getSpines` lists orphans after each photo's active spines, with `orphanedRunNo`. It now builds every spine through `loadSpineDtos`, which the orphan routes also use.
- UI changes:
  - Orphaned cards get the outline "No longer detected" badge with a TriangleAlert icon, a `border-warning/60` border, and a footer with the explanation and the two actions. The section shows a Caption sub-heading "No longer detected ({n})".
  - `ReattachDialog` (max-w-2xl): a RadioGroup of crop + #n + raw text rows. The selected row gets `ring-2 ring-primary`. It has the no-candidates copy (confirm disabled), "Re-attaching…" while pending, an inline "Couldn't re-attach: {reason}." on failure, and the toast "Edits moved to spine #{target}".
  - `DismissSpineButton`: a destructive AlertDialog with "Dismissing…" while pending and an inline "Couldn't dismiss: {reason}." on failure. Its success toast is "Spine #{index} dismissed". Focus then moves to the next card's first field, or to the visible Re-scan trigger.
- `verify-rescan.ts` now also runs these steps:
  - (g): the orphan section renders.
  - (i): re-attach Y to V, check Y's crop is V's, V is superseded, and a repeat gets 409.
  - (j): a third run orphans an edited Q; dismiss returns 200, Q's 6 field rows are kept, and a repeat gets 409.
  - (h): exactly 3 `-p` calls.

## Task Commits

1. **Task 1: Tracer, orphan list and re-attach**: `eef8145` (feat)
2. **Task 2: Dismiss and guards**: `cf05e52` (test, RED), `d2d91ac` (feat, GREEN)

## Files Created/Modified

- `src/server/scan/orphans.ts`: `listReattachCandidates`, `reattachSpine`, `dismissSpine`.
- `src/server/scan/queries.ts`: `loadSpineDtos`, `getSpineDto`; `listSpines` now includes orphans.
- `src/app/api/spines/[id]/reattach/route.ts`, `.../dismiss/route.ts`: the routes.
- `src/components/reattach-dialog.tsx`, `dismiss-spine-button.tsx`, `spine-card.tsx`, `photo-section.tsx`: the orphan UI.
- `src/components/ui/dialog.tsx`, `radio-group.tsx`: shadcn components (font-semibold changed to font-medium, Biome-formatted).
- `src/lib/failure-reason.ts`: inline-error reason helper, moved out of rescan-button.
- `test/helpers/scan-runs.ts`: `orphanScenario`, `foreignCandidate` and the run fixtures.
- `scripts/verify-rescan.ts`: steps (i) and (j); (e) and (g) updated for listed orphans.

## Decisions Made

See key-decisions in the frontmatter. The one that changes behaviour: on re-attach, an edited field keeps the read the owner originally edited against, as the 02-10 merge already does, falling back to the previous `ai_value`. Always resetting it to the orphan's last read would have hidden the original base after more than one re-scan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Separate query key for re-attach candidates**
- **Found during:** Task 1
- **Issue:** `SpineField` rewrites every `['spines', …]` query as a `SpinesResponse`. A `['spines', 'reattach', id]` key would crash on `data.spines.some`.
- **Fix:** Used `['reattach-candidates', id]`. A success invalidates `['spines']`.
- **Files modified:** src/components/reattach-dialog.tsx
- **Committed in:** eef8145

**2. [Rule 2 - Missing critical] Existing verify-rescan assertions updated for listed orphans**
- **Found during:** Task 1
- **Issue:** Step (e) asserted that orphaned Y is not listed. Once orphans are listed, that would fail by design.
- **Fix:** (e) now checks the active spines and that Y is listed last as `orphaned` with its edit.
- **Files modified:** scripts/verify-rescan.ts
- **Committed in:** eef8145

**3. [Rule 3 - Blocking] Shared `failureReason` helper and fixtures**
- **Found during:** Tasks 1 and 2
- **Issue:** Three dialogs needed the same inline-error reason, and two test files needed the same stored-run fixtures.
- **Fix:** Moved `failureReason` into `src/lib/failure-reason.ts`; rescan-button imports it, with no behaviour change. Added `test/helpers/scan-runs.ts`.
- **Files modified:** src/lib/failure-reason.ts, src/components/rescan-button.tsx, test/helpers/scan-runs.ts
- **Committed in:** eef8145, cf05e52

**4. [Scope] Re-attach dialog's empty, pending and error states shipped in Task 1**
- The tracer dialog was built complete. Task 2 only added the dismiss button and wired it into the footer.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking) plus 1 scope note.
**Impact on plan:** No scope creep. There are no schema changes or new packages; `shadcn add` only wrote the two registry files.

## TDD Gate Compliance

- **Task 2 RED** (`cf05e52`): target "dismiss sets an orphan to dismissed and keeps its field rows" failed on its assertion (expected 'not_found' to be 'ok') against a stub. The classifier returned `RED_EVIDENCE_OK`; evidence is in `tdd-evidence/02-11-task2-red.json`. Semantic assessment: valid. The re-attach and candidate tests (9) passed on the first run because the Task 1 tracer already implements them, so they lock the T-02-25 contract rather than drive it.
- **GREEN** `d2d91ac`: 11 orphan tests and 11 route tests pass. No REFACTOR was needed.

## Issues Encountered

None.

## User Setup Required

None.

## Verification

- `corepack pnpm typecheck`, `lint`, `build`: pass.
- `corepack pnpm test`: 33 files, 459 tests pass.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts`: `verify-rescan OK` (re-attach, dismiss, 409s, 3 calls).
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`: `verify-scan OK` (regression).
- Human check, deferred to end of phase (backstop): the Re-attach dialog and Dismiss confirm fit at 360px and 1280px, and dismissing an orphan moves focus to the next card.

## Next Phase Readiness

02-12 is next: the Needs review count should add orphaned spines (UI-SPEC), and `editBaseAiValue` / `orphanedRunNo` are now available for the latest-scan hint.

## Self-Check: PASSED
