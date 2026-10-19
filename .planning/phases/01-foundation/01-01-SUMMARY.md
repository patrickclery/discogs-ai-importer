---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [nextjs, sqlite, better-sqlite3, drizzle, jobs, worker, biome, pnpm]

requires: []
provides:
  - Next 16.4.2 app scaffold, 127.0.0.1-only dev/start/serve scripts, exact-pinned deps + lockfile
  - DATA_DIR authority (storage/paths.ts) with D-04 subfolders
  - WAL SQLite singleton on globalThis, drizzle init migration (jobs, settings, worker_lease) applied at boot
  - Durable jobs queue (dedupe enqueue, atomic UPDATE...RETURNING claim, complete, failJob, counts)
  - globalThis worker singleton, one loop per lane, noop handler
  - GET /api/status and dev-gated GET/POST /api/dev/jobs
  - scripts/lib/server.ts e2e harness and scripts/verify-skeleton.ts tracer proof
affects: [01-02, 01-03, 01-04, 01-05, 01-06, phase-2]

actuals:
  tokens: 10900
  tasks: 3
  commits: 3
plan_head_before: 00bf5f735f3611b40e7477cece004016d06cb7ac
plan_head_after: b1a98021b0eba44e9e27224395680fb946d7d33e

tech-stack:
  added: [next@16.4.2, react@19.3.1, react-dom@19.3.1, better-sqlite3@13.0.3, drizzle-orm@0.45.4, ulid@3.0.2, server-only@0.0.1, zod@4.6.7, next-themes@0.4.6, typescript@6.0.3, drizzle-kit@0.31.11, vitest@5.0.5, "@biomejs/biome@2.5.15", tailwindcss@4.3.3, "@tailwindcss/turbopack@4.3.3", "@types/better-sqlite3@9.6.0", "@types/node@24.19.2", "@types/react@19.3.0", "@types/react-dom@19.3.0"]
  patterns:
    - "globalThis singletons for DB handle and worker (module graphs are duplicated)"
    - "instrumentation.ts register() gated on NEXT_RUNTIME === 'nodejs', dynamic import of server/boot"
    - "await connection() in every route/loader that touches SQLite; no DB at build time"
    - "/* turbopackIgnore: true */ on every cwd/DATA_DIR-derived path"
    - "single-quoted SQL literals (better-sqlite3 DQS=0)"

key-files:
  created:
    - package.json
    - pnpm-lock.yaml
    - pnpm-workspace.yaml
    - next.config.ts
    - biome.json
    - tsconfig.json
    - drizzle.config.ts
    - drizzle/0000_init.sql
    - src/instrumentation.ts
    - src/server/boot.ts
    - src/server/config.ts
    - src/server/ids.ts
    - src/server/storage/paths.ts
    - src/server/db/schema.ts
    - src/server/db/client.ts
    - src/server/jobs/types.ts
    - src/server/jobs/queue.ts
    - src/server/jobs/worker.ts
    - src/server/jobs/handlers/index.ts
    - src/server/jobs/handlers/noop.ts
    - src/lib/status-types.ts
    - src/app/api/status/route.ts
    - src/app/api/dev/jobs/route.ts
    - scripts/lib/server.ts
    - scripts/verify-skeleton.ts
    - scripts/package.json
  modified:
    - .gitignore

key-decisions:
  - "D-06 storage: sqlite-drizzle (auto-selected, Task 1) — better-sqlite3 13.0.3 + drizzle-orm 0.45.4 / drizzle-kit 0.31.11, WAL, migrate() at boot"
  - "Package list approved by the owner (Task 2); installed exactly, no unlisted direct deps"
  - "server-only kept in boot/db/paths/jobs; works inside the instrumentation graph (A-05 fallback not needed)"
  - "next.config.ts agentRules: false so next dev never re-creates AGENTS.md (instructions live in .claude/CLAUDE.md)"
  - "typecheck = next typegen && tsc --noEmit (scaffold layout uses generated LayoutProps)"

patterns-established:
  - "Each verify script step is a named exported function; runMain prints '<name> OK' last"
  - "Route-level zod validates handler payloads too, so bad job input is a 400, not a failed job"

requirements-completed: [FOUND-01, FOUND-02, FOUND-04]

coverage:
  - id: D1
    description: "pnpm dev/start/serve bind 127.0.0.1 only; LAN connection refused"
    requirement: FOUND-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-skeleton.ts (step d)"
        status: pass
    human_judgment: false
  - id: D2
    description: "First boot creates DATA_DIR layout and a migrated WAL app.db; build never opens the DB"
    requirement: FOUND-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-skeleton.ts (steps a, c)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Test job round-trips dev route -> SQLite -> worker -> /api/status; dev route 404 in production"
    requirement: FOUND-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-skeleton.ts (steps f, g, h)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-18
