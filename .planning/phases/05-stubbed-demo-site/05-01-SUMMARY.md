---
phase: 05-stubbed-demo-site
plan: 01
subsystem: infra
tags: [nextjs, static-export, github-pages, fetch-shim, demo]
status: complete

requires: []
provides:
  - "NEXT_PUBLIC_DEMO=1 build switch in next.config.ts (output export, basePath /discogs-ai-importer, pageExtensions demo.*)"
  - "src/demo runtime: store (DemoState contract), read model, dispatcher with five route groups, fetch shim, DemoRoot banner, useDemoSnapshot"
  - "Demo layout and /spines page rendering the real SpinesView"
  - "scripts/demo/build-demo.ts (scratch-copy build, CI-only --in-place), verify-export.ts (rules a-h), smoke.ts (headless Chrome)"
affects: [05-02, 05-03, 05-04, 05-05, 05-06, 05-07, 05-08, 05-09]

actuals:
  tokens: 18000
  tasks: 2
  commits: 3
plan_head_before: fbee2e25e2ae10ce75a670450fe8f769e9c28c76
plan_head_after: 6f9f005b93ae1518cf05d043ec1dd811d7d70a65

tech-stack:
  added: []
  patterns:
    - "Demo routes are *.demo.tsx siblings; the real build never sees them, the demo build sees only them"
    - "Demo route groups export `routes: DemoRoute[]`; the dispatcher aggregates them, so later plans add handlers without touching routes.ts"
    - "Demo pages render data only after mount via useDemoSnapshot (null server snapshot) and show the real loading skeleton first"

key-files:
  created:
    - src/demo/store.ts
    - src/demo/read-model.ts
    - src/demo/routes.ts
    - src/demo/routes/read.ts
    - src/demo/fetch-shim.ts
    - src/demo/demo-root.tsx
    - src/demo/hooks.ts
    - src/app/layout.demo.tsx
    - src/app/spines/page.demo.tsx
    - scripts/demo/build-demo.ts
    - scripts/demo/verify-export.ts
    - scripts/demo/smoke.ts
    - src/demo/next-config.test.ts
    - src/demo/boundaries.test.ts
    - src/demo/dispatch.test.ts
  modified:
    - next.config.ts

key-decisions:
  - "Demo /api/status reports a simulated running worker (bootId 'demo') instead of worker null, which the header would show as 'Worker stopped'"
  - "Model labels are a small local map in the demo read model because VISION_MODELS lives in server-only src/server/settings.ts"
  - "routes.ts exposes matchRouteIn(table, method, path) so :param decoding is testable before any parameterised demo route exists"
  - "verify-export rule d needed no narrowing: a clean Next 16.4.2 export contains none of the forbidden strings or action ids"

patterns-established:
  - "Demo build: node scripts/demo/build-demo.ts → DEMO_OUT=<scratch>/out-<pid>-<ts>; smoke reads <scratch>/LATEST_OUT"
  - "Every demo build is gated by verifyExport (secrets scan uses the original checkout's secrets.json)"

requirements-completed: [DEMO-01, DEMO-02, DEMO-03, DEMO-09]

coverage:
  - id: D1
    description: "Demo build switch: real config unchanged, demo config exports under basePath"
    requirement: DEMO-01
    verification:
      - kind: unit
        ref: "src/demo/next-config.test.ts"
        status: pass
  - id: D2
    description: "Scratch-copy static export of /discogs-ai-importer/spines/ with banner and 'No spines yet', zero /api requests in headless Chrome"
    requirement: DEMO-03
    verification:
      - kind: e2e
        ref: "node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect \"spines/=No spines yet\""
        status: pass
  - id: D3
    description: "Export checks: no server code, no secrets, basePath URLs, asset allowlist, no family photos"
    requirement: DEMO-02
    verification:
      - kind: integration
        ref: "node scripts/demo/build-demo.ts (verify-export PASS line); node scripts/demo/verify-export.ts --out /nonexistent exits 1"
        status: pass
  - id: D4
    description: "Import boundaries and no persistence in the demo runtime"
    requirement: DEMO-02
    verification:
      - kind: unit
        ref: "src/demo/boundaries.test.ts"
        status: pass
  - id: D5
    description: "Dispatcher 501 fallback, decoded params, File/Blob bodies never read"
    requirement: DEMO-03
    verification:
      - kind: unit
        ref: "src/demo/dispatch.test.ts"
        status: pass
  - id: D6
    description: "Banner on every page"
    requirement: DEMO-09
    verification:
      - kind: e2e
        ref: "scripts/demo/smoke.ts (fails a page whose DOM lacks the banner)"
        status: pass

