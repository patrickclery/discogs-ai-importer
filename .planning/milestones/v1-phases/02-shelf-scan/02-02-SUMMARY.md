---
phase: 02-shelf-scan
plan: 02
subsystem: vision
tags: [spike, calibration, claude-cli, sharp, vitest, fixtures]
status: complete

requires:
  - phase: 02-01
    provides: vision contract, resizedSize, normalizeImage, crop geometry, buildVisionArgs/runVisionCall, classifyVisionRun, spike harness step one
provides:
  - Calibration of the CLI pixel space against known boxes (1:1 confirmed at the 2576/4784 tier and over 500 KB)
  - 40 recorded spike runs (10 photos x opus/sonnet x medium/high) plus 6 calibration records as committed fixtures
  - report.json with per-run measurements and proposed freeze constants for Plan 02-04
  - Synthetic-shelf generator and fake CLI vision mode for fixture-only tests
  - Tests locking resize, normalize, crop geometry, parsing, classification and the vision argv/env
affects: [02-04 contract freeze, 02-05 scan job, D-03 density warning settings]

actuals:
  tokens: 21200
  tasks: 3
  commits: 5
plan_head_before: 9c4d764beeefdca15279722ef62a64fd48f7b68d
plan_head_after: e8b9a7ada6d9bb466001f00017f33b176516ef55

tech-stack:
  added: []
  patterns:
    - "Synthetic shelves with a red reading-start marker prove crop orientation from raw pixels"
    - "Spike steps reuse any recorded configuration; live calls capped by SPIKE_MAX_CALLS and run SPIKE_CONCURRENCY at a time"
    - "Cross-model raw_text agreement on IoU-matched spines is the misread proxy until the owner counts misreads"

key-files:
  created:
    - test/fixtures/vision/synthetic-shelf.mjs
    - test/fixtures/vision/calibration/*.json (6 records)
    - test/fixtures/vision/spike/*.json (39 new records)
    - test/fixtures/vision/spike/report.json
    - src/server/images/resize.test.ts
    - src/server/images/normalize.test.ts
    - src/server/images/crop.test.ts
    - src/server/vision/parse.test.ts
    - src/server/vision/run.test.ts
  modified:
    - scripts/spike/vision.spike.ts
    - test/fixtures/fake-claude.mjs
    - src/server/vision/parse.ts
    - src/server/claude/cli.test.ts
    - vitest.spike.config.ts
    - biome.json

key-decisions:
  - "Calibration: the CLI Read path is 1:1 at the 2576/4784 tier (median corner error 0.02-0.03% of the short edge, reported size = sent size), including a 1.2 MB JPEG; no 2000 px fallback was needed"
  - "Proposed freeze: opus-5-5 at high effort, N 90 spines, W 33 px, confidence 0.6, CLAUDE_CODE_MAX_OUTPUT_TOKENS 32000, crop source master, tiling not needed (pending the owner's misread count)"
  - "parseVisionResult keeps non-empty field values exactly as returned (no trim) and turns a non-number confidence into 0 instead of rejecting the photo"
  - "Recorded spike and calibration JSON is excluded from biome (generated data)"

patterns-established:
  - "Fixture-only vision tests: CLAUDE_BIN=fake-claude.mjs with FAKE_CLAUDE_MODE=vision and FAKE_CLAUDE_VISION_FIXTURE"
  - "Owner-photo tests use it.skipIf on fixtures/spike/ (A8)"

requirements-completed: [VIS-01, VIS-02, VIS-04, INGEST-05]

coverage:
  - id: D1
    description: "Synthetic spines at known boxes return within 1.5% median corner error through the production argv (portrait, landscape, >500 KB)"
    requirement: "VIS-01"
    verification:
      - kind: integration
        ref: "SPIKE_STEPS=calibrate corepack pnpm spike:vision"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every spike photo read once per configuration; report.json holds runs, calibration and proposals"
    requirement: "VIS-02"
    verification:
      - kind: other
        ref: "node -e report.json shape check (40 runs, 6 calibration entries, all proposal keys)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Proposed freeze constants and the misread rate behind the tiling recommendation"
    verification: []
    human_judgment: true
    rationale: "Misread rates need the owner's count in fixtures/spike/out/*/compare.html; the Plan 02-04 freeze checkpoint decides."
  - id: D4
    description: "resizedSize docs cases and EXIF-aware normalization with a vision JPEG at most 500000 bytes"
    requirement: "INGEST-05"
    verification:
      - kind: unit
        ref: "src/server/images/resize.test.ts, src/server/images/normalize.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Crops are upright for every text_orientation; box normalization boundary, precision and adjacency rules hold"
    requirement: "VIS-04"
    verification:
      - kind: unit
        ref: "src/server/images/crop.test.ts (15 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Parsing, classification and the vision argv/env are proven against the fake CLI and recorded responses only"
    requirement: "VIS-02"
    verification:
      - kind: unit
        ref: "src/server/vision/parse.test.ts, src/server/vision/run.test.ts, src/server/claude/cli.test.ts"
        status: pass
    human_judgment: false