status: complete
---

# Phase 1 Plan 01: Walking Skeleton (server tracer) Summary

**Next 16 app on 127.0.0.1 that migrates a portable WAL SQLite DB at boot and runs a test job through a globalThis worker, proven end to end by `verify-skeleton`.**

## Performance

- **Duration:** ~6 min (this continuation; Tasks 1-2 were checkpoints)
- **Completed:** 2026-10-18
- **Tasks:** 3/3 (Task 1 decision, Task 2 legitimacy gate, Task 3 tracer)
- **Files:** 33 changed

## Accomplishments

- Scaffold via create-next-app 16.4.2 into a temp dir, moved to root; template junk, AGENTS.md, README and SVGs removed; `/` renders an h1.
- Exact-pinned install of the approved list; lockfile committed; only esbuild may run build scripts.
- Boot hook: ensureDataDirs -> runMigrations -> startWorker; DB and worker survive duplicated module graphs via globalThis.
- Jobs queue with dedupe, atomic claim, exactly-once completion, terminal failure, zero-filled counts; handler timeout via AbortController.
- `/api/status` and dev-gated `/api/dev/jobs` (zod-validated, 4096-byte payload cap).
- e2e harness (`scripts/lib/server.ts`) and tracer proof (`scripts/verify-skeleton.ts`, steps a-i).

## Task Commits

1. **Task 1: D-06 storage decision** — sqlite-drizzle (no commit)
2. **Task 2: Package legitimacy** — approved by owner (no commit)
3. **Task 3: Tracer** — `604e2b0` (gitignore, D-11), `caf6969` (scaffold + install), `b1a9802` (server tracer)

## Decisions

- D-06: **sqlite-drizzle** selected.
- See key-decisions in frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Biome rewrote `.planning/research/.cache/*.json`**
- **Found during:** Task 3 step 3 (`biome check --write`)
- **Fix:** Reverted those three files; added `!.planning`, `!.claude`, `!drizzle` to biome `files.includes`; ran `biome migrate` (`recommended` -> `preset`).
- **Commit:** caf6969

**2. [Rule 3 - Blocking] `tsc --noEmit` failed on `LayoutProps` before any build**
- **Fix:** `typecheck` script is `next typegen && tsc --noEmit`.
- **Commit:** caf6969

**3. [Rule 1 - Bug] Turbopack "tracing of the whole project" warning from `ensureDataDirs`**
- **Fix:** `/* turbopackIgnore: true */` on the mkdir path join. Build is now warning-free.
- **Commit:** b1a9802

**4. [Rule 3 - Blocking] `next dev` re-created AGENTS.md when run by an agent**
- **Fix:** `agentRules: false` in next.config.ts; AGENTS.md deleted.
- **Commit:** caf6969

**5. [Rule 2 - Correctness] Noop payload validated at the route**
- **Issue:** Step (g) requires `{ ms: 'x' }` to return 400; the generic body schema accepts any object.
- **Fix:** Route also parses the noop payload schema; worker enforces `handler.timeoutMs` via AbortController.
- **Commit:** b1a9802

**6. [Rule 3] `scripts/package.json` (`"type": "module"`)** silences Node's MODULE_TYPELESS warning for the `.ts` scripts.

**Process note:** commits landed directly on `master` (gsd-tools reports it protected) because the orchestrator ran sequential mode with `branching_strategy: none`.

## Verification

- `corepack pnpm lint` — 0 errors
- `corepack pnpm typecheck` — 0 `error TS`
- `node scripts/verify-skeleton.ts` — `verify-skeleton OK`, no SKIP lines (ss and LAN IPv4 present)
- `next build` — 0 warnings; `/api/*` dynamic, no data dir created
- Manual `next dev` round trip: worker starts 1, job succeeded
- All plan acceptance greps pass; `.gitignore` committed before package.json

## Known Stubs

None. `/` is an intentional placeholder h1, replaced by Plan 01-05.

## Open Items

- A-03 (unresolved prohibition): Next telemetry stays default for `pnpm dev`/`pnpm start`; only verify scripts set `NEXT_TELEMETRY_DISABLED=1`. Owner decision.
- Scaffold `layout.tsx` uses `next/font/google` (Geist), which fetches fonts from Google at build time; relevant to A-03. Plan 01-05 replaces the layout.
- `scripts/lib/server.ts` and `scripts/verify-skeleton.ts` were reformatted by Biome after creation (formatting only).

## Self-Check: PASSED