duration: 7min
completed: 2026-10-23
---

# Phase 5 Plan 01: Demo Tracer and Export Checks Summary

**A demo build (`NEXT_PUBLIC_DEMO=1`) now statically exports the real Spines page under `/discogs-ai-importer/`, answers every `/api` call in the browser through a fetch shim backed by an in-memory store, builds only in a scratch copy, and is checked for server code, secrets and family photos on every build.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-23T09:41:55Z
- **Completed:** 2026-10-23T09:49:00Z
- **Tasks:** 2
- **Files:** 20 (19 created, 1 modified)

## Accomplishments

- `next.config.ts` has a demo branch. Without the switch the real config is unchanged: no output, no basePath, the same `distDir` rule and the same `proxyClientMaxBodySize`.
- The `src/demo` runtime implements the full DemoState contract from the plan. Later plans can fill `routes/{review,imports,uploads,account}.ts` without editing the dispatcher.
- Scratch build: about 14 s for the first run, which includes the one-time node_modules copy. The owner's `.next/BUILD_ID` hash was unchanged after every build. `--in-place` exits 1 unless `CI=true`.
- Headless Chrome smoke: `/spines/` shows the banner and "No spines yet". Zero requests went to `/api/` or outside the basePath. The only 404s are `/upload/` and `/settings/` prefetches, which are warnings until later plans add those pages.

## Task Commits

1. **Task 1: End-to-end tracer** - `fec643b` (feat)
2. **Task 2: Harden the export** - `b246bcc` (test, RED), `6f9f005` (feat, GREEN)

## TDD Gate Compliance

RED `b246bcc`: 2 of 18 tests failed because `matchRouteIn` was not a function. The config and boundary tests already passed against the Task 1 code. GREEN `6f9f005`: 18 of 18 pass. No refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Simulated worker in /api/status**
- **Found during:** Task 1
- **Issue:** `worker: null` makes the header show a red "Worker stopped" on every demo page.
- **Fix:** `buildStatusResponse` returns `{bootId:'demo', startedAt: initAt, starts:1, pid:0}`.
- **Files modified:** src/demo/read-model.ts
- **Commit:** fec643b

**2. [Rule 3 - Blocking] `matchRouteIn` added to make the `:id` decoding test possible**
- **Found during:** Task 2
- **Issue:** No demo route in this plan has a `:param`, so the decoding rule could not be tested through `matchRoute`.
- **Fix:** Added `matchRouteIn(table, method, path)`. `matchRoute` delegates to it with the real table.
- **Files modified:** src/demo/routes.ts
- **Commit:** 6f9f005

**Total deviations:** 2 auto-fixed. **Impact:** no scope change.

## Issues Encountered

None.

## Known Stubs

- `src/demo/read-model.ts` `toSpineDto`: `discogs: null` and `import: null` on every spine. This is intentional per the plan; plan 05-03 fills both.
- `src/demo/routes/{review,imports,uploads,account}.ts`: empty `routes` arrays. This is intentional; plans 05-04, 05-05 and 05-07 fill them.

## Threat Flags

None. No surface beyond the plan's threat model.

## Next Phase Readiness

The skeleton is ready for fixtures (05-02/05-03) and behaviours (05-04 and later). `build-demo` copies `demo/assets` to `out/demo-assets` once that folder exists, and verify-export rule f already enforces the asset allowlist and the crop budget.

## Self-Check: PASSED
