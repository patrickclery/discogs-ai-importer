# Walking Skeleton — Discogs AI Importer

**Phase:** 1
**Generated:** 2026-10-18

## Capability Proven End-to-End

The owner runs `pnpm dev`, opens http://127.0.0.1:3000/settings, clicks **Queue test job**, and the header status shows the job run to completion by the single background worker, with the job stored in `data/app.db` (Plan 01-01 tracer, proven by `node scripts/verify-skeleton.ts`).

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.4.2 App Router, React 19.3.1, TypeScript 6.0.3 (not 7), Turbopack, Tailwind 4 + shadcn/ui (new-york, neutral), Biome, Vitest (D-03) | Owner's choice of Next.js; versions verified in the research spike; TS 7 breaks `next build` |
| Runtime and package manager | Node 24 pinned in mise.toml and .nvmrc, engines `>=22`; pnpm 12.14.0 via `packageManager` (corepack or mise) (D-01, D-02) | better-sqlite3 13 needs Node 22+; pnpm is not installed globally, corepack resolves the pin |
| Launch | `pnpm start` = `next build && next start -H 127.0.0.1`; `pnpm dev` = `next dev -H 127.0.0.1`; `pnpm serve` skips the build; PORT env, default 3000; the URL is printed, no browser auto-open (D-01) | Next binds 0.0.0.0 by default, so the host flag is mandatory |
| Network boundary (auth) | No user auth. Loopback bind plus `src/proxy.ts` Host/Origin allowlist {127.0.0.1, localhost}, hostname only, 403 otherwise; Next's built-in Server Action origin check | Single local owner; the threat is LAN clients and DNS rebinding, not other users |
| Data layer | SQLite via better-sqlite3 13.0.3 + drizzle-orm 0.45.4 / drizzle-kit 0.31.11; WAL, busy_timeout 5000, synchronous NORMAL, foreign_keys ON; ULID ids (monotonic), epoch-ms timestamps (D-06, one-way, confirmed at Plan 01-01 Task 1) | One portable file; synchronous in-process driver; Drizzle 1.0 is still rc |
| Migrations | `drizzle-kit generate` into committed `drizzle/`, applied by `migrate()` at boot; never `drizzle-kit push` | A copied older data folder self-upgrades on the next start (FOUND-02) |
| Data folder | `DATA_DIR` (default `./data`, relative to the working directory) holds `app.db` plus `photos/`, `vision/`, `crops/`, `thumbs/`, `backups/`; the DB stores only paths relative to it; `src/server/storage/paths.ts` (`dataRoot`, `resolveData` with traversal guard) is the only module that knows the absolute root (D-04 costly, D-05) | Copy the folder anywhere and it works |
| Copying and backup | Copy only while stopped; the exit hook closes the DB so a clean stop leaves just `app.db`; the documented hot-backup method is SQLite `VACUUM INTO` (its UI is DATA-03, a v2 requirement) (D-07) | A live copy of a WAL database can miss pages |
| Boot | `src/instrumentation.ts` `register()` (nodejs runtime only, no Node APIs at top level) dynamically imports `src/server/boot.ts`: ensure dirs, migrate, start worker, install the exit hook | `register()` runs once per server process and HMR never re-runs it (spike-verified) |
| Singletons | DB handle and worker state live on `globalThis` (`__appDb`, `__appWorker`) | The instrumentation and route module graphs evaluate shared modules separately, even in production |
| Background jobs | SQLite `jobs` table (lane `anthropic` or `discogs`, type, JSON payload, status, attempts, max_attempts 3, run_after, unique dedupe_key); atomic claim with one `UPDATE … RETURNING`; one loop per lane (LANE_CONCURRENCY, anthropic 1 to 2 later); retry with 2 s / 4 s backoff; per-handler timeout through an AbortSignal; at-least-once execution, exactly-once completion, so handlers must be idempotent (D-12, D-13, D-14) | Durable and portable without Redis; survives restarts |
| One worker per data folder | `worker_lease` row (boot id, pid, heartbeat every 5 s, stale after 15 s or when the pid is dead); only the holder runs lanes and resets interrupted jobs | Stops a second `pnpm dev` or `pnpm start` on the same folder from re-running paid work |
| Secrets | Discogs consumer key and secret (later OAuth tokens) in `secrets.json` at the project root or `SECRETS_FILE`, refused inside DATA_DIR, mode 0600, atomic write, gitignored; env vars override; only masked DTOs leave the server; `import 'server-only'` on every secret-reading module (D-08, D-09, D-11) | Sharing the data folder or the repo never leaks keys |
| Non-secret settings | `settings` table (key, JSON value), e.g. `vision_model` (D-08) | Travels with the data folder |
| Claude access | No Anthropic API key and no SDK. The local Claude Code CLI runs headless as a child process (`claude -p --output-format json --model <id>`, Phase 2 adds `--json-schema` and `--allowedTools Read`) from the OS temp dir, with ANTHROPIC_API_KEY and app secrets removed from its env, never in minimal mode, through `src/server/proc/run.ts` (timeout, abort, process-group kill) (D-10, D-18 costly) | Uses the owner's Claude subscription instead of API billing |
| UI shell | Sticky 56px header: wordmark, nav Upload / Spines / Settings, worker status indicator polling `GET /api/status` every 5 s; theme follows the OS via next-themes; Sonner toasts for success only (D-16, D-17, UI-SPEC) | Polling is enough for one local user |
| Deployment target | None. Local only on 127.0.0.1; the full stack runs with `pnpm start` | Personal local tool; hosting is out of scope |
| Directory layout | `src/app` routes and pages; `src/components` (app components) and `src/components/ui` (shadcn); `src/server/**` server-only modules (`boot`, `config`, `ids`, `storage/`, `db/`, `jobs/` with no next imports, `secrets`, `settings`, `proc/`, `claude/`); `drizzle/` migrations; `scripts/` end-to-end verify scripts (Node built-ins, no src imports); `test/` stubs, helpers, fixtures | Keeps the worker liftable into its own process later |
| Verification style | Vitest unit tests on temp data folders, plus `node scripts/verify-*.ts` scripts that build and spawn the real server on a random port with temp DATA_DIR / SECRETS_FILE | Proves behavior against the real server, not mocks |

