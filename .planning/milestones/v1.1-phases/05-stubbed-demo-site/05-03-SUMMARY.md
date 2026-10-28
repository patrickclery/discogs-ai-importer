---
phase: 05-stubbed-demo-site
plan: 03
subsystem: demo-runtime
tags: [demo, seed, read-model, asset-urls, static-export]
status: complete

requires: ["05-01", "05-02"]
provides:
  - "src/lib/asset-urls.ts real image-URL seam (candidateThumbSrc, searchThumbSrc, isAppFileUrl), byte-identical to the old inline strings"
  - "src/demo/asset-urls.ts demo alias target: covers at BASE/demo-assets/covers/<releaseId>.svg, crops only from BASE/demo-assets/"
  - "src/demo/seed.ts: buildSeed(initAt), SEED_PLAN, pristineShelf(state, photoId, visibleAt), recordingFor, allRecordedCandidates, cannedRelease, defaultAccount, SAMPLE_PHOTO_ID"
  - "src/demo/read-model.ts: discogsOf, candidatesOf, importOf, latestAutoSearch, latestImport, searchStateAt, searchInputsOf, folderNameOf; full buildSpinesResponse and buildStatusResponse discogs part"
affects: [05-04, 05-05, 05-06, 05-07]

actuals:
  tokens: 13800
  tasks: 2
  commits: 4
plan_head_before: 0165e6a734f044fd5910848ee80198427fa0fd02
plan_head_after: 1f27d34fda1a187acfc4c7345bde2b2b75241c4c

tech-stack:
  added: []
  patterns:
    - "Client-safe URL seam in src/lib swapped by turbopack.resolveAlias only in the demo config"
    - "Demo read model derives every search/import state lazily from (queuedAt|createdAt, runningAt, readyAt, outcome) at now"

key-files:
  created:
    - src/lib/asset-urls.ts
    - src/demo/asset-urls.ts
    - src/demo/asset-urls.test.ts
    - src/demo/seed.ts
    - src/demo/read-model.test.ts
  modified:
    - src/components/candidate-row.tsx
    - src/components/discogs-search-dialog.tsx
    - src/components/duplicate-import-dialog.tsx
    - next.config.ts
    - src/demo/store.ts
    - src/demo/read-model.ts
    - src/demo/dispatch.test.ts

key-decisions:
  - "SEED_PLAN: imported 09/10/13 (NIN) + 29; already-in-collection 14 (Massive Attack blue lines); not on Discogs 25; failed search 28 (Boards of Canada); failed import 42 (Nirvana Bleach); duplicate pair 29 -> 31"
  - "No release is a candidate of two spines in the recordings, so spine 31 holds 29's imported release (15278222) as a manual candidate"
  - "The failed-search spine keeps its single auto search (outcome failed, unavailable) and its stored candidates"
  - "A demo import's instanceId and importedAt only appear once readyAt passes; while running it reads importing with intentAt = runningAt"

patterns-established:
  - "Seed ids: demo-spine-<key>, demo-search-<key>, demo-cand-<key>-<rank>, demo-import-<key>; pristine copies prefix with the photo id"

requirements-completed: [DEMO-03, DEMO-06, DEMO-07]

coverage:
  - id: S1
    description: "Real image URLs unchanged; demo covers and crops under basePath demo-assets; alias only in the demo config"
    requirement: DEMO-06
    verification:
      - kind: unit
        ref: "src/demo/asset-urls.test.ts"
        status: pass
  - id: S2
    description: "Seed has every review state plus already-in-collection, failed search, failed import and duplicate pair; resets identically"
    requirement: DEMO-07
    verification:
      - kind: unit
        ref: "src/demo/read-model.test.ts"
        status: pass
  - id: S3
    description: "Exported demo Spines page shows cd-spines.heic with crops and covers, no /api requests, no crop/cover 404s"
    requirement: DEMO-03
    verification:
      - kind: e2e
        ref: "node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect \"spines/=cd-spines.heic\""
        status: pass

