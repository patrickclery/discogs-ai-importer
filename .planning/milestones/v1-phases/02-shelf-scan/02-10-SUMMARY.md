---
phase: 02-shelf-scan
plan: 10
subsystem: scan
tags: [rescan, matching, levenshtein, merge, sqlite, alert-dialog, tdd]

requires:
  - phase: 02-shelf-scan
    provides: "02-05 persistRunResult and run states; 02-07 /upload rows; 02-08 photo sections; 02-09 field edits with edit_base_ai_value"
provides:
  - "POST /api/photos/{id}/rescan: 415/404/409 guard, run_no + 1 with a one-shot scan job"
  - "startRescan() in one immediate transaction (D-17)"
  - "D-14 matcher: matchDetections, pairScore, MATCH_CUTOFF 0.6 (tuned on spike fixtures)"
  - "mergeRunIntoSpines(): D-15/D-16 merge called by persistRunResult for run_no > 1"
  - "RescanButton (trigger + confirm AlertDialog) on /spines headers and /upload rows"
  - "rowAction() row-action rule for /upload"
  - "scripts/verify-rescan.ts with exported, named steps for Plan 02-11"
affects: [02-11 orphan re-attach/dismiss, 02-12 latest-scan hint, phase 3 Discogs matching]

actuals:
  tokens: 19500
  tasks: 3
  commits: 5
plan_head_before: 4ca815ba3741145065d44b8eea87ef9a008490aa
plan_head_after: 8e9cdba22f87f7e8825e5b31ae2f432d3b449c01

tech-stack:
  added: []
  patterns:
    - "Re-scan detections are inserted unlinked, then the merge links them in the same immediate transaction"
    - "Geometry in a per-run normalized, aspect-scaled unit space (box / vision size x aspect)"
    - "Greedy one-to-one pairing on a sorted candidate list; index gap only as a tiebreaker"

key-files:
  created:
    - src/app/api/photos/[id]/rescan/route.ts
    - src/app/api/photos/[id]/rescan/route.test.ts
    - src/server/scan/rescan.ts
    - src/server/scan/levenshtein.ts
    - src/server/scan/levenshtein.test.ts
    - src/server/scan/match.ts
    - src/server/scan/match.test.ts
    - src/server/scan/merge.ts
    - src/server/scan/merge.test.ts
    - src/components/rescan-button.tsx
    - scripts/verify-rescan.ts
    - .planning/phases/02-shelf-scan/tdd-evidence/02-10-task2-red.json
    - .planning/phases/02-shelf-scan/tdd-evidence/02-10-task3-red.json
  modified:
    - src/server/scan/store.ts
    - src/server/db/schema.ts
    - src/components/photo-section.tsx
    - src/components/photo-status-row.tsx
    - src/lib/photo-status.ts
    - src/lib/photo-status.test.ts

key-decisions:
  - "MATCH_CUTOFF tuned 0.5 -> 0.6 on the spike fixtures; weights stay 0.8 geometry / 0.2 text, DISTANCE_REACH 3 short sides"
  - "Distances are measured in an isotropic unit space (box / own vision size, scaled by aspect) so tall photos do not stretch short sides"
  - "The strict one-short-side bound is asserted for every photo's Opus high vs medium pair; across models the same spine can sit up to 1.16 short sides away, so the all-pairs test requires such far pairs to read alike (text similarity >= 0.5)"
  - "An edited field keeps edit_base_ai_value (the read the owner edited against) across a re-scan, cleared only when the value now equals the new read"
  - "/upload row actions come from a pure rowAction() helper so the rule is unit-tested"

patterns-established:
  - "Re-scan path: startRescan (immediate tx) -> scan_photo job unchanged -> persistRunResult -> mergeRunIntoSpines"
  - "Confirm dialogs that call the server keep the dialog open on failure with a role=alert line"

requirements-completed: [INGEST-04]

