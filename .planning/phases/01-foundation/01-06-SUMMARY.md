---
phase: 01-foundation
plan: 06
subsystem: infra
tags: [proxy, security, dns-rebinding, csrf, vitest, mise, docs]

requires:
  - phase: 01-01
    provides: queue.ts, db/client.ts (getDb/runMigrations/closeDb), scripts/lib/server.ts harness, POST /api/dev/jobs, GET /api/status
provides:
  - src/proxy.ts Host/Origin loopback guard (hostname-only, port-agnostic)
  - scripts/verify-guard.ts e2e proof of every 403/pass case
  - Vitest harness (server-only stub, @ alias, node env, forks pool) and useTempDataDir()
  - src/server/jobs/queue.test.ts happy-path tests (Plan 01-02 extends)
  - mise.toml / .nvmrc pins, README.md owner docs, tracked .env.example
affects: [01-02, 01-03, 01-04, phase-2]

tech-stack:
  added: []
  patterns:
    - "useTempDataDir() at the top of a describe block: fresh migrated DATA_DIR per test"
    - "Queue tests inject `now` instead of sleeping"
    - "Proxy is self-contained (no src/server imports); matcher excludes only _next/static, _next/image, favicon.ico"

key-files:
  created:
    - src/proxy.ts
    - scripts/verify-guard.ts
    - vitest.config.ts
    - test/stubs/server-only.ts
    - test/helpers/temp-data-dir.ts
    - src/server/jobs/queue.test.ts
    - mise.toml
    - .nvmrc
    - README.md
    - .env.example
  modified: []

key-decisions:
  - "Proxy treats a malformed or opaque (\"null\") Origin on non-GET/HEAD as foreign (403); a missing Origin passes"
  - "useTempDataDir() returns a getter () => string that throws outside a test"
  - "mise pnpm@12.14.0 install fails (aqua asset name mismatch); corepack remains the pnpm path, documented in README"

requirements-completed: [FOUND-01, FOUND-02, FOUND-04]

coverage:
  - id: G1
    description: "Foreign Host hostnames and foreign/malformed-Origin mutations get 403; same-host, localhost:PORT and Origin-less requests pass; GET ignores Origin"
    requirement: FOUND-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-guard.ts (steps a-e)"
        status: pass
    human_judgment: false
  - id: G2
    description: "Vitest runs with server-only stubbed and per-test migrated temp DATA_DIR; queue round trip passes"
    requirement: FOUND-04
    verification:
      - kind: unit
        ref: "corepack pnpm test (6 tests, src/server/jobs/queue.test.ts)"
        status: pass
    human_judgment: false
  - id: G3
    description: "Pins (node 24, pnpm 12.14.0, .nvmrc 24), README launch/copy docs, .env.example names without values"
    requirement: FOUND-02
    verification:
      - kind: other
        ref: "Task 3 pin and .env.example checks; README acceptance greps"
        status: pass
    human_judgment: false

actuals:
  tokens: 6000
  tasks: 3
  commits: 4
plan_head_before: 010a4038249a8df490be0c6438ab9ba3f59fe381
plan_head_after: 27110d4bc6dd0899071806dcad366239d0163a28

duration: 5min
completed: 2026-10-19
status: complete
---

# Phase 1 Plan 06: Loopback guard, Vitest harness and owner docs Summary

**`src/proxy.ts` refuses foreign Host hostnames and cross-site mutations (proven by `verify-guard`), Vitest runs every test on its own migrated temp data folder, and the README/pins/.env.example tell the owner how to launch, configure and copy the app.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-10-19
- **Tasks:** 3/3
- **Files:** 10 created

## Accomplishments

- Host/Origin guard on every route except static assets; hostname-only comparison keeps PORT overrides working.
- `verify-guard` proves: default Host and `localhost:PORT` -> 200; `evil.test` and `127.0.0.1.evil.test` -> 403; POST with `http://evil.test` or `not a url` Origin -> 403; POST with `http://localhost:PORT` Origin or no Origin -> 201; GET with foreign Origin -> 200.
- Vitest harness: `server-only` aliased to an empty stub, `@` -> `src`, node environment, forks pool, `src/**/*.test.ts`.
- `useTempDataDir()` and 6 queue tests (round trip, empty claim, exactly-once completion, zero-filled counts, isolation).
- `mise.toml` (node 24, pnpm 12.14.0), `.nvmrc` (24), README, `.env.example` (7 names, no values, tracked).

## Task Commits

1. **Task 1: Host/Origin guard** — `9dc8232`
2. **Task 2: Vitest harness + queue tests** — `c60e429`
3. **Task 3: Pins, README, .env.example** — `27110d4`

Measured `commits: 4` includes `15f2ab5` ("docs: scope to CDs only"), an owner commit that landed on master between Tasks 1 and 2; it is not part of this plan.

## Verification

- `node scripts/verify-guard.ts` -> `verify-guard OK`
- `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts` -> `verify-skeleton OK` (no regression from the proxy)
- `corepack pnpm test` -> 6 passed (also passes under Node 24.22.0 via `mise exec`)
- `corepack pnpm lint`, `corepack pnpm typecheck` -> clean
- Task 3 pin and `.env.example` checks -> pass; README VACUUM INTO snippet tested against a temp WAL database

## Deviations from Plan

None in code. Notes:

- **mise install (best effort, per plan):** `mise install` installed Node 24.22.0 but failed on pnpm 12.14.0 (`aqua:pnpm/pnpm: no asset found: pnpm-linux-x64`; pnpm 12 ships `.tar.gz` assets). Not a blocker: Node 22.22.1 satisfies engines and `corepack pnpm` resolves 12.14.0. The README documents `corepack enable pnpm` as the fallback.
- Vitest 5 prints a Vite warning that `vitest.config.ts` uses ESM syntax in a file loaded as CommonJS (future `configLoader: 'native'` default). Harmless today; the plan fixes the `.ts` filename, so it was left as is.

## Known Stubs

None. README describes the Claude CLI vision path and secrets.json as later-phase behavior (Plans 01-03/01-04, Phase 2).

## Self-Check: PASSED

- All 10 created files exist.
- Commits 9dc8232, c60e429, 27110d4 are ancestors of HEAD.
