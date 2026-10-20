---
phase: 02-shelf-scan
plan: 04
subsystem: vision-pipeline
tags: [vision, claude-cli, scan-job, crops, sqlite, file-route, tracer]
status: complete

requires:
  - phase: 02-01
    provides: vision-contract, normalizeImage, crop geometry, runVisionCall, classifyVisionRun, visionJsonSchema, synthetic shelf + fake CLI vision mode
  - phase: 02-02
    provides: spike report.json proposals (the freeze inputs)
  - phase: 02-03
    provides: scan tables, ingestUpload (run 1 + one-shot scan_photo job), listPhotos, verify-scan a-h
provides:
  - Frozen vision contract (effort high, max output tokens 32000, confidence 0.6, density 90 / 33 px, CROP_SOURCE master) guarded by schema.test.ts + vision-schema.frozen.json
  - Settings getVisionEffort/setVisionEffort, getConfidenceThreshold, getDensityThresholds
  - reasonFor() / SCAN_ERROR_KINDS (UI-SPEC error copy)
  - setRunStatus (CAS), updateRunWhile, markRunError, persistRunResult (first runs)
  - scan_photo job handler (runScanPhoto, ScanPhotoPayload), registered with timeoutMs 720000
  - listSpines()
  - GET /api/files/[...path] allowlisted streaming
  - Server-rendered /spines list
  - verify-scan steps i-n and fakeVisionEnv/visionCalls helpers
affects: [02-05 failure hardening and reconciliation, 02-06 upload page, 02-08 polled spines list, 02-09 editing, 02-10 re-scan merge]

actuals:
  tokens: 16100
  tasks: 2
  commits: 1
plan_head_before: f6b9bb87df2d52f5d1908bee17601f2f3cc488b2
plan_head_after: b150f4b003302fd7195c97bd95585b16cd1ea199

tech-stack:
  added: []
  patterns:
    - "Run ledger: every vision_runs transition is a compare-and-set UPDATE ... WHERE status = from; calling (spawned_at) is the recorded call"
    - "Raw first: vision/<photoId>/run-<n>/raw.json is written and raw_path set before classifyVisionRun"
    - "No throw after the spawn: one try/catch ends in markRunError('failed') and the handler returns normally"
    - "Vision image temp file is written one directory up, so the CLI's --add-dir only ever holds the finished image.jpg"
    - "File route: first-segment allowlist + extension allowlist + per-segment check + resolved path must stay under the allowlisted root"

key-files:
  created:
    - src/server/jobs/handlers/scan-photo.ts
    - src/server/jobs/handlers/scan-photo.test.ts
    - src/server/scan/store.ts
    - src/server/vision/reasons.ts
    - src/server/vision/reasons.test.ts
    - src/server/vision/schema.test.ts
    - test/fixtures/vision/vision-schema.frozen.json
    - src/app/api/files/[...path]/route.ts
  modified:
    - src/lib/vision-contract.ts
    - src/server/settings.ts
    - src/server/settings.test.ts
    - src/server/jobs/handlers/index.ts
    - src/server/scan/queries.ts
    - src/app/spines/page.tsx
    - scripts/verify-scan.ts

key-decisions:
  - "Task 1 checkpoint: owner chose freeze-master with no overrides. Frozen: MAX_EDGE 2576 / MAX_TOKENS 4784, default model claude-opus-5-5, default effort high, density warning N=90 spines / W=33 px median short side, confidence threshold 0.6, max output tokens 32000, crops cut from the full-resolution upright image, no tiling"
  - "Vision calls run via claude -p on the owner's Claude Max subscription; per-photo $ figures (cost_usd, spike costUsd) are API-equivalent reporting only, the real cost is Max quota"
  - "cd_count counts detections whose media_kind is in SPINE_MEDIA_KINDS (cd and unsure), matching the spike's cdSpines"
  - "spine_detections.idx is Claude's index (rounded), position is the array index; spines list by idx then position"

requirements-completed: [INGEST-05, VIS-01, VIS-02, VIS-03, VIS-04, REV-01]

duration: 7min
completed: 2026-10-20
---

# Phase 2 Plan 04: Vision freeze and scan tracer Summary

**The vision contract is frozen (freeze-master: effort high, 32000 output tokens, crops from the full-resolution master), and a queued photo now goes through one ledgered `claude -p` call. Its raw answer is saved to disk before parsing, then it is cropped horizontal, stored as stable spines with the original AI values, served through an allowlisted file route and listed on /spines.**

## Performance