coverage:
  - id: D1
    description: "Explicit re-scan route: 415 unless JSON, 404 unknown, 409 while a run is active, 201 run_no + 1 with one queued max_attempts 1 scan:ID:N job"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/app/api/photos/[id]/rescan/route.test.ts"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(c)(d)"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-14 matcher pairs >= 85% on recorded spike runs, re-pairs 6 px shifts, never pairs across a two-column stack"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/server/scan/match.test.ts"
        status: pass
      - kind: unit
        ref: "src/server/scan/levenshtein.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Merge keeps spine ids and owner edits, supersedes or orphans unmatched old spines, adds new spines, leaves run 1 rows, raw.json and crops untouched"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/server/scan/merge.test.ts"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(e)(f)(h)"
        status: pass
    human_judgment: false
  - id: D4
    description: "RescanButton on /spines headers (icon-only below 640px, disabled with tooltip while analyzing) and on /upload error / 0-spine rows"
    requirement: INGEST-04
    verification:
      - kind: unit
        ref: "src/lib/photo-status.test.ts#rowAction"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts#(g)"
        status: pass
    human_judgment: true
    rationale: "Dialog fit at 360px and 1280px, the tooltip on the disabled trigger, the pending spinner and focus return are visual and interactive; no component test harness exists (UI E10 visual backstop)"

duration: 13min
completed: 2026-10-20
status: complete
---

# Phase 2 Plan 10: Re-scan with Stable Spines Summary

**Explicit re-scan (confirm dialog, 409 guard, one-shot run_no + 1 job) whose result is merged by a 2-D geometry plus code-point Levenshtein matcher, so spines found again keep their ids and the owner's edits while missing ones are superseded or orphaned.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-20T04:47:08Z
- **Completed:** 2026-10-20T05:00:02Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments

- `startRescan` creates the next run, its `scan_photo` job (max_attempts 1, `scan:<photoId>:<runNo>`) and `latest_run_id` in one immediate transaction. It refuses while any run is queued, preparing, calling or parsing. The existing scan handler runs it unchanged.
- `persistRunResult` now accepts run_no > 1. It inserts the new detections unlinked and calls `mergeRunIntoSpines` in the same transaction. Rules: an unedited field takes the new read; an edited field keeps the owner's value and takes the new `ai_value` and confidence; an unmatched old spine is `orphaned` if it has edits and `superseded` if not; an unmatched new detection becomes a new active spine. An orphan that is found again goes back to `active` with its edits.
- Spike tuning: at the final cutoff of 0.6, every photo x configuration pair (60 comparisons across 10 real photos) pairs at least 95.5% of its spines. The worst is img-3559 at 0.955. Opus high vs medium pairs 96.2-100% with every centre within one short side.
- `RescanButton` has the UI-SPEC copy: "Re-scan {filename}?", the quota body, "Keep current scan", "Re-scan photo", "Starting…" while pending, "Re-scan queued for {filename}" toast, and "Couldn't start the re-scan: {reason}." as a role=alert line. It appears on /spines section headers (compact below 640px) and on /upload rows that are error or done with 0 spines.
- `scripts/verify-rescan.ts` checks the whole flow end to end: ids and edits kept, W superseded, Y orphaned with its run 1 crop, V new, run 1 rows, raw.json and crops byte-identical, 201 then 409, and exactly 2 `-p` calls.

## Task Commits

1. **Task 1: Tracer, re-scan from the header with merged spines** - `8b7997c` (feat)
2. **Task 2: Matching on real shelves and merge rules locked by tests** - `fef14d9` (test, RED), `4f145c5` (feat, GREEN)
3. **Task 3: Re-scan on /upload rows and the 409 guard** - `4edcf6b` (test, RED), `8e9cdba` (feat, GREEN)

## Files Created/Modified

- `src/app/api/photos/[id]/rescan/route.ts`: POST with 415/404/409/201.
- `src/server/scan/rescan.ts`: `startRescan()`, an immediate transaction with named params.
- `src/server/scan/levenshtein.ts`: `normalizeForMatch`, a two-row `levenshtein` over code points, `textSimilarity`.
- `src/server/scan/match.ts`: `pairScore`, `geometryScore`, `centreDistanceInShortSides`, `matchDetections`, `MATCH_CUTOFF`.
- `src/server/scan/merge.ts`: `mergeRunIntoSpines()` with D-15/D-16 rules as one UPSERT per field.
- `src/server/scan/store.ts`: the run_no > 1 path through the merge.
- `src/components/rescan-button.tsx`: the trigger, the confirm AlertDialog and the disabled tooltip state.
- `src/components/photo-section.tsx`: Re-scan in the sticky header. Existing cards stay during a re-scan.
- `src/components/photo-status-row.tsx` and `src/lib/photo-status.ts`: `rowAction()` and the Re-scan row action.
- `scripts/verify-rescan.ts`: the e2e proof, with steps (a)-(h) exported.