duration: 12min
completed: 2026-10-23
---

# Phase 5 Plan 03: Seeded Sample Shelf and Image-URL Seam Summary

**The demo now opens on the owner's 61-spine cd-spines.heic shelf with downscaled crops, recorded Discogs matches and generated covers. Every D-09 state is seeded, and every status is computed by the real src/lib rules. The real app's image URLs go through a new seam that returns exactly the old strings.**

## Performance

- **Duration:** about 12 min
- **Tasks:** 2
- **Files:** 12 (5 created, 7 modified)

## Accomplishments

- `src/lib/asset-urls.ts` replaces the three inline URL expressions in candidate-row, discogs-search-dialog and duplicate-import-dialog. Tests pin the exact real strings. `next.config.ts` aliases the module to `src/demo/asset-urls.ts` only in the demo branch.
- The seeded counts at load are 44 pending, 1 matched, 4 imported, 9 not found, 1 not on Discogs and 2 failed. The status endpoint reports failedSpines 1, imports.failed 1 and backlog 0, and discogsActive is false.
- `pristineShelf` adds a 61-spine copy whose searches go queued, then searching, then done/no_match from the recordings, after which polling stops (Pitfall 8 test).
- In the demo export, smoke made 193 requests that returned 200, covering crops and covers. The only 404s were the existing `/upload/` and `/settings/` prefetch warnings. No requests went to `/api`. The marker `cd-spines.heic` is rendered in the DOM.

## Task Commits

1. **Task 1: Image-URL seam:** `60686ee` (test, RED), `479f3d7` (feat, GREEN)
2. **Task 2: Seed and read model:** `80ee9de` (test, RED), `1f27d34` (feat, GREEN)

## TDD Gate Compliance

- Task 1 RED `60686ee`: the test file failed to import `@/lib/asset-urls`. GREEN `479f3d7`: 7 of 7 pass, and the component tests pass unchanged.
- Task 2 RED `80ee9de`: the test file failed to import `./seed`. GREEN `1f27d34`: 25 of 25 read-model tests pass, and src/demo passes 65 of 65.
- No refactor commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dispatch.test.ts asserted the 05-01 empty store**
- **Found during:** Task 2
- **Issue:** Two tests expected `/api/spines` and `/api/photos` to be empty. Seeding the store made that assumption wrong.
- **Fix:** Both tests now assert the seeded shelf: 61 spines, `cd-spines.heic` and `demo-photo-1`.
- **Files modified:** src/demo/dispatch.test.ts
- **Commit:** 1f27d34

**2. [Plan adjustment] Duplicate pair uses a manual candidate**
- **Found during:** Task 2
- **Issue:** The recordings contain no release that is a candidate of two spines. Spines 29 and 31 share no release.
- **Fix:** Used the plan's fallback. Spine 31 holds 29's imported release (15278222) as a `manual` candidate.
- **Commit:** 1f27d34

**Total deviations:** 2. **Impact:** no scope change.

## Issues Encountered

- Under heavy machine load (load average around 20), full-suite runs sometimes failed timing tests in `src/server/claude/cli.test.ts` and `src/server/scan/match.test.ts`. Both files pass on their own, and the final full run passed 1671 of 1671. No server code was touched.

## Known Stubs

None. The demo route groups for review, imports, uploads and account are still empty by design, and plans 05-04 to 05-07 fill them.

## Threat Flags

None. T-05-14, T-05-15 and T-05-16 are mitigated and tested as planned.

## Next Phase Readiness

Plans 05-04 to 05-06 can mutate the seeded state. They can use `recordingFor`, `allRecordedCandidates`, `cannedRelease` and `pristineShelf`, plus the read-model helpers `candidatesOf`, `importOf`, `latestAutoSearch` and `searchInputsOf`. The DemoState shapes are unchanged.

## Self-Check: PASSED
