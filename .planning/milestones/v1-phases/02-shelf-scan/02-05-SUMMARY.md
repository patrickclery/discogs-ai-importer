---
phase: 02-shelf-scan
plan: 05
subsystem: vision-pipeline
tags: [vision, claude-cli, crash-recovery, reconcile, density, upload-validation, tdd]
status: complete

requires:
  - phase: 02-04
    provides: scan_photo handler (ledgered single call, raw-first), store.ts CAS transitions, reasons.ts copy, frozen density thresholds
  - phase: 02-03
    provides: POST /api/photos refusals, ingestUpload, one-shot scan job (max_attempts 1)
  - phase: 01
    provides: jobs queue, recoverRunningJobs, worker lease tick, scripts/lib harness
provides:
  - Fake CLI modes vision-refused, vision-max-turns, vision-invalid, vision-retries and FAKE_CLAUDE_STDERR
  - stripPaths() in fallback reasons (absolute paths under DATA_DIR, home, tmp become an ellipsis before the 160-char cut)
  - runScanPhoto(payload, ctx, deps?) with deps.callTimeoutMs; ScanPhotoPayload.mode 'scan' | 'reparse'
  - reconcileVisionRuns() and rawPathFor() in src/server/scan/reconcile.ts
  - maintenance hooks (handlers/index.ts) run on every lease-holder tick (worker.ts)
  - computeDensityFlags(), iou(), OVERLAP_IOU in src/server/vision/density.ts
  - persistRunResult writes density_flags; reported-size drift warning
  - scripts/verify-scan-recovery.ts (kill -9 mid-call proof)
affects: [02-06 upload page (errorReason, densityFlags), 02-08 spines list badges, 02-10 re-scan merge (persistRunResult, reconcile)]

actuals:
  tokens: 15300
  tasks: 3
  commits: 5
plan_head_before: eb0718523a839c95dd9152d121372126b601dc85
plan_head_after: 6bfab2e7e9954c978283795c132a5d083fd07f00

tech-stack:
  added: []
  patterns:
    - "Reconcile, never retry: a run whose job finished unsettled is either reparsed from raw.json (one-shot job, dedupe reparse:<runId>) or marked error; no path from recovery reaches runVisionCall"
    - "Worker maintenance hooks: holder-only, each in its own try/catch, after recoverRunningJobs or reapStrandedJobs in the same tick"
    - "settleParsed(): one classify/crop/flag/persist path shared by a fresh call and a reparse"
    - "Density flags are layout-agnostic warnings computed over every detection; nothing is ever dropped"

key-files:
  created:
    - src/server/scan/reconcile.ts
    - src/server/scan/reconcile.test.ts
    - src/server/vision/density.ts
    - src/server/vision/density.test.ts
    - src/app/api/photos/route.test.ts
    - scripts/verify-scan-recovery.ts
    - .planning/phases/02-shelf-scan/tdd-evidence/02-05-task2-red.json
    - .planning/phases/02-shelf-scan/tdd-evidence/02-05-task3-red.json
  modified:
    - test/fixtures/fake-claude.mjs
    - src/server/vision/reasons.ts
    - src/server/jobs/handlers/scan-photo.ts
    - src/server/jobs/handlers/scan-photo.test.ts
    - src/server/jobs/handlers/index.ts
    - src/server/jobs/worker.ts
    - src/server/scan/store.ts
    - src/server/images/detect.test.ts

key-decisions:
  - "A reparse that already ran and still left the run unsettled ends the run in error ('the saved answer could not be read'); reconcile never enqueues a second reparse, so a run cannot loop in parsing"
  - "Reconcile looks for raw.json at the conventional vision/<photo>/run-<n>/raw.json path when raw_path is null, covering a crash between the raw write and the calling->parsing update"
  - "Reparse refuses a raw.json whose runId differs, and a re-normalized image whose size differs from the stored vision_w/vision_h"
  - "out_of_order = repeated index, or more than 20% of consecutive-index pairs farther apart than 3x the median short side; on the 40 spike runs it fires twice (img-3560 opus medium, img-3561 sonnet medium)"
  - "Reported image size drift above 2% is a console.warn naming the run id, never an error (RESEARCH A6)"

requirements-completed: [VIS-03, VIS-01, INGEST-01, INGEST-02]