duration: 34min
completed: 2026-10-19
---

# Phase 2 Plan 02: Vision Spike Calibration, Matrix and Fixture Tests Summary

**The CLI's pixel space is 1:1 at 1449x2576 and 2212x1659, and also for a 1.2 MB JPEG (median corner error 0.02-0.03% of the short edge). Ten shelf photos were each read once by Opus and Sonnet at medium and high effort, giving 40 runs, all `ok`. report.json proposes Opus at high effort, N 90, W 33 px and a 32000 max output tokens cap. Geometry, normalization, parsing and argv are now locked by 141 tests that use only fixtures.**

## Performance

- **Duration:** 34 min (started 2026-10-20T02:58:04Z)
- **Tasks:** 3
- **Files:** 12 source/test files plus 46 recorded JSON fixtures
- **Live calls:** 6 calibration + 39 matrix (two runs of 24 and 15 under SPIKE_MAX_CALLS). No configuration was sent twice.

## Accomplishments

- **Calibration (tracer):** 6 out of 6 calls passed. Matching was 16/16 or 12/12 spines, the fitted scale was 0.9993-1.0, and every reported image size equalled the sent size. The 1.2 MB file shows no byte-based downsampling (A7 resolved), so the 2000 px fallback probe never ran (A1 confirmed).
- **Matrix:** 10 HEIC photos. heif-info shows angle 0 on every one, and the decoded sizes match. One landscape photo (IMG_3562, 4032x2268) is stored as landscape, so `irot` is still not exercised (A-03 stays unverified). Crops are cut from both sources, and `compare.html` is written per photo under `fixtures/spike/out/`.
- **Findings for the freeze:**
  - Sonnet at medium under-returns on dense shelves: 39 of an estimated 85, 50 of 75, and 42 of 120.
  - Opus at medium returned 92 of an estimated 190 on IMG_3561. Only Opus at high was complete on that shelf (137 of 140).
  - Opus high and Sonnet high cost about the same ($0.38 vs $0.33 mean), so Sonnet is not meaningfully cheaper.
  - The densest shelf (IMG_3561, median short side 29 px) is the only one where the two models disagree on density grounds (0.46).
  - IMG_3559 has leaning spines. Its axis-aligned boxes are near-square, so some crops are not wider than tall, and the models agree on only 0.5 of its spines. It was left out of the density thresholds.
- **Tests:** the fake CLI has a vision mode, and new tests cover resize, normalize, crop, parse, run and the CLI env/argv guards. `pnpm test` runs 228 tests and they pass.

## Task Commits

1. **Task 1: calibration tracer**: `7105435` (feat)
2. **Task 2: matrix and report**: `3fd07df` (feat)
3. **Task 3: fixture-only tests**: `11f2351` (test, RED), then `21c5bb8` (feat, GREEN)
4. **Lint fix for generated records**: `e8b9a7a` (fix)

