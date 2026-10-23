---
phase: 02-shelf-scan
plan: 01
subsystem: vision
tags: [sharp, heic-decode, claude-cli, json-schema, zod, vitest, spike]
status: complete

requires:
  - phase: 01
    provides: runProcess, buildClaudeArgs/buildClaudeEnv/claudeWorkDir, VISION_MODELS settings, vitest aliases
provides:
  - Client-safe vision contract (enums and freeze constants)
  - Official model-tier resize and deterministic HEIC/JPEG/PNG/WebP normalization
  - Crop geometry (normalize, pad, scale, extract-then-rotate)
  - Bound-free vision JSON schema, prompt, production argv/env and single spawn
  - Vision run classification into ok or typed errors
  - D-01 spike harness step one and the first recorded CLI response
affects: [02-02 spike calibration/matrix, 02-04 contract freeze, 02-05 scan job]

actuals:
  tokens: 10300
  tasks: 2
  commits: 1
plan_head_before: 22632bb921467dbbc17cb85258124301dc2a88e7
plan_head_after: 0dbe790

tech-stack:
  added: [sharp@0.35.5, heic-decode@2.1.0, libheif-js@1.23.5 (transitive)]
  patterns:
    - "Upright image materialized once as raw RGB; vision JPEG, thumbnail and crops all derive from it"
    - "Vision JPEG size is re-read and asserted against resizedSize (pixel-space contract)"
    - "JSON schema post-processed to strip every numeric/length/item bound; ranges enforced in code"
    - "Spike records written before parsing; re-runs reuse the record unless SPIKE_FORCE=1"

key-files:
  created:
    - src/lib/vision-contract.ts
    - src/server/images/resize.ts
    - src/server/images/normalize.ts
    - src/server/images/crop.ts
    - src/server/vision/schema.ts
    - src/server/vision/prompt.ts
    - src/server/vision/run.ts
    - src/server/vision/parse.ts
    - src/types/heic-decode.d.ts
    - vitest.spike.config.ts
    - scripts/spike/vision.spike.ts
    - test/fixtures/vision/spike/cd-spines.claude-opus-5-5.medium.json
  modified:
    - src/server/claude/cli.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "VISION_MAX_TURNS stays 6: the installed CLI (2.1.289) accepted --max-turns on the live call"
  - "buildClaudeEnv strips CLAUDECODE, CLAUDE_EFFORT, CLAUDE_PID and every CLAUDE_CODE_* except CLAUDE_CODE_OAUTH_TOKEN"
  - "LOGIN_HINT exported from cli.ts so parse.ts reuses the same login detection"

requirements-completed: [VIS-01, VIS-02, VIS-04, INGEST-05]

coverage:
  - id: D1
    description: "One real HEIC shelf photo goes through decode, orient, resize, one claude -p call, record, parse and horizontal crops"
    requirement: "VIS-01"
    verification:
      - kind: integration
        ref: "SPIKE_STEPS=one corepack pnpm spike:vision"
        status: pass
  - id: D2
    description: "Every kept spine cropped wider than tall from both the master and the vision source"
    requirement: "VIS-04"
    verification:
      - kind: integration
        ref: "scripts/spike/vision.spike.ts#one"
        status: pass
  - id: D3
    description: "Vision JPEG is a pure resize of the upright image at resizedSize, at most 500 KB"
    requirement: "INGEST-05"
    verification:
      - kind: integration
        ref: "src/server/images/normalize.ts encodeVision size assertion"
        status: pass

duration: 12min
completed: 2026-10-19
---

# Phase 2 Plan 01: Vision Tracer Summary

**A real 4536x8064 iPhone HEIC goes through heic-decode, then sharp, then a 1449x2576 vision JPEG (481 KB, quality 80), then one `claude -p --json-schema` call (Opus 5.5, medium effort). That call returned 61 spines against an estimate of 61, and every crop came out horizontal and aligned, from both crop sources.**

## Task 1: Package legitimacy checkpoint

The owner approved these exact pins: sharp@0.35.5, heic-decode@2.1.0 (with the transitive libheif-js@1.23.5), react-dropzone@20.1.3, @tanstack/react-query@5.104.2 and nuqs@2.10.1. Any `shadcn add` that would install an npm package must halt and be reported. This plan installed only sharp and heic-decode; pnpm resolved no other new package.

## Task 2: Live tracer result

- Image: the source was 4536x8064 and the vision image 1449x2576 (the official algorithm, using the full 4784-token budget). Quality had to step down from 90 to 80 to fit under 500 KB.
- Answer: the model reported the image as 1449x2576, which matches what was sent, so no CLI rescale is visible. It used 4 turns, took 115 s and reported a cost of $0.386.
- Spines: 61 detected against an estimate of 61. All 61 were kept (`cd`/`unsure`) and no box was invalid: 55 are `horizontal` and 6 `upside_down`.
- Crops: all 122 crops (61 from the master, 61 from the vision image) are wider than tall. A visual check of a master crop shows a tight, aligned spine.
- Flag: `--max-turns` is accepted, so `VISION_MAX_TURNS` stays at 6.
- Record: `test/fixtures/vision/spike/cd-spines.claude-opus-5-5.medium.json` is committed. It contains no home path or email, and stderr is empty.
- Git: `fixtures/spike/` (photos) and `fixtures/spike/out/` (vision image, crops, result.json) are both matched by `git check-ignore`.

## Verification

- `SPIKE_STEPS=one corepack pnpm spike:vision`: 1 passed.
- `corepack pnpm typecheck`, `corepack pnpm lint` and `corepack pnpm test` (123 tests) all exit 0.
- Every acceptance-criteria grep returns its expected count, and the JSON-parse check on the record exits 0.

## Commits

- 0dbe790: feat(02-01) vision tracer (Task 2). Task 1 was a checkpoint with no files.

## Deviations from Plan

**1. [Rule 3 - Blocking] Root-pin guard script always failed (`pin-unbound`)**
- **Found during:** Task 2, the first pre-write guard run.
- **Issue:** the orchestrator's substitution also replaced the "unexpanded placeholder" case arm with the real path, so the correct root was rejected.
- **Fix:** I ran a scratchpad copy that differs only in that arm. It passed in the repo and failed outside it. The orchestrator later fixed the shared script, and it passed before the commits.
- **Files modified:** none in the repo.

**2. [Rule 3 - Blocking] Exported `LOGIN_HINT` from `src/server/claude/cli.ts`**
- **Issue:** `classifyVisionRun` needs the same login detection as `testClaude`, but the regex was module-private.
- **Fix:** I exported it, with no behavior change.
- **Commit:** 0dbe790.

**3. [Process] Commit paused on the protected-branch guard**
- `master` was reported as protected. The owner chose to allow default-branch commits, and the orchestrator set `git.allow_default_branch_commits: true`. Task 2 was committed after that.

Minor adjustments, made without changing behavior:
- Vitest 5 has no `describe.sequential` or `{ sequential: true }` option, so the harness uses a plain `describe`. Tests in a single file run in order, and `fileParallelism` is off.
- `normalize.ts` imports the `Metadata` type by name.

## Known Stubs

None.

## Self-Check: PASSED

- All 12 created files and 3 modified files exist.
- Commit 0dbe790 is an ancestor of HEAD.
