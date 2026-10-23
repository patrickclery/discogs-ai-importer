---
phase: 05-stubbed-demo-site
plan: 02
subsystem: demo-fixtures
tags: [demo, fixtures, sharp, discogs, svg, privacy]
status: complete

requires: []
provides:
  - "demo/fixtures/shelf.json: 61-spine sample shelf (Shelf shape) from the saved Opus/high read"
  - "demo/assets/vision.jpg (1449x2576), thumb.webp, crops/00..60.webp (885,912 bytes total)"
  - "demo/fixtures/discogs.json: recorded text-only cascade candidates for all 61 spines + canned release 5822653"
  - "demo/assets/covers/<releaseId>.svg: 264 generated covers"
  - "src/demo/cover-svg.ts coverSvg({releaseId, title})"
  - "vitest.demo.config.ts and pnpm demo:assets / demo:record / demo:covers / demo:build / demo:smoke"
affects: [05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09]

actuals:
  tokens: 22000
  tasks: 2
  commits: 4
plan_head_before: c52ddfd5e15ca7162241c19bf9911d2e017f9174
plan_head_after: bca4c0fedbde9513d3c7efb5705b1957be816619

tech-stack:
  added: []
  patterns:
    - "Developer-run fixture scripts are vitest files under scripts/demo/*.demo.ts run by vitest.demo.config.ts (setupFiles [] so the real secrets.json is visible)"
    - "Live recorder gated by describe.skipIf(DEMO_RECORD !== '1'), resumable, atomic writes"

key-files:
  created:
    - vitest.demo.config.ts
    - scripts/demo/build-assets.demo.ts
    - scripts/demo/record-discogs.demo.ts
    - scripts/demo/build-covers.demo.ts
    - src/demo/cover-svg.ts
    - src/demo/cover-svg.test.ts
    - src/demo/fixtures.test.ts
    - demo/fixtures/shelf.json
    - demo/fixtures/discogs.json
    - demo/assets/vision.jpg
    - demo/assets/thumb.webp
    - demo/assets/crops/
    - demo/assets/covers/
  modified:
    - package.json
    - biome.json

key-decisions:
  - "Crops re-encoded as webp q80 after the 1200 px downscale: 885,912 bytes total, about half the 1,650,000 budget"
  - "Covers carry a <title> with the full release title: Biome lints SVGs (a11y/noSvgWithoutTitle), and it also gives the tile alt text"
  - "Recorder leak self-check reads every secrets.json value through updateSecretsFile with a mutator that returns null (read-only); a file holding a secret value is deleted, other failures keep the file for inspection"

patterns-established:
  - "Fixture privacy is re-checked by src/demo/fixtures.test.ts on every pnpm test: no HEIC, no IMG_35, no metadata, no http/thumb/uri, exact cover set"

requirements-completed: [DEMO-04, DEMO-05, DEMO-06]

coverage:
  - id: F1
    description: "Sample shelf: 61 spines equal to the saved read, vision 1449x2576, crops match shelf.json, <=1200 px, under budget, no metadata"
    requirement: DEMO-04
    verification:
      - kind: unit
        ref: "src/demo/fixtures.test.ts (sample shelf fixture)"
        status: pass
  - id: F2
    description: "Recorded Discogs candidates: every shelf key, text-only keys, no URL/thumb/uri, canned release"
    requirement: DEMO-05
    verification:
      - kind: unit
        ref: "src/demo/fixtures.test.ts (recorded Discogs candidates)"
        status: pass
      - kind: integration
        ref: "DEMO_RECORD=1 vitest run --config vitest.demo.config.ts scripts/demo/record-discogs.demo.ts (leak self-check passed)"
        status: pass
  - id: F3
    description: "Generated covers: one per release id, escaped, xmlns the only URL"
    requirement: DEMO-06
    verification:
      - kind: unit
        ref: "src/demo/cover-svg.test.ts; src/demo/fixtures.test.ts (generated covers)"
        status: pass

duration: 9min
completed: 2026-10-23
---

# Phase 5 Plan 02: Demo Fixtures Summary

**The demo's sample shelf (61 spines, the exact 1449x2576 vision JPEG, 61 downscaled crops at 886 KB) was built by the real pipeline from cd-spines.heic. Text-only Discogs candidates were recorded once for every spine (51 matched, 10 no match) plus a canned release, and 264 generated SVG covers were written. All of it is guarded by privacy and integrity tests.**

## Performance

- **Duration:** about 9 min
- **Tasks:** 2
- **Files:** 342 created (61 crops, 264 covers), 2 modified

## Accomplishments

- `build-assets.demo.ts` opens `fixtures/spike/cd-spines.heic` by its exact path and runs `normalizeImage`. It then applies the `cropDetections` loop from scan-photo.ts. The vision JPEG matches the saved read byte for byte in size (481,377 bytes).
- `record-discogs.demo.ts` made the one-time live recording in 77 s through `discogsFetch` and its gate. It sent only GET `/database/search` and one GET `/releases/5822653`, and the secrets/URL self-check passed.
- `coverSvg` generates a deterministic hsl tile with the artist in bold and the title wrapped at 18 characters to 3 lines, ending in "…" when cut. All text is XML-escaped.
- `pnpm test` now covers the fixtures: 18 new tests. The suite has 91 files and 1642 tests, all passing. `tsc --noEmit` and `biome check` are clean.

## Task Commits

1. **Task 1: Sample shelf assets:** `5b1b6c4` (test, RED), `d0131db` (feat, GREEN)
2. **Task 2: Discogs recording and covers:** `7776d16` (test, RED), `bca4c0f` (feat, GREEN)

## TDD Gate Compliance

- Task 1 RED `5b1b6c4`: all 5 shelf/privacy tests failed because there were no fixtures. GREEN `d0131db`: 5 of 5 pass.
- Task 2 RED `7776d16`: 5 discogs/cover fixture tests failed and cover-svg.test.ts failed to import. GREEN `bca4c0f`: 18 of 18 pass. No refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a `<title>` to the generated covers**
- **Found during:** Task 2
- **Issue:** `biome check` lints the committed SVGs and failed all 264 covers on `a11y/noSvgWithoutTitle`.
- **Fix:** coverSvg emits `<title>` with the escaped full release title (or "Untitled"). The plan's checks still hold: xmlns is the only URL and there is no script or href.
- **Files modified:** src/demo/cover-svg.ts, demo/assets/covers/
- **Commit:** bca4c0f

**Total deviations:** 1 auto-fixed. **Impact:** no scope change.

## Issues Encountered

- One full-suite run showed 1 failed test in an unrelated file. A rerun passed 1642 of 1642, so the failure did not reproduce. It looks like a transient flake. The plan touched no code outside the demo.

## Known Stubs

None.

## Threat Flags

None. The only new surface is the developer-run recorder, which is already covered by T-05-09 and T-05-10.

## Next Phase Readiness

05-03 can seed the demo store from `demo/fixtures/shelf.json` and `discogs.json`, using the names in the plan's Shelf and Recordings shapes. `build-demo` already copies `demo/assets`, and the verify-export allowlist matches `vision.jpg`, `thumb.webp`, `crops/NN.webp` and `covers/<id>.svg`.

## Self-Check: PASSED