## TDD Gate Compliance

- **RED** (`11f2351`): `vitest run src/server/vision --reporter=tap-flat` exited 1 with 5 of 37 tests failing. Classifier verdict: `RED_EVIDENCE_OK` (target_test_failed).
  - The target test "makes exactly one invocation and the recorded output classifies ok" failed on its assertion as `refused: OK`, because the fake CLI had no vision mode.
  - Semantic check: all 5 failures are planned assertions. The fake had no vision mode and no env presence flags. parse.ts trimmed values and rejected a NaN confidence. There were no import, syntax or fixture faults.
- **GREEN** (`21c5bb8`): the 141 targeted tests pass, and so does the full suite (228).
- **REFACTOR:** none was needed.

## Decisions Made

See `key-decisions`. The proposals are recommendations for the Plan 02-04 freeze checkpoint. The owner's misread count on the comparison pages decides the tiling recommendation (A-02).

## Deviations from Plan

**1. [Rule 3 - Blocking] The spike's console output was hidden**
- Vitest auto-selects a quiet reporter under an AI agent, and it dropped the per-call median/p90 lines that the acceptance criteria require.
- **Fix:** `reporters: ['default']` in `vitest.spike.config.ts`. Commit `7105435`.

**2. [Rule 1 - Bug] parseVisionResult did not meet the VIS-02 contract**
- It trimmed non-empty values, but the contract says values are kept exactly. It also rejected the whole result when any confidence was NaN or not a number, but the contract says such a confidence becomes 0.
- **Fix:** whitespace-only values still become null, other values are no longer trimmed, and non-number confidences are sanitized before validation. The schema and SCHEMA_VERSION are unchanged. Commit `21c5bb8`.

**3. [Rule 3 - Blocking] Biome rejected the generated report.json layout**
- **Fix:** recorded spike and calibration JSON are excluded in `biome.json`. Commit `e8b9a7a`.

**4. [Adjustment] calibrationHeavy is sent as rendered and does not go through normalizeImage**
- normalizeImage would re-encode it under 500 KB and defeat the A7 check. The noise is amplitude 3 at q98 4:2:0, which gives 1.2 MB: over 500 KB and under the 5 MB API image limit.

**5. [Adjustment] Density thresholds leave out non-density failures**
- The first heuristic let IMG_3559 (leaning spines, sparse) force the default thresholds.
- Agreement is now measured over matched spines only, with coverage reported separately. Bad photos that are neither crowded nor narrow are listed under `excludedFromDensity`.

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug) and 2 harness adjustments. **Impact:** no scope change. parse.ts now matches the stated contract.

## Issues Encountered

- Leaning spines (IMG_3559) produce axis-aligned boxes whose crops are not wider than tall. The schema has no rotated boxes, so the freeze should decide whether that matters.

## User Setup Required

None remaining. `fixtures/spike/` already held 10 HEIC photos, so the precondition was met and no USER-SETUP.md was generated. The photos and `fixtures/spike/out/` stay gitignored (`git status --porcelain fixtures/` is empty).

## Next Phase Readiness

- Plan 02-04 freeze: review `test/fixtures/vision/spike/report.json` (`proposals` and `rationale`) and count misreads in `fixtures/spike/out/*/compare.html`.
- A-03 (`irot` on a rotated iPhone HEIC) is still unverified. Every photo has angle 0.

## Self-Check: PASSED

- All created and modified files exist, and commits 7105435, 3fd07df, 11f2351, 21c5bb8 and e8b9a7a are ancestors of HEAD.
- `corepack pnpm test` (228), `corepack pnpm lint` and `corepack pnpm typecheck` exit 0. The report.json node check exits 0. There are 41 spike JSON files (at least 7 required) and 6 calibration files (at least 4 required).

---
*Phase: 02-shelf-scan*
*Completed: 2026-10-19*