## Stack Touched in Phase 1

- [x] Project scaffold (framework, build, lint, test runner) — Plan 01-01
- [x] Routing — /, /upload, /spines, /settings, GET /api/status, GET/POST /api/dev/jobs — Plan 01-01
- [x] Database — a real write (enqueue, claim, complete, settings and secrets saves) and a real read (status counts, job list, settings) — Plans 01-01, 01-03, 01-04
- [x] UI — Queue test job button wired to the API, live status indicator, settings forms — Plans 01-01, 01-03, 01-04
- [x] Deployment — documented local full-stack run: `pnpm start` (build + serve on 127.0.0.1) or `pnpm dev`

## Out of Scope (Deferred to Later Slices)

- Photo upload, hashing, EXIF normalization, the `/api/files` streaming route (Phase 2; `resolveData` already exists for it)
- The vision call itself with `--json-schema` and image reading (Phase 2)
- Discogs OAuth, connection test, search, throttled Discogs gate, collection adds (Phases 3 and 4)
- Manual retry of failed jobs from the UI (REV-04, Phase 4)
- One-click backup or export of the data folder (DATA-03, v2)
- Any hosted deployment, multi-user auth, websockets or SSE

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing the decisions above:

- Phase 2: drop shelf photos and review spine crops next to editable AI-read fields; one headless Claude CLI call per photo on the `anthropic` lane
- Phase 3: connect Discogs via OAuth and see throttled candidate releases per spine on the `discogs` lane
- Phase 4: confirm a candidate to add it to the collection exactly once, and work through a status-filtered review queue
