---
phase: 05-stubbed-demo-site
plan: 06
subsystem: demo-runtime
tags: [demo, settings, server-actions, static-export, refactor]
status: complete

requires: ["05-03"]
provides:
  - "src/lib/claude-types.ts: client-safe VISION_MODELS, VisionModelId, isClaudeReady, ClaudeAuthState, ClaudeCliStatus, TestResult (re-exported from src/server/claude/cli.ts and src/server/settings.ts)"
  - "src/demo/settings-actions.ts: alias target for '@/app/settings/actions' (ActionState, saveDiscogsCredentials, clearSecretAction, saveVisionModel, saveCollectionFolder, testClaudeAction)"
  - "next.config.ts demo branch: turbopack.resolveAlias '@/app/settings/actions' -> ./src/demo/settings-actions.ts"
affects: [05-07]

actuals:
  tokens: 5400
  tasks: 2
  commits: 3
plan_head_before: 3e63bafd4597bed4e1fcfbfa36e626bf412375ba
plan_head_after: 9e18e86c8592d0bc4148b88cef02a4819edf097f

tech-stack:
  added: []
  patterns:
    - "Client-safe types in src/lib, re-exported from the server modules so no server import changes"
    - "Demo alias target re-declares the real type locally (not imported from the aliased path, which points back at itself in the demo build); a test pins type equality"

key-files:
  created:
    - src/lib/claude-types.ts
    - src/demo/settings-actions.ts
    - src/demo/settings-actions.test.ts
  modified:
    - src/server/claude/cli.ts
    - src/server/settings.ts
    - src/components/claude-cli-card.tsx
    - src/components/test-claude-button.tsx
    - next.config.ts
    - src/demo/next-config.test.ts
    - src/demo/asset-urls.test.ts

key-decisions:
  - "Demo credentials are stored as the real mask() output ('••••' for <=8 chars, else '…' + last 4); saving disconnects when the tail changes, clearing always disconnects (and clears pendingConnectAt)"
  - "Demo actions export exactly the five real functions (delays are module-private) so `typeof RealActions` is assignable from the demo namespace"
  - "Delays: 250 ms for saves/clears, 1200 ms for Test Claude; Test Claude returns the real success message for the stored model"

requirements-completed: [DEMO-02, DEMO-08]

coverage:
  - id: S1
    description: "Claude types moved to src/lib with re-exports; the real app's full suite, tsc and biome pass unchanged"
    requirement: DEMO-02
    verification:
      - kind: unit
        ref: "node_modules/.bin/vitest run (97 files, 1732 tests)"
        status: pass
  - id: S2
    description: "Demo Settings actions answer like the real ones, mutate only page memory, keep only masked credential tails; demo-only alias"
    requirement: DEMO-08
    verification:
      - kind: unit
        ref: "src/demo/settings-actions.test.ts, src/demo/next-config.test.ts, src/demo/boundaries.test.ts"
        status: pass

duration: 4min
completed: 2026-10-23
---

# Phase 5 Plan 06: Demo Settings Plumbing Summary

**The Claude model list, status types and readiness check now live in client-safe `src/lib/claude-types.ts`, and the demo build swaps the Settings server actions for an in-memory module that answers like the real ones and keeps typed credentials only as masked tails.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Move Claude status types and model list to a client-safe module | 7e79cf2 |
| 2 (RED) | Failing demo settings-actions and alias checks | 8afa192 |
| 2 (GREEN) | Simulated Settings actions behind a demo-only alias | 9e18e86 |

## TDD Gate Compliance

RED 8afa192 failed on the missing module and the missing alias; GREEN 9e18e86 passes. No refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] asset-urls test pinned the whole alias map**
- **Found during:** Task 2
- **Issue:** `src/demo/asset-urls.test.ts` used `toEqual` on `resolveAlias`, so adding the settings alias broke it.
- **Fix:** It now uses `toMatchObject` for its own entry. The real-config `toBeUndefined` check stays.
- **Files modified:** src/demo/asset-urls.test.ts
- **Commit:** 9e18e86

**2. [Rule 1 - Bug] ActionState not imported from the aliased path**
- **Issue:** In the demo build, `'@/app/settings/actions'` resolves to the demo module itself, so importing the type from it would be self-referential.
- **Fix:** The real shape is declared locally, and `expectTypeOf` plus a `typeof RealActions` assignment in the test check that the two match.
- **Commit:** 9e18e86

The plan's "update next-config.test only if pinned" note: next-config.test.ts did not pin the map. Two assertions were added there anyway: the demo config has the settings alias, and the real config has no `resolveAlias`.

## Self-Check: PASSED

- FOUND: src/lib/claude-types.ts, src/demo/settings-actions.ts, src/demo/settings-actions.test.ts
- FOUND: 7e79cf2, 8afa192, 9e18e86
- vitest (full) 1732/1732, tsc --noEmit, biome check: pass