coverage:
  - id: D1
    description: "Refused, max-turns, buffer-truncated, schema-invalid, retries-exhausted, timeout, aborted and missing-CLI calls each end the run in error with the UI-SPEC reason, keep raw.json and cost exactly one -p call"
    requirement: "VIS-03"
    verification:
      - kind: unit
        ref: "src/server/jobs/handlers/scan-photo.test.ts#runScanPhoto failure modes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Undecodable HEIC, unreadable JPEG and over-100-MP images error with their own reason and zero calls"
    requirement: "VIS-03"
    verification:
      - kind: unit
        ref: "src/server/jobs/handlers/scan-photo.test.ts#heic_decode / image_unreadable / too_large"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fallback reasons built from CLI stderr contain no absolute path and at most 160 characters of detail"
    verification:
      - kind: unit
        ref: "src/server/jobs/handlers/scan-photo.test.ts#a fallback reason from stderr shows no absolute path"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stuck runs are reconciled: queued/preparing -> stopped-before-send error, calling without raw -> interrupted, calling/parsing with raw.json -> one reparse job that finishes the run with zero calls; active jobs untouched"
    requirement: "VIS-03"
    verification:
      - kind: unit
        ref: "src/server/scan/reconcile.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "SIGKILL mid-call then restart ends in the interrupted error, scan job failed after 1 attempt, still exactly one -p call"
    verification:
      - kind: integration
        ref: "node scripts/verify-scan-recovery.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-03 density flags (too_many_spines, small_spines, overlapping, out_of_order) with exact N/W boundaries, consistent with every recorded spike run, stored on the run; overlapping boxes stay separate spines"
    requirement: "VIS-01"
    verification:
      - kind: unit
        ref: "src/server/vision/density.test.ts"
        status: pass
      - kind: unit
        ref: "src/server/jobs/handlers/scan-photo.test.ts#stores density flags and keeps two overlapping boxes"
        status: pass
    human_judgment: false
  - id: D7
    description: "POST /api/photos returns 415/411/413/400 cut_off/400 empty without creating a row or file; 413 does not read the body"
    requirement: "INGEST-01"
    verification:
      - kind: unit
        ref: "src/app/api/photos/route.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "detectImageKind recognizes JPEG, PNG, WebP and HEIC brands heic/heix/hevc/mif1/msf1/heif; GIF, PDF and random bytes are null"
    requirement: "INGEST-02"
    verification:
      - kind: unit
        ref: "src/server/images/detect.test.ts"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-20
---

# Phase 2 Plan 05: Scan failure hardening, crash reconciliation and density flags Summary

**Every way a scan can fail now ends with the photo in Error and a reason the owner can act on, with Claude's raw answer kept. A kill -9 mid-call is reconciled to the "app stopped" error with no second `claude -p` call. A finished but unparsed answer is completed from raw.json for free. Runs also carry layout-agnostic D-03 "retake closer" flags.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-20T03:56:30Z
- **Completed:** 2026-10-20T04:08:51Z
- **Tasks:** 3 (1 tracer, 2 TDD)
- **Files modified:** 16

## Accomplishments

- **Fake CLI failure modes:** vision-refused, vision-max-turns, vision-invalid and vision-retries, plus FAKE_CLAUDE_STDERR. They drive 21 failure-mode tests through the real handler. Every failure kind in the UI-SPEC copy table is produced end to end, and each case makes at most one call.
- **T-02-12:** fallback reasons replace absolute paths under DATA_DIR, the home directory and the temp directory with "…" before the 160-character cut.
- **Reconciliation (T-02-11):** `reconcileVisionRuns()` runs on every lease-holder tick, right after job recovery and reaping. It handles every queued, preparing, calling or parsing run whose job is finished or missing:
  - If a raw answer exists, it enqueues a one-shot reparse job (`reparse:<runId>`, max_attempts 1).
  - Otherwise it marks the run error.
  - Reparse mode reads raw.json and re-normalizes the original. It has no code path to the CLI.
- **kill -9 proof:** `verify-scan-recovery` SIGKILLs the server while the fake CLI hangs, kills the orphaned CLI, then restarts with a fake CLI that would succeed. The photo shows the interrupted copy, `scan:ID:1` is failed after 1 attempt, and the log still has exactly 1 `-p` call after an extra lease tick.
- **Density flags:** `computeDensityFlags()` is checked against synthetic boundaries and all 40 recorded spike runs, which match report.json. The sparse photo (img-3554) raises no flags. Flags are stored in `vision_runs.density_flags`, and two overlapping boxes stay two spines.
- **Upload refusals:** route tests for 415/411/413/400 refusals show nothing is stored, and the 413 response never pulls the body. The detect tests now cover every HEIC brand plus GIF, PDF and random bytes.

## Task Commits

1. **Task 1 (tracer): refused, cut-off or malformed answers end in Error, one call each:** `8cab779` (feat)
2. **Task 2: crash/kill -9 never sends twice, never stuck analyzing:** `cdb4093` (test, RED), `19d8823` (feat, GREEN)
3. **Task 3: density flags and upload refusals:** `a3f1603` (test, RED), `6bfab2e` (feat, GREEN)

## TDD Gate Compliance

- **Task 2 RED:** the target "errors a queued run whose job is gone" failed on its status assertion (`queued` vs `error`) against a no-op `reconcileVisionRuns` stub. Classifier verdict: `RED_EVIDENCE_OK`. Record: `tdd-evidence/02-05-task2-red.json`.
  - The full file run (7 of 11 failing on assertions) cannot be parsed, because Vitest `tap-flat` writes multi-line YAML for object diffs. The target was rerun alone with `-t`.
  - Semantic check: it is a genuine assertion failure, with no load or fixture fault.