- **Duration:** about 7 min (continuation after the Task 1 checkpoint)
- **Started:** 2026-10-20T03:47:26Z
- **Completed:** 2026-10-20T03:54Z
- **Tasks:** 2 (1 decision checkpoint, 1 tracer)
- **Files modified:** 15

## Accomplishments

- D-01 freeze recorded in `src/lib/vision-contract.ts` and locked by `schema.test.ts`, which compares against the frozen JSON and checks SCHEMA_VERSION 1.
- The `scan_photo` handler moves a run through queued, preparing, calling, parsing, then done or error. It checks `isCurrent()` before the spawn and writes raw.json before classifying, so a run is never sent twice.
- `/api/files` serves only crops, thumbs and vision `.webp` and `.jpg` files. Originals, raw.json and traversal attempts get a 404.
- The tracer runs end to end in `verify-scan`: one `-p` call covers one photo and three identical uploads. The 6 spines include two identical reads that stay separate, and every crop is horizontal WebP.

## Task Commits

1. **Task 1: Freeze the vision contract and choose the crop source.** Decision only, no files. The owner chose `freeze-master`.
2. **Task 2: Tracer, from a queued photo to /spines.** Commit `b150f4b` (feat).

## Decisions Made

- **Task 1 option: `freeze-master`, no value overrides.** These values from `test/fixtures/vision/spike/report.json` proposals are frozen:
  - MAX_EDGE 2576 / MAX_TOKENS 4784
  - default model `claude-opus-5-5`, default effort `high`
  - density warning: more than 90 spines, or a median short side under 33 px
  - confidence threshold 0.6
  - max output tokens 32000
  - crop source `master` (the full-resolution upright image)
  - no tiling
- **Billing note from the owner:** vision calls run through `claude -p` on the owner's Claude Max subscription. Per-photo dollar figures are API-equivalent reporting only; the real cost is Max quota.
- cd_count counts `cd` and `unsure` detections (SPINE_MEDIA_KINDS), the same way the spike counted them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] verify-scan step (d) asserted `queued`, which races the now-working worker**
- **Found during:** Task 2 (verify-scan)
- **Issue:** With a real scan_photo handler, the worker can claim the run before step (d) polls.
- **Fix:** (d) now accepts any run status from queued to done and checks run 1. Step (i) waits for done.
- **Files modified:** scripts/verify-scan.ts
- **Commit:** b150f4b

**2. [Rule 2 - Security] The file route rejects dot and separator segments, and the resolved path must stay under the allowlisted root**
- **Found during:** Task 2 (file route)
- **Issue:** `crops/../photos/<sha>.jpg` passes the first-segment and extension checks and still resolves inside DATA_DIR, so resolveData alone would serve an original.
- **Fix:** A per-segment check (no `.`, `..`, empty, `/`, `\` or NUL), plus a check that `abs` starts with `resolveData(root) + sep`. Step (m) tests an encoded `crops/<id>/../../photos/...` path and `/api/files/app.db`.
- **Files modified:** src/app/api/files/[...path]/route.ts, scripts/verify-scan.ts
- **Commit:** b150f4b

**3. [Rule 2 - Tests] Added unit coverage beyond the plan's verify list**
- `scan-photo.test.ts`: one call, raw first, crop URLs and shape, ai_value equal to value, no spawn when the claim is not current, never run twice, CLI failure recorded without throwing, unreadable original turned into image_unreadable before any call.
- `reasons.test.ts`, and settings tests for the frozen defaults and out-of-range fallbacks.
- **Commit:** b150f4b

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical). **Impact:** no scope change.

## Issues Encountered

None.

## Verification

- `corepack pnpm vitest run src/server/vision/schema.test.ts`: 1 file, 2 tests passed
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: clean, 20 files and 251 tests passed
- `node scripts/verify-scan.ts`: steps a to n pass and the run ends with `verify-scan OK`
- `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts`: `verify-skeleton OK`
- Acceptance greps: `scan_photo:` 1, `vision_effort` 1, `CROP_SOURCE` 3, `isCurrent()` 1
- Tracer gate (auto mode): verify re-run end to end and passed

## Next Phase Readiness

- Plan 02-05 can add reconciliation for runs left in preparing, calling or parsing (A-07: a run whose isCurrent() is false stays in preparing) and density flags. The density thresholds are already available through `getDensityThresholds()`.
- Plan 02-10 adds the re-scan merge behind `persistRunResult`, which throws for run_no > 1 today.

## Self-Check: PASSED

- All created files exist on disk; commit b150f4b is an ancestor of HEAD.