## Decisions Made

- **Cutoff 0.6 instead of 0.5.** At 0.5, img-3561 (Opus medium vs Sonnet medium) paired "LOREENA MCKENNITT" with "MARK KNOPFLER golden heart" (score 0.54, 1.14 short sides apart, text 0.23). A second wrong pair scored 0.56. At 0.6 both are rejected. The only other pair lost was a null-text pair at 0.59. The weights were not changed.
- **Where the one-short-side bound is asserted.** The plan's literal truth (no accepted pair farther than one short side) holds for an effort change on the same model. Across models, the same spine read with a looser box can sit up to 1.16 short sides away, with identical text. Rejecting those would lose correct matches, so the all-pairs test instead requires any pair beyond one short side to read alike (text similarity >= 0.5).
- **Isotropic geometry.** Boxes are divided by their own run's vision size, as the plan says, then scaled by aspect so x and y share one unit. IoU is unaffected. Centre distance and short side are no longer stretched on 1449x2576 photos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Pure `rowAction()` helper in `src/lib/photo-status.ts`**
- **Found during:** Task 3
- **Issue:** The row-action rule had no test seam (no component test harness), and the rescan route tests passed on first run because the route shipped in the Task 1 tracer. That left no valid RED target for Task 3.
- **Fix:** Extracted the rule into a pure `rowAction(photo)` covered by `photo-status.test.ts` (RED stub returning null, then GREEN).
- **Files modified:** src/lib/photo-status.ts, src/lib/photo-status.test.ts
- **Committed in:** 4edcf6b, 8e9cdba

**2. [Rule 1 - Bug] Avoided a client import cycle**
- **Found during:** Task 1
- **Issue:** Importing `PHOTOS_QUERY_KEY` from photo-status-list into rescan-button would cycle once photo-status-row imports RescanButton.
- **Fix:** Invalidate the literal `['photos']` key, matching the key value.
- **Files modified:** src/components/rescan-button.tsx
- **Committed in:** 8b7997c

**3. [Rule 1 - Bug] a11y lint on the disabled trigger wrapper**
- **Found during:** Task 1
- **Issue:** Biome rejected `aria-label` on the focusable tooltip span.
- **Fix:** Removed it. The span's content ("Analyzing…") plus the Radix tooltip description carry the reason.
- **Files modified:** src/components/rescan-button.tsx
- **Committed in:** 8b7997c

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 bugs)
**Impact on plan:** No scope change. The `schema.ts` edit is a comment only (detections are linked once, inside their run's transaction). No migration.

## TDD Gate Compliance

- **Task 2 RED** (`fef14d9`): target "geometry alone never pairs boxes more than one short side apart" failed on its assertion (similarity 0.23 >= 0.5). Classifier verdict `RED_EVIDENCE_OK`, evidence in `tdd-evidence/02-10-task2-red.json`. Semantic assessment: valid. The test ran and failed for the intended reason. The other match, levenshtein and merge tests passed on first run because the Task 1 tracer already implements them, by plan design. **GREEN** `4f145c5`.
- **Task 3 RED** (`4edcf6b`): target "Re-scan for an error, or for done with 0 spines" failed (expected null to be 'rescan') against a null stub. Verdict `RED_EVIDENCE_OK`, evidence in `tdd-evidence/02-10-task3-red.json`. The six route tests passed on first run (the route shipped in the tracer), so they lock the contract rather than drive it. **GREEN** `8e9cdba`.
- No REFACTOR commits were needed.

## Issues Encountered

None.

## User Setup Required

None. No external service configuration is required.

## Verification

- `corepack pnpm typecheck`, `lint`, `build`: pass.
- `corepack pnpm test`: 31 files, 437 tests pass.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts`: `verify-rescan OK`.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`: `verify-scan OK` (regression).
- Human check, deferred to end-of-phase: on /upload a failed photo shows "Re-scan photo" and returns to Analyzing after confirming. On /spines at 360px the icon-only trigger is shown, disabled with its tooltip while analyzing. The dialog fits at 360px and 1280px.

## Next Phase Readiness

Ready for 02-11 (orphaned spines: re-attach / dismiss). Orphans already keep their old crop and detection, and `scripts/verify-rescan.ts` exports its steps for extension.

## Self-Check: PASSED