- **Task 3 RED:** the target "small_spines when the median short side is below W" failed with `expected [] to include 'small_spines'` against a stub. Verdict: `RED_EVIDENCE_OK`. Record: `tdd-evidence/02-05-task3-red.json`. The detect and route tests in that commit are characterization tests of behavior shipped in 02-03, so they passed at RED.
- **GREEN:** both tasks have a `feat(02-05)` commit after their `test(02-05)` commit. No refactor commit was needed.

## Decisions Made

See key-decisions in the frontmatter. The two that matter most:
- A reparse runs at most once. If it fails, the run is marked error rather than enqueued again.
- `out_of_order` fires on 2 of the 40 real spike runs. A-09 stays tuned only against the spike data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] A failed reparse could leave a run in parsing forever**
- **Found during:** Task 2
- **Issue:** After a reparse job fails, the dedupe key makes `enqueue` return the same finished job. Each tick would then relink it and never settle the run.
- **Fix:** If the existing reparse job is finished, the run is marked error (`failed`, "the saved answer could not be read").
- **Files modified:** src/server/scan/reconcile.ts (test: "errors the run when its reparse job also finished without settling it")
- **Commit:** 19d8823

**2. [Rule 2 - Missing critical] Raw answer on disk while raw_path is still null**
- **Found during:** Task 2
- **Issue:** A crash between writing raw.json and the calling-to-parsing update leaves a calling run with `raw_path` null. The planned check would have marked that run interrupted, even though Claude's paid answer was on disk.
- **Fix:** `rawPathFor(photoId, runNo)` is checked when `raw_path` is null, and reparse sets `raw_path` when it moves the run to parsing.
- **Commit:** 19d8823

**3. [Rule 2 - Correctness] Reparse validation**
- Reparse refuses a raw.json whose `runId` does not match the run.
- It also refuses a re-normalized image whose size differs from the stored vision size, so boxes are never applied to different pixels.
- **Commit:** 19d8823

**4. [Rule 3 - Blocking] scan-photo.test.ts already existed**
- The plan says the file was absent, but 02-04 had created it with 5 tests. It was extended to 23 tests, which keeps the originals.
- **Commit:** 8cab779

**5. [Rule 1 - Bug] Large vision fixtures could be cut short**
- The fake CLI's success path now exits from the write callback, so a stdout of 8 MB or more is fully flushed before exit.
- **Commit:** 8cab779

**6. [Rule 2 - Tests] Extra coverage**
- An over-100 MP case uses a crafted PNG header with a valid CRC.
- Integration tests cover stored density flags, overlapping boxes kept as two spines, a clean shelf with no flags, and the drift warning.
- Reconcile tests cover a missing job and "never enqueues anything but reparse jobs".
- **Commits:** 8cab779, cdb4093, 6bfab2e

---

**Total deviations:** 6 auto-fixed (3 missing critical, 1 blocking, 1 bug, 1 test coverage). **Impact:** no scope change. Each fix closes a path where a stuck run, a re-send or a lost answer could otherwise happen.

## Issues Encountered

None.

## Verification

- `corepack pnpm vitest run src/server/jobs/handlers/scan-photo.test.ts`: 23 passed. This was re-run as the tracer gate (auto mode) before expansion.
- `corepack pnpm vitest run src/server/scan/reconcile.test.ts src/server/jobs/worker.test.ts src/server/jobs/queue.test.ts`: passed.
- `corepack pnpm vitest run src/server/vision/density.test.ts src/server/images/detect.test.ts src/app/api/photos/route.test.ts`: passed (route: 6 tests).
- `corepack pnpm test`: 23 files, 340 tests passed. `corepack pnpm lint` and `corepack pnpm typecheck` exit 0.
- `node scripts/verify-scan-recovery.ts`: `verify-scan-recovery OK`. `node scripts/verify-scan.ts`: `verify-scan OK`. `VERIFY_SKIP_BUILD=1 node scripts/verify-restart.ts`: `verify-restart OK`.
- Acceptance greps:

  | Check | Result |
  |-------|--------|
  | vision-* modes | 10 (at least 4) |
  | `it(` in scan-photo.test.ts | 24 |
  | maintenance in worker.ts | 4 |
  | `reparse:` in reconcile.ts | 1 |
  | runVisionCall in reconcile.ts | 0 |
  | `computeDensityFlags(` in scan-photo.ts | 1 |
  | `0.3` in density.ts | 1 |

- Cost note: every test and proof uses the fake CLI. Live vision calls run on the owner's Claude Max quota. Dollar figures elsewhere are API-equivalent only.

## Known Stubs

None.

## Next Phase Readiness

- 02-06 and 02-08 can render `errorReason` and `densityFlags` from PhotoDto. Both are now filled for every terminal run.
- 02-10's re-scan merge goes behind `persistRunResult`, which now takes `densityFlags`. Re-scan runs get reconciliation and reparse for free, provided their job is linked through `vision_runs.job_id`.

## Self-Check: PASSED

- All key-files.created exist on disk.
- Commits 8cab779, cdb4093, 19d8823, a3f1603 and 6bfab2e are ancestors of HEAD.
