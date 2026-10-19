# Phase 1: Foundation - Research

**Researched:** 2026-10-18
**Domain:** Next.js 16 local app shell: boot hook, SQLite/Drizzle migrations at boot, durable job queue + singleton worker, server-only secrets, 127.0.0.1 binding
**Confidence:** HIGH. Most of the load-bearing claims were checked by running a throwaway Next 16.4.2 + better-sqlite3 13 + Drizzle 0.45 spike on this machine this session (dev HMR, prod build/start, kill -9 restart, SIGTERM, LAN probe, Host/Origin guard, Vitest). The rest are cited from the official Next docs that ship inside `node_modules/next/dist/docs` for 16.4.2.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All decisions below were auto-selected (`--auto`) using the recommended option; review before planning if any look wrong.

#### Launch & runtime
- **D-01:** Package manager is pnpm. One command: `pnpm dev` for development and `pnpm start` (build + start) for daily use; both bind `-H 127.0.0.1`, default port 3000 (overridable via `PORT`).
- **D-02:** Node 24 LTS (engines `>=22`); pin via `.nvmrc` / `engines`.
- **D-03:** Stack per research/STACK.md: Next.js 16 App Router, React 19, TypeScript pinned `~6.0.3`, Tailwind 4 + shadcn/ui, Biome, Vitest.

#### Data folder & portability
- **D-04:** `DATA_DIR` defaults to `./data` (gitignored), overridable by env. Layout: `data/app.db` plus `photos/`, `vision/`, `crops/`, `thumbs/`, `backups/` subfolders created on boot. — **Reversibility:** costly — every stored path and the file route depend on this layout.
- **D-05:** DB stores only paths relative to `DATA_DIR`; `storage/paths.ts` is the single module that knows the absolute root.
- **D-06:** SQLite via better-sqlite3 + Drizzle 0.45; WAL mode; migrations run automatically at boot from `instrumentation.ts`. IDs are ULIDs, timestamps epoch ms. — **Reversibility:** one-way — switching DB driver/ORM later means rewriting the schema and migrations.
- **D-07:** Copying is safe when the app is stopped; a hot backup uses `VACUUM INTO` (backup UI itself is v2/DATA-03).

#### Secrets & settings
- **D-08:** Secrets (Anthropic API key, Discogs consumer key/secret, later OAuth tokens) are stored in a gitignored `secrets.json` at the project root (path overridable), NOT inside `data/` — so copying or sharing the data folder never leaks keys. Non-secret settings (model id, folder id) live in the DB `settings` table. Env vars (`ANTHROPIC_API_KEY`, `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET`) override saved values.
- **D-09:** Settings page shows each secret masked (e.g. `sk-ant-…a1b2`), an "overridden by env" badge when applicable, and a replace/clear action. No API route ever returns an unmasked secret; secrets are only read in server-only modules (`import 'server-only'`).
- **D-10:** Settings page includes a "Test" button for the Anthropic key (cheap models-list call, no vision tokens). Discogs test arrives with Phase 3.
- **D-11:** `.gitignore` committed in the first code commit covering `data/`, `secrets.json`, `.env*.local`.

#### Job queue & worker
- **D-12:** `jobs` table with lane (`anthropic` | `discogs`), type, payload JSON, status (queued/running/succeeded/failed/cancelled), attempts, `run_after`, unique `dedupe_key`. Atomic claim via `UPDATE … RETURNING`.
- **D-13:** Worker is a singleton on `globalThis`, started from `instrumentation.ts` (nodejs runtime only); HMR reuses the existing worker instead of starting another.
- **D-14:** On boot, jobs left in `running` are reset to `queued` (crash recovery). Failed jobs retry with exponential backoff up to 3 attempts, then stay `failed` for manual retry.
- **D-15:** Phase 1 ships a `noop`/`test` job type plus a dev-only trigger to prove restart and HMR behavior (success criterion 4).

#### App shell
- **D-16:** Minimal shell with top nav: Upload, Spines, Settings (Upload/Spines are placeholders until Phase 2). Light/dark follows system.
- **D-17:** A small status indicator in the shell (worker running, queued job count) polled from `GET /api/status`.

### Claude's Discretion
- Exact component layout and styling of settings page and shell.
- Migration tooling details (drizzle-kit generate vs push), test structure, Biome config.
- Port choice beyond the default.

### Deferred Ideas (OUT OF SCOPE)
- One-click backup/export of the data folder — v2 (DATA-03).
- Discogs connection test button — Phase 3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | User can run the app locally with one command; it binds to 127.0.0.1 only | `next dev/start -H 127.0.0.1` verified: `ss` shows `LISTEN 127.0.0.1:3917` only, LAN-IP curl refused (exit 7). Add a `proxy.ts` Host/Origin guard against DNS rebinding (verified 403). See Pattern 6, Pitfall 7. |
| FOUND-02 | All app state lives under a single relative data folder that can be copied and still works | `DATA_DIR` resolved against `process.cwd()`, relative paths in DB, migrations at boot, and `process.once('exit', () => db.close())`. That last one was verified to remove `-wal`/`-shm` on SIGTERM/SIGINT, so a stopped app leaves a single self-contained `app.db`. See Pattern 3, Pitfall 4. |
| FOUND-03 | Settings page saves Anthropic key + Discogs app credentials; env overrides; masked; never committed | `secrets.json` (0600, atomic write) read at call time by a `server-only` module. Env is re-read per call (Next reloads `.env.local` in-process, verified). Pages use `await connection()`. Masked DTO only. See Pattern 5, Pitfalls 3/8. |
| FOUND-04 | Durable job queue survives restarts and dev hot reloads without duplicating workers | Verified: `register()` runs once per server process, is NOT re-run by HMR (including edits to `instrumentation.ts` itself), and a `globalThis` guard holds across HMR. Kill -9 mid-job, then restart: recovery requeues and every job ends `succeeded` exactly once. See Patterns 1/2, Verification Strategy. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

From `./.claude/CLAUDE.md` (the project file; `./CLAUDE.md` does not exist):
- Stack is Next.js App Router + TypeScript. SQLite is the default store. All state is portable in the data folder. Secrets are stored locally and never committed.
- **Do not use:** TypeScript 7 (`typescript@latest`); Prisma; the `sqlite3` npm package (use better-sqlite3); BullMQ/Redis/Inngest/Trigger.dev (use the SQLite jobs table); `public/` for runtime files (serve from `data/` via a route handler); `oauth`/`oauth-1.0a`/`disconnect`/`discogs-client`.
- Stay on Drizzle 0.45 stable. Do not adopt the 1.0 RC.
- p-queue is ESM-only. Import it only from server code. (It is not needed in Phase 1.)
- GSD workflow enforcement: file changes go through GSD commands (an executor concern, not a planning one).
- User-global: dotfiles under `~/.config` are chezmoi-managed. If a step needs global tool config (e.g. mise), prefer **project-local** files (`mise.toml`, `.nvmrc`) and never edit `~/.config/*` directly.

## Summary

Every Phase 1 boot mechanism was proven in a spike this session on the exact pinned versions: Next 16.4.2 (Turbopack), better-sqlite3 13.0.3, drizzle-orm 0.45.4 and TypeScript 6.0.3. **`register()` runs exactly once per server process, in the `nodejs` runtime, and HMR never re-runs it.** That held for edits to pages, route handlers, shared server modules and `instrumentation.ts` itself. A `globalThis` guard keeps one worker alive across HMR. One non-obvious fact shapes the design. **The instrumentation module graph and the app-route module graph evaluate shared modules separately**, even in one process (the same file logged two different module-eval IDs). Module-level singletons, such as a DB connection or the worker-status object, therefore get duplicated unless they live on `globalThis`. The DB handle and worker state must both be `globalThis` singletons, in production too.

Restart semantics also work as designed. Three jobs were enqueued and the server was `kill -9`'d while job 1 was running. On restart, boot recovery reported "recovered 1 running job(s)", and all three jobs ended `succeeded` with exactly one recorded completion each. The interrupted job re-ran with attempt 2, so handlers are **at-least-once** and must be idempotent. `process.once('exit', () => db.close())` checkpoints the WAL: after SIGTERM or SIGINT, only `app.db` remains. After `kill -9`, `-wal`/`-shm` stay behind, and the "copy the folder" guarantee needs those files copied too.

There are four traps the planner must design around. **(1)** Pages that read SQLite without `await connection()` get prerendered during `next build`, where `register()` has not run. The build then creates `data/app.db` and fails with `no such table`. **(2)** `create-next-app@16.4.2` refuses to scaffold into this repo because `.planning/` exists, and its template defaults to `cacheComponents: true`, TypeScript `^5` and Biome 2.4.2. Scaffold into a subdir, move the files up, then fix the config. **(3)** pnpm is not installed globally. `corepack pnpm` resolves pnpm 12.14.0, which **fails the install** (`ERR_PNPM_IGNORED_BUILDS`) unless `pnpm-workspace.yaml` `allowBuilds` lists esbuild (pulled in by drizzle-kit). **(4)** `import 'server-only'` throws outside Next, so Vitest needs an alias to an empty stub.

**Primary recommendation:** Keep `instrumentation.ts` to a 4-line nodejs-gated dynamic import of `server/boot.ts`. Boot does: ensure DATA_DIR dirs, then open the `globalThis` DB (WAL), `migrate()`, recover `running` jobs, start the `globalThis` worker, and register the exit-close hook. Every server-rendered DB read calls `await connection()`. Prove criterion 4 with a Node script that spawns the real `next start`/`next dev` server, kills it and touches files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| One-command launch, 127.0.0.1 bind | Frontend Server (Next CLI) | — | `-H` flag on `next dev`/`next start`. No custom server needed. |
| Host/Origin guard (DNS-rebind/CSRF) | Frontend Server (`src/proxy.ts`) | API (Server Action origin check, built in) | Runs before every route. Proxy defaults to the Node runtime in 16. |
| Boot: dirs, migrate, recover, start worker | API/Backend (`instrumentation.ts` → `server/boot.ts`) | Database | `register()` completes before the server handles requests. |
| Job queue (enqueue/claim/complete/fail/recover) | API/Backend (`server/jobs/queue.ts`) | Database (`jobs` table) | Durability lives in SQLite. The loop is in-process. |
| Worker loop singleton | API/Backend (`server/jobs/worker.ts`) | — | `globalThis` singleton, never imported by client code. |
| Secrets read/write/mask | API/Backend (`server/secrets.ts`, server-only) | Storage (`secrets.json` file) | Never in the DB, client bundle or API responses. |
| Non-secret settings | Database (`settings` table) | API (`server/settings.ts`) | Portable with `data/`. |
| Settings form | Browser (client component) | API (Server Action) | The form posts the plaintext once. Only a masked DTO comes back. |
| Status indicator | Browser (polling `GET /api/status`) | API (route handler, SQL aggregate) | D-17. Polling only. |
| Data folder layout / path resolution | Storage (`server/storage/paths.ts`) | — | D-05 single authority. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.4.2 | App Router, route handlers, Server Actions, instrumentation, proxy | Locked (D-03). `latest` dist-tag. [VERIFIED: npm registry + spike build/start] |
| react / react-dom | 19.3.1 | UI | Peer of Next 16. create-next-app pins 19.3.0, so bump it. [VERIFIED: npm registry] |
| typescript | **6.0.3** (`~6.0.3`) | Types | Locked. `next build` type-checked cleanly with 6.0.3 in the spike. `latest` is 7.0.2, so do not take it. [VERIFIED: spike build] |
| better-sqlite3 | 13.0.3 | SQLite driver | Locked. **Ships prebuilt `.node` binaries for linux/darwin/win/musl x64+arm64 inside the package, with no install script**, so pnpm build-approval does not apply. Bundled SQLite **3.53.4**, compiled with `DQS=0`. [VERIFIED: spike `node_modules/better-sqlite3/prebuilds`, `select sqlite_version()`] |
| drizzle-orm | 0.45.4 | Schema + queries + `migrate()` | Locked (0.45 line). [VERIFIED: spike] |
| drizzle-kit | 0.31.11 | `generate` SQL migrations | Matching line. `generate` needs no DB file. [VERIFIED: spike] |
| ulid | 3.0.2 | ULID ids (D-06) | Exports `ulid`, `monotonicFactory`, `decodeTime`, `isValid`. Use `monotonicFactory()` for same-ms ordering. [VERIFIED: spike `Object.keys(require('ulid'))`] |
| server-only | 0.0.1 | Build-time guard against client import of secret modules | Official Next recommendation. [CITED: next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md] |
| @anthropic-ai/sdk | 0.135.0 | Settings "Test" button only (`client.models.list()`) | `models.list(params?)` and `AuthenticationError` (401) exist in the 0.135 typings. [VERIFIED: spike `resources/models.d.ts`, `core/error.d.ts`] |
| zod | 4.6.x | Validate settings form input and the `secrets.json` shape | Already in the project stack. [VERIFIED: npm registry] |
| tailwindcss + @tailwindcss/turbopack | 4.3.3 / 4.3.3 | Styling | The create-next-app 16.4.2 template now wires Tailwind through `@tailwindcss/turbopack` as a `turbopack.rules` loader, not PostCSS. Keep what the scaffold generates. [VERIFIED: scaffold output] |
| shadcn (CLI) | 4.22.x | Button, Input, Card, Badge, Label, Sonner | Locked (D-03). [VERIFIED: npm registry] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @biomejs/biome | 2.5.15 | Lint/format | Scaffold pins 2.4.2. Bump it and update `$schema`. |
| vitest | 5.0.5 | Unit + integration tests | Engines `^22.12 \|\| ^24`. Works on the machine's 22.22.1. [VERIFIED: spike test run] |
| next-themes | 0.4.6 | System light/dark (D-16) | The usual shadcn pairing for `class` dark mode. Optional: plain `prefers-color-scheme` CSS also satisfies "follows system". |
| @types/better-sqlite3 | 9.6.0 | Types | Types lag the major version, but the API is stable. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `better-sqlite3` statements for the claim | Drizzle `db.update(jobs).set().where(eq(jobs.id, subquery)).returning().get()` | Drizzle can express it, but the raw prepared statement is shorter, is verified, and is the hot path. Use Drizzle for everything else. |
| `drizzle-kit generate` + `migrate()` | `drizzle-kit push` | `push` has no migration files, so a copied old DB cannot self-upgrade. **Use generate** (discretion item resolved). |
| `next-themes` | CSS `@media (prefers-color-scheme)` with shadcn `dark` variant set to media | Fewer deps, but shadcn components assume the `.dark` class. |

**Installation (after scaffolding, see Pattern 7):**
```bash
corepack pnpm add next@16.4.2 react@19.3.1 react-dom@19.3.1 better-sqlite3@13.0.3 drizzle-orm@0.45.4 ulid@3.0.2 server-only@0.0.1 zod@4 @anthropic-ai/sdk@0.135.0 next-themes@0.4.6
corepack pnpm add -D typescript@~6.0.3 drizzle-kit@0.31.11 @types/better-sqlite3 @types/node@24 vitest@5.0.5 @biomejs/biome@2.5.15
```

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem npm` ran this session. Every `SUS` verdict below is either `too-new` (the *latest version* was published within the last few days) or `no-repository`. None is a new or low-download package. All are first-party packages named in the official Next/Drizzle/Anthropic docs or emitted by `create-next-app`. No package has an `install`/`postinstall` script (`npm view <pkg> scripts.*` was empty for better-sqlite3, drizzle-orm, drizzle-kit, ulid, next, server-only and @anthropic-ai/sdk).

| Package | Registry | Latest published | Weekly DL | Source Repo | Verdict | Disposition |
|---------|----------|------------------|-----------|-------------|---------|-------------|
| next | npm | 2026-10-15 | 40.8M | vercel/next.js | SUS (too-new) | Flagged. Pin 16.4.2 exactly. Planner adds checkpoint |
| react / react-dom | npm | 2026-10-14 | 115M / 109M | react/react | SUS (too-new) | Flagged. Pin 19.3.1 |
| better-sqlite3 | npm | 2026-08-05 | 7.0M | WiseLibs/better-sqlite3 | OK | Approved |
| drizzle-orm | npm | 2026-10-08 | 17.8M | drizzle-team/drizzle-orm | SUS (too-new) | Flagged. Pin 0.45.4 |
| drizzle-kit | npm | 2026-09-21 | 14.7M | drizzle-team/drizzle-orm | SUS (too-new) | Flagged. Pin 0.31.11 |
| ulid | npm | 2025-11-30 | 7.0M | ulid/javascript | OK | Approved |
| server-only | npm | 2022-09-03 | 13.9M | none listed | SUS (no-repository) | Flagged. Named in the official Next docs. Package is 2 files (`index.js` throws, `empty.js` for the `react-server` condition), verified in the spike |
| vitest | npm | 2026-10-15 | 76.6M | vitest-dev/vitest | SUS (too-new) | Flagged |
| @biomejs/biome | npm | 2026-09-30 | 10.9M | biomejs/biome | SUS (too-new) | Flagged |
| tailwindcss | npm | 2026-07-16 | 85.3M | tailwindlabs/tailwindcss | OK | Approved |
| @tailwindcss/turbopack | npm | 2026-07-31 | 659K | (tailwindlabs) | OK | Approved (emitted by create-next-app) |
| shadcn | npm | 2026-10-18 | 7.3M | shadcn-ui/ui | SUS (too-new) | Flagged |
| @anthropic-ai/sdk | npm | 2026-10-15 | 28.3M | anthropics/anthropic-sdk-typescript | SUS (too-new) | Flagged |
| zod | npm | 2026-10-12 | 213M | colinhacks/zod | SUS (too-new) | Flagged |
| next-themes | npm | 2025-03-11 | 16.7M | pacocoursey/next-themes | OK | Approved |
| typescript | npm | 2026-07-08 | 184M | microsoft/TypeScript | OK | Approved (6.0.3) |
| @types/better-sqlite3, @types/react(-dom) | npm | 2026-08/09 | 3M+ | DefinitelyTyped | OK | Approved |
| @types/node | npm | 2026-10-09 | 276M | DefinitelyTyped | SUS (too-new) | Flagged |
| pnpm (via corepack) | npm | 2026-10-15 | 132M | pnpm/pnpm | SUS (too-new) | Flagged. Pin via `packageManager` |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** next, react, react-dom, drizzle-orm, drizzle-kit, server-only, vitest, @biomejs/biome, shadcn, @anthropic-ai/sdk, zod, @types/node, pnpm. All are `too-new`/`no-repository` heuristics on very-high-download first-party packages. **Recommendation:** one batched `checkpoint:human-verify` before the first install, with exact version pins and the lockfile committed. Do not add per-package checkpoints.

## Architecture Patterns

### System Architecture Diagram

```
 pnpm dev | pnpm start
      │  (next dev|start -H 127.0.0.1, PORT default 3000)
      ▼
 ┌──────────────────────── Next server process (one PID) ───────────────────────────┐
 │                                                                                   │
 │  register()  ──(NEXT_RUNTIME==='nodejs')──► server/boot.ts                         │
 │   (once per process; HMR does NOT re-run)     1. paths.ensureDataDirs()            │
 │                                               2. getDb()  ── globalThis.__db ──┐   │
 │                                               3. migrate(drizzle/)             │   │
 │                                               4. recoverRunningJobs()          │   │
 │                                               5. startWorker() ─ globalThis ─┐ │   │
 │                                               6. process.once('exit', close) │ │   │
 │                                                                              │ │   │
 │  HTTP ─► proxy.ts (Host ∈ {127.0.0.1,localhost}? non-GET Origin ok?) ─403─►✗ │ │   │
 │            │ ok                                                              │ │   │
 │            ▼                                                                 │ │   │
 │   pages (await connection()) ──read──► settings.ts / secrets.ts ──► secrets.json│  │
 │   Server Action saveSecret ──write(atomic,0600)─┘   (masked DTO only back)   │ │   │
 │   GET /api/status ──SQL aggregate──────────────────────────────────────────►─┼─┤   │
 │   POST /api/dev/jobs (dev/test only) ──enqueue(dedupe)──────────────────────►─┼─┤   │
 │                                                                              ▼ ▼   │
 │                              worker loop per lane: claim (UPDATE…RETURNING)        │
 │                                 → handlers[type](payload) → complete | fail(backoff)│
 └───────────────────────────────────────────────────────────────────────────┬───────┘
                                                                             ▼
                                  DATA_DIR (./data): app.db (+ -wal/-shm while running),
                                  photos/ vision/ crops/ thumbs/ backups/
```

### Recommended Project Structure
```
mise.toml / .nvmrc            # node 24 (+ pnpm 12.14.0 in mise.toml)
package.json                  # "packageManager": "pnpm@12.14.0", engines node >=22
pnpm-workspace.yaml           # allowBuilds (esbuild: true, sharp: false, unrs-resolver: false)
next.config.ts                # NO cacheComponents
drizzle.config.ts
drizzle/                      # generated SQL migrations (committed)
secrets.json                  # gitignored, 0600, created on first save
vitest.config.ts              # alias server-only -> test/stubs/server-only.ts
scripts/verify-restart.ts     # criterion 4 (+3) end-to-end proof
scripts/verify-hmr.ts         # criterion 4 HMR proof
src/
├── instrumentation.ts        # 4 lines: nodejs gate + dynamic import('./server/boot')
├── proxy.ts                  # Host/Origin guard
├── app/
│   ├── layout.tsx            # shell + nav (Upload, Spines, Settings) + <StatusIndicator/>
│   ├── upload/page.tsx       # placeholder
│   ├── spines/page.tsx       # placeholder
│   ├── settings/page.tsx     # await connection(); masked DTOs; client form
│   ├── settings/actions.ts   # 'use server': saveSecret, clearSecret, testAnthropic, saveSetting
│   └── api/
│       ├── status/route.ts   # worker info + job counts
│       └── dev/jobs/route.ts # enqueue noop (404 unless dev or APP_TEST_HOOKS=1)
└── server/                   # every file: import 'server-only'; no next/* imports in jobs/
    ├── boot.ts
    ├── config.ts             # env reads (call-time), port/host constants
    ├── storage/paths.ts      # DATA_DIR authority, resolveData(rel) with traversal guard
    ├── db/{client,schema}.ts
    ├── secrets.ts            # read/write/mask secrets.json + env precedence
    ├── settings.ts           # settings table get/set (non-secret)
    └── jobs/{queue,worker,types}.ts, jobs/handlers/{index,noop}.ts
```

### Pattern 1: Minimal instrumentation + boot module
**What:** `register()` is called once when the server instance starts and must finish before requests are served [CITED: next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md]. It is called in all runtimes, so gate on `NEXT_RUNTIME` and import Node code dynamically [CITED: next/dist/docs/01-app/02-guides/instrumentation.md].
**Verified behaviour (spike, Turbopack dev + prod):** One `register runtime=nodejs` log per process. No edge invocation happened, even with a `proxy.ts` present (proxy runs in Node in 16). Editing `page.tsx`, `route.ts`, a shared server module or `instrumentation.ts` itself never re-ran `register()`. Changing `next.config.ts` makes `next dev` **restart the server as a new PID** (old process exited with code 77 and ran its exit hook), and `register()` then runs in the new process. Changing `.env.local` only logs `Reload env: .env.local` in-process, with no restart. [VERIFIED: spike]
**Keep `instrumentation.ts` free of any Node API.** Even `process.pid` at the top level produced a build warning ("A Node.js API is used … not supported in the Edge Runtime"), because the file is also compiled for edge. [VERIFIED: spike build log]
```ts
// src/instrumentation.ts  (verified in spike)
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { bootServer } = await import('./server/boot');
  await bootServer();
}
```
```ts
// src/server/boot.ts
import 'server-only';
export async function bootServer() {
  ensureDataDirs();                 // photos/ vision/ crops/ thumbs/ backups/ (D-04)
  runMigrations();                  // sync, before first request
  recoverRunningJobs();             // D-14
  startWorker();                    // globalThis-guarded
  process.once('exit', () => { try { getDb().$client.close(); } catch {} }); // checkpoints WAL
}
```

### Pattern 2: `globalThis` singletons for BOTH the DB handle and the worker
**What:** Store the DB connection and the worker state on `globalThis`. Module scope is not enough.
**Why (verified):** In one process, the instrumentation graph and the route graph each evaluated `src/server/counter.ts` separately (`[counter] module evaluated jksa1j` from boot, `uiivem` on the first `/api/status` request, then `qorjud` after an edit to that file). `globalThis.__spikeWorker` was still the same object, with the same id and ticks still increasing, across every HMR edit. Production `next start` behaves the same, because there are separate chunks per graph. [VERIFIED: spike]
**Consequence:** Worker *code* edited during `next dev` does **not** hot-swap. The loop started from the instrumentation graph keeps running the old closures until the dev server restarts. Document "restart `pnpm dev` after editing job handlers".
```ts
// src/server/db/client.ts  (verified in spike)
import 'server-only';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import * as schema from './schema';
import { dbFile } from '../storage/paths';

type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
const g = globalThis as unknown as { __appDb?: Db };

export function getDb(): Db {
  if (g.__appDb) return g.__appDb;
  const sqlite = new Database(dbFile());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  g.__appDb = drizzle(sqlite, { schema }) as Db;
  return g.__appDb;
}
export function runMigrations() {
  migrate(getDb(), { migrationsFolder: path.join(/* turbopackIgnore: true */ process.cwd(), 'drizzle') });
}
```
Without `/* turbopackIgnore: true */`, `path.join(process.cwd(), …)` in a module imported by a route produced the build warning "Dynamic filesystem access causes tracing of the whole project". With the comment, the build is clean. [VERIFIED: spike build]

### Pattern 3: Durable queue: enqueue (dedupe), atomic claim, complete/fail, recover
**Verified SQL** on better-sqlite3's bundled SQLite 3.53.4 (`RETURNING` needs ≥ 3.35): [VERIFIED: spike]
```ts
// claim: one statement, so it is atomic even across processes (SQLite write lock)
const claimStmt = `UPDATE jobs SET status='running', locked_at=@now, attempts=attempts+1, updated_at=@now
  WHERE id = (SELECT id FROM jobs WHERE lane=@lane AND status='queued' AND run_after<=@now
              ORDER BY run_after, id LIMIT 1)
  RETURNING *`;
// enqueue: idempotent by dedupe_key (4th insert with same key returned changes=0 in spike)
`INSERT INTO jobs(id, lane, type, payload, run_after, dedupe_key, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING`
// complete
`UPDATE jobs SET status='succeeded', locked_at=NULL, updated_at=? WHERE id=? AND status='running'`
// fail with backoff (D-14: 3 attempts)
`UPDATE jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,
   run_after=?, last_error=?, locked_at=NULL, updated_at=? WHERE id=?`   -- run_after = now + 2^attempts * 1000
// boot recovery (D-14)
`UPDATE jobs SET status='queued', locked_at=NULL, updated_at=? WHERE status='running'`
```
**Gotcha:** better-sqlite3 13 is compiled with `DQS=0`, so double-quoted strings are identifiers, not literals. Always write `'queued'` with single quotes. [VERIFIED: spike `pragma compile_options`]
Schema per D-12. These values are quoted verbatim from `01-CONTEXT.md:38`: "lane (`anthropic` | `discogs`), type, payload JSON, status (queued/running/succeeded/failed/cancelled), attempts, `run_after`, unique `dedupe_key`". Add `max_attempts` (default 3), `locked_at`, `last_error`, `created_at`, `updated_at`, and the index `(lane, status, run_after)`. The spike's drizzle-kit output for exactly this table generated `CREATE UNIQUE INDEX jobs_dedupe_key_unique` and `CREATE INDEX jobs_claim_idx ON jobs(lane,status,run_after)`. [VERIFIED: spike `drizzle/0000_init.sql`]

### Pattern 4: Worker loop
```ts
// src/server/jobs/worker.ts
import 'server-only';
type WorkerState = { bootId: string; startedAt: number; stop: () => void; starts: number };
const g = globalThis as unknown as { __appWorker?: WorkerState; __appWorkerStarts?: number };

export function startWorker() {
  if (g.__appWorker) return g.__appWorker;            // HMR / double-call safe (verified)
  g.__appWorkerStarts = (g.__appWorkerStarts ?? 0) + 1; // exposed by /api/status for the HMR test
  let stopped = false;
  g.__appWorker = { bootId: ulid(), startedAt: Date.now(), starts: g.__appWorkerStarts, stop: () => { stopped = true; } };
  for (const lane of ['anthropic', 'discogs'] as const) void runLane(lane, () => stopped);
  return g.__appWorker;
}
async function runLane(lane: Lane, isStopped: () => boolean) {
  while (!isStopped()) {
    let job: Job | undefined;
    try { job = claim(lane); } catch (e) { log(e); await sleep(1000); continue; } // SQLITE_BUSY etc. must not kill the loop
    if (!job) { await sleep(500); continue; }
    try { await handlers[job.type](job.payload, ctx); complete(job.id); }
    catch (e) { fail(job, e); }
  }
}
```
Phase 1 runs concurrency 1 per lane. Phase 2/3 raise anthropic to 2 by running N `runLane` loops, because claim is atomic.

### Pattern 5: Secrets: file + env precedence + masked DTO
- File path: `SECRETS_FILE` env, else `path.resolve(process.cwd(), 'secrets.json')` [ASSUMED env-var name. D-08 only says "path overridable"].
- **Read at call time** (sync `fs.readFileSync` + zod parse; cheap). Do not cache at boot: Next reloads `.env.local` into `process.env` in-process without restarting (verified), so call-time reads pick up env overrides immediately.
- **Write atomically:** `writeFileSync(tmp, json, { mode: 0o600 })` then `renameSync(tmp, file)`, with `tmp` in the same directory.
- Precedence: `process.env[ENV_NAME]` (non-empty) > file value > unset. Env names are verbatim from D-08: `ANTHROPIC_API_KEY`, `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET`.
- DTO returned to any page or action: `{ key, configured: boolean, source: 'env'|'file'|null, masked: string|null }`. Mask = known prefix (`sk-ant-`) + `…` + last 4. If length ≤ 8, return `••••`.
- Never put a secret in an input `defaultValue`, in Server Action return state, in `revalidatePath`-rendered HTML, or in logs. The password input stays empty with the mask as placeholder.
- "Test" (D-10): `new Anthropic({ apiKey }).models.list({ limit: 1 })` → `{ ok: true }`, or map `AuthenticationError` → "Key rejected (401)" and `APIConnectionError` → "Network error". Return only `{ ok, message }`.

### Pattern 6: Bind + proxy guard (FOUND-01)
- Scripts: `"dev": "next dev -H 127.0.0.1"`, `"start": "next build && next start -H 127.0.0.1"`. The port comes from the `PORT` env var, which `next dev`/`next start` read natively (default 3000) [CITED: next/dist/docs/01-app/03-api-reference/06-cli/next.md, "-p … Default: 3000, env: PORT"]. The default `-H` is **0.0.0.0** [CITED: same file], so the flag is mandatory.
- Verified: `ss -ltnp` shows `127.0.0.1:3917` only, curl to the LAN IP `192.168.1.72:3917` was refused, and Next printed `Network: http://127.0.0.1:3917`. [VERIFIED: spike]
- Binding to loopback does not stop a malicious web page in the user's own browser (DNS rebinding / cross-site form POST). Add `src/proxy.ts`. It checks that the `Host` header's hostname is `127.0.0.1` or `localhost`, and for non-GET/HEAD requests that any `Origin` is too. Verified: forged `Host` → 403, foreign `Origin` POST → 403, normal request → 200, and the worker and `register()` are unaffected. [VERIFIED: spike] Check the **hostname only**, not the port, so a `PORT` override cannot break it.
```ts
// src/proxy.ts  (verified shape; hostname-only variant recommended)
import { NextResponse, type NextRequest } from 'next/server';
const OK = new Set(['127.0.0.1', 'localhost']);
const hostOf = (h: string | null) => { try { return h ? new URL(`http://${h}`).hostname : ''; } catch { return ''; } };
export function proxy(req: NextRequest) {
  if (!OK.has(hostOf(req.headers.get('host')))) return new NextResponse('Forbidden', { status: 403 });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const o = req.headers.get('origin');
    if (o && !OK.has(new URL(o).hostname)) return new NextResponse('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}
export const config = { matcher: '/((?!_next/static|_next/image|favicon.ico).*)' };
```

### Pattern 7: Scaffolding into this non-empty repo
- `create-next-app .` **refuses**: "The directory … contains files that could conflict: .planning/". `.git` and `.claude` are tolerated. [VERIFIED: spike]
- Do this instead: `npx create-next-app@16.4.2 app-tmp --ts --tailwind --biome --app --src-dir --use-pnpm --skip-install --disable-git --no-react-compiler --import-alias "@/*" --no-agent-feedback`, then move `app-tmp/*` and dotfiles into the root and remove `app-tmp`.
- The scaffold output then needs fixing [VERIFIED: spike scaffold]:
  - `next.config.ts` has **`cacheComponents: true, partialPrefetching: true`** even without `--cache-components`. **Remove both** (reason in Pitfall 1).
  - `package.json`: `typescript ^5` → `~6.0.3`; `@biomejs/biome 2.4.2` → `2.5.15` (and the `$schema` URL in `biome.json`); `react 19.3.0` → `19.3.1`; `@types/node ^20` → `^24`; scripts get `-H 127.0.0.1`; add `"packageManager": "pnpm@12.14.0"` and `"engines": { "node": ">=22" }`.
  - `.gitignore` already has `.env*` (covers `.env*.local`, D-11). Append `/data/`, `/secrets.json`, `*.db`, `*.db-wal`, `*.db-shm`, and `!.env.example`.
  - `pnpm-workspace.yaml` comes with `allowBuilds: { sharp: false, unrs-resolver: false }`. Add `esbuild: true` (Pitfall 2).
  - It generates `AGENTS.md` (Next's `agentRules`). Keep or delete as you prefer. It is harmless.

### Anti-Patterns to Avoid
- **Module-level `new Database()` or worker state:** gets duplicated across module graphs (verified). Use `globalThis`.
- **Top-level side effects in modules imported by routes:** `next build` evaluates route modules during "Collecting page data". The spike logged a module evaluation at build time, and `register()` is not run at build. Keep `getDb()` lazy.
- **Opening the DB or running migrations from a route** "just in case": boot owns migrations. Routes assume a migrated DB.
- **Long work in request handlers or Server Actions:** enqueue only.
- **Importing `next/*` inside `server/jobs/**`:** keeps the worker liftable to a standalone process later (ARCHITECTURE.md).
- **Re-reading secrets into client components or `NEXT_PUBLIC_*`:** never.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema migrations | ad-hoc `CREATE TABLE IF NOT EXISTS` at boot | `drizzle-kit generate` + `migrate()` (tracks `__drizzle_migrations`) | Copied old DBs must self-upgrade (FOUND-02) |
| Sortable IDs | `Date.now()+random` strings | `ulid` `monotonicFactory()` | Monotonic within the same ms, validated format |
| Client-import guard for secrets | lint rules / conventions | `import 'server-only'` | Build-time error if a client module imports it |
| Native-module bundling config | `serverExternalPackages: ['better-sqlite3']` | nothing. It is already on Next's default list [CITED: next/dist/docs/.../serverExternalPackages.md lines listing `better-sqlite3`, `sharp`] | Redundant config |
| Atomic WAL-safe hot copy | `fs.copyFile(app.db)` while running | `VACUUM INTO` (v2 DATA-03) or stop the app first (D-07) | A live copy misses `-wal` pages |
| CSRF on Server Actions | custom tokens | Next's built-in Origin/Host check for Server Actions + `proxy.ts` | Built in. Proxy covers route handlers |
| Job queue library | BullMQ/Redis | the SQLite `jobs` table (locked) | Portability |

## Runtime State Inventory

Not applicable. This is a greenfield phase (no rename/refactor/migration). The only existing files are `.planning/` and `.claude/CLAUDE.md`, verified by `ls -la` of the repo root.

## Common Pitfalls

### Pitfall 1: Pages reading SQLite get prerendered at build time
**What goes wrong:** `next build` fails with `SqliteError: no such table: jobs` and leaves a stray `data/app.db` created during the build. With `cacheComponents: true`, the build instead fails with "Next.js encountered uncached or runtime data during prerendering … `connection()` accessed outside of `<Suspense>`". [VERIFIED: spike, both modes]
**Why:** better-sqlite3 is synchronous, so its queries "complete during prerendering" [CITED: next/dist/docs/01-app/03-api-reference/04-functions/connection.md]. `register()` (and therefore migrations) does not run during the build.
**How to avoid:** Remove `cacheComponents` from `next.config.ts`. Call `await connection()` (from `next/server`) at the top of every server-side data loader used by pages and layouts. Verified: `/settings` became `ƒ (Dynamic)` and no `data/` was created at build. In Next 16, `export const dynamic` is no longer documented on the route-segment-config page and is removed when Cache Components are on. Prefer `connection()`.
**Warning signs:** a `data/` directory appears after `pnpm build`; a page shows `○ (Static)` in the build table.

### Pitfall 2: pnpm 12 aborts install on unapproved build scripts
**What goes wrong:** `pnpm add -D drizzle-kit` exits with `ERR_PNPM_IGNORED_BUILDS: Ignored build scripts: esbuild@0.18.20, esbuild@0.25.12, esbuild@0.28.2`. [VERIFIED: spike, pnpm 12.14.0 via corepack]
**How to avoid:** Commit `pnpm-workspace.yaml` with `allowBuilds: { esbuild: true, sharp: false, unrs-resolver: false }`. This is the format `pnpm approve-builds esbuild` wrote in the spike. better-sqlite3 13 needs no entry (no install script, prebuilt binaries shipped).
**Warning signs:** non-zero exit from `pnpm install` on a fresh clone.

### Pitfall 3: `server-only` breaks Vitest
**What goes wrong:** Importing any `server/*` module in a test throws, because `server-only`'s default export condition is `index.js` (which throws). Only the `react-server` condition maps to `empty.js`. [VERIFIED: spike `node_modules/server-only/package.json` exports + `node -e "require('server-only')"` threw]
**How to avoid:** `vitest.config.ts`: `resolve.alias: { 'server-only': <path to test/stubs/server-only.ts (export {})>, '@': src }`, `environment: 'node'`, `pool: 'forks'`. Verified passing in the spike.

### Pitfall 4: WAL files and "copy the folder"
**What goes wrong:** After `kill -9` (or a crash), `app.db-wal` (82 KB in the spike) and `app.db-shm` remain. Copying only `app.db` loses the recent writes. [VERIFIED: spike]
**How to avoid:** `process.once('exit', () => db.close())` in boot. Verified: after SIGTERM (exit 143) and SIGINT (exit 130), `data/` contained only `app.db`. Document "stop the app, then copy `data/`" (D-07). When copying after a crash, copy the whole folder. SQLite replays the WAL on next open.

### Pitfall 5: Interrupted jobs re-run (at-least-once)
**What goes wrong:** A job running at kill time is requeued at boot and executes again (spike: `long1` ran with attempt=1, was killed, then re-ran with attempt=2). Its side effects happen twice unless the handler is idempotent. [VERIFIED: spike]
**How to avoid:** State the contract in `jobs/types.ts`: "handlers must be idempotent; completion is exactly-once, execution is at-least-once". Phase 2/4 rely on persist-before-parse and pre-flight checks. Decide whether a recovered job counts against `max_attempts`. The spike's claim increments attempts on every claim, so a crash loop eventually fails the job. Keep that behaviour.

### Pitfall 6: Two server processes on one DATA_DIR
**What goes wrong:** `pnpm dev` and `pnpm start` running against the same `data/` (possible with a `PORT` override). The second process's boot recovery resets the first's `running` jobs, so they execute twice. The atomic claim prevents double-*claiming*, but not this.
**How to avoid (recommended hardening):** A heartbeat lease row (`worker_lease`: owner bootId, pid, heartbeat_at). The worker only starts if there is no lease, or the lease's heartbeat is older than ~15 s. Recovery only resets jobs whose `locked_by` lease is dead. Or, at minimum, log a loud warning. [ASSUMED design; not spiked]

### Pitfall 7: `localhost` vs `127.0.0.1`
**What goes wrong:** With `-H 127.0.0.1`, anything that dials `::1` (IPv6 localhost) is refused. Some tools resolve `localhost` to `::1` first. Browsers generally fall back to IPv4. [ASSUMED]
**How to avoid:** Print, document and use `http://127.0.0.1:<port>` everywhere, including the future Discogs OAuth callback (ARCHITECTURE.md already uses 127.0.0.1). The proxy allows both hostnames.

### Pitfall 8: Secrets leaking through rendered HTML or action state
**What goes wrong:** Passing the stored key to `<input defaultValue>` or returning it in `useActionState` puts it in the RSC payload and HTML.
**How to avoid:** The masked DTO only (Pattern 5). Add an automated canary test (Verification Strategy).

### Pitfall 9: Stale worker code in dev
**What goes wrong:** You edit `jobs/handlers/noop.ts` during `pnpm dev`, and the running worker keeps executing the old version (Pattern 2).
**How to avoid:** Document it and restart dev after handler edits. Do not try to hot-swap the loop, which would risk two loops.

## Code Examples

### paths.ts (D-04/D-05)
```ts
import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
export const SUBDIRS = ['photos', 'vision', 'crops', 'thumbs', 'backups'] as const; // verbatim from D-04
export function dataRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_DIR ?? 'data');
}
export const dbFile = () => path.join(dataRoot(), 'app.db');
export function ensureDataDirs() { for (const d of SUBDIRS) fs.mkdirSync(path.join(dataRoot(), d), { recursive: true }); }
export function resolveData(rel: string) {           // the only way to turn a DB path into an absolute path
  const root = dataRoot(); const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('path escapes DATA_DIR');
  return abs;
}
```

### Settings page loader
```ts
// src/app/settings/page.tsx
import { connection } from 'next/server';
export default async function SettingsPage() {
  await connection();                       // mandatory: prevents build-time prerender (Pitfall 1)
  const secrets = listSecretStatus();       // masked DTOs only
  const model = getSetting('vision_model') ?? 'claude-opus-5-5';
  return <SettingsForm secrets={secrets} model={model} />;
}
```

### Status route
```ts
// src/app/api/status/route.ts
import { connection } from 'next/server';
export async function GET() {
  await connection();
  return Response.json({ worker: workerInfo() /* {bootId, startedAt, starts} */, jobs: countsByLaneStatus() });
}
```

## Success-Criteria Verification Strategy

`workflow.nyquist_validation` is `false`, so the full Validation Architecture section is omitted. These are the concrete, automatable checks for each criterion.

| Criterion | How to prove it | Type |
|-----------|-----------------|------|
| 1. One command, 127.0.0.1, not on LAN | `pnpm start`, then `curl 127.0.0.1:$PORT` → 200; `ss -ltnp \| grep :$PORT` shows only `127.0.0.1`; `curl <LAN-IP>:$PORT` fails; `curl -H 'Host: evil.test' …` → 403 | script |
| 2. Settings masked, env override, no leaks | Save canary `sk-ant-CANARY-0123456789abcd`, reload: the page HTML and every `/api/*` JSON lack `CANARY-0123456789`; mask ends `abcd`. Set `ANTHROPIC_API_KEY=sk-ant-ENVKEY…` in env, restart: badge "env", and `getSecret()` returns the env value. `git status --porcelain` is empty after saving. `grep -r CANARY .next/static` is empty | Vitest (unit for secrets.ts) + script |
| 3. Copy data folder | Stop app (SIGTERM) → `cp -a data /tmp/x/data` → `DATA_DIR=/tmp/x/data PORT=3901 next start` → `/api/status` job counts equal the originals, and a file written under `data/` resolves via `resolveData` | script |
| 4a. Restart, exactly once | `scripts/verify-restart.ts`: build once. Spawn **`node node_modules/next/dist/bin/next start -H 127.0.0.1`** directly, not via pnpm, so the child PID is the server (in the spike, killing via pnpm wrapper semantics was confusing: `ELIFECYCLE 137`). Use `DATA_DIR=<tmp>`, `APP_TEST_HOOKS=1` and a random `PORT`. POST three noop jobs (one with `ms: 4000`), wait until one is `running`, `SIGKILL`, respawn, poll `/api/status` until everything is `succeeded`. Assert the 2 queued-before-kill jobs have `attempts=1`, the in-flight one has `attempts=2`, and each has exactly one completion (status succeeded, plus a `job_events`/completion row count of 1) | Node script (`node scripts/verify-restart.ts` works: Node 22.22.1 runs `.ts` with type stripping, verified) |
| 4b. HMR never starts a second worker | `scripts/verify-hmr.ts`: spawn `next dev`, read `/api/status` → `{bootId, starts:1}`. Append a comment to `src/server/jobs/worker.ts`, `src/app/page.tsx` and `src/instrumentation.ts` (restore in `finally`), wait ~3 s, hit `/` and `/api/status` → same `bootId`, `starts` still 1, and the server PID is unchanged | Node script |
| Unit | Vitest on a temp `DATA_DIR`: migrate; enqueue dedupe returns 0 changes the second time; claim returns the oldest eligible and skips future `run_after`; fail → backoff → `failed` after 3; recover resets `running`; `startWorker()` twice → the same object, `starts==1`; mask(); secret precedence; `resolveData('../x')` throws | Vitest (verified setup) |

**Dev-only trigger (D-15):** `POST /api/dev/jobs` returns 404 unless `process.env.NODE_ENV !== 'production' || process.env.APP_TEST_HOOKS === '1'` [ASSUMED env name], so the restart script can use it against `next start`. A `noop` handler payload `{ ms?: number, failTimes?: number }` lets the same handler exercise sleep and retry/backoff.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (`export function proxy`), Node runtime by default | Next 16.0 [CITED: next/dist/docs/.../proxy.md version table] | Use `src/proxy.ts` |
| `export const dynamic = 'force-dynamic'` | `await connection()`; `dynamic` removed under Cache Components | Next 16.0 [CITED: route-segment-config/index.md version table] | Use `connection()` |
| Tailwind via `@tailwindcss/postcss` | create-next-app 16.4.2 emits the `@tailwindcss/turbopack` loader in `turbopack.rules` | 16.4 template [VERIFIED: scaffold] | Keep scaffold output. Run shadcn init after |
| `next lint` | removed; Biome/ESLint direct | Next 16 [per STACK.md] | `"lint": "biome check"` |
| `next dev` output to `.next` | `.next/dev` (dev and build can run concurrently) | Next 16 [CITED: next/dist/docs/.../06-cli/next.md] | Build scripts can run while dev is up |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Env var name `SECRETS_FILE` for the overridable secrets path | Pattern 5 | Cosmetic. Rename freely |
| A2 | Env var name `APP_TEST_HOOKS` to enable the dev trigger under `next start` | Verification | Cosmetic |
| A3 | Heartbeat-lease design for the two-process guard | Pitfall 6 | Optional hardening. Without it, a rare double execution is possible |
| A4 | Browsers fall back from `::1` to IPv4 for `localhost` | Pitfall 7 | Low. Docs say to use 127.0.0.1 anyway |
| A5 | `models.list({ limit: 1 })` incurs no token cost | Pattern 5 | Low. It is a metadata endpoint |

## Open Questions

1. **Does "one command opens the app" mean auto-launching a browser?**
   - Known: `next dev/start` print the URL and do not open a browser.
   - Recommendation: Print the URL only. Treat auto-open as out of scope unless the user objects.
2. **Should `pnpm start` rebuild every time (D-01 says "build + start")?**
   - Recommendation: Yes, `next build && next start -H 127.0.0.1`. Turbopack builds in seconds, which guarantees fresh code. Optionally add `"serve": "next start -H 127.0.0.1"` for no-rebuild launches.
3. **Is `GET /api/files/[...path]` in Phase 1?** SUMMARY.md lists it in Phase 1. CONTEXT.md does not.
   - Recommendation: Ship `resolveData()` with the traversal guard plus unit tests now. Add the streaming route in Phase 2, its first consumer. Criterion 3 can be shown with any file under `data/` (e.g. one the noop job writes).
4. **Node 24 vs the machine's Node 22.22.1.** D-02 says Node 24. The machine runs 22 globally via mise.
   - Recommendation: Commit `mise.toml` (`node = "24"`, `pnpm = "12.14.0"`) and `.nvmrc` (`24`). A setup task runs `mise install`. Everything was verified on 22.22.1, which satisfies `engines >=22`, so this is not blocking.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ (mise) | 22.22.1 (24.22.0 installable via `mise install node@24`) | 22 satisfies engines `>=22` |
| pnpm | D-01 | ✗ globally; ✓ via `corepack pnpm` | 12.14.0 (corepack 0.34.6) | `corepack enable pnpm` (writes into mise's node bin, no sudo), or `mise use pnpm@12.14.0` |
| npm / npx | create-next-app | ✓ | 10.9.4 | — |
| mise | node/pnpm pinning | ✓ | `~/.local/bin/mise` | `.nvmrc` |
| sqlite3 CLI | debugging only | not needed | — | `node -e` with better-sqlite3 |
| git | `git status` check, commits | ✓ | — | — |
| Network interfaces for the LAN test | criterion 1 | ✓ | wlan0 192.168.1.72, enp5s0 192.168.1.76, tailscale0 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** pnpm. Use `corepack pnpm` / `corepack enable pnpm`, and pin `"packageManager": "pnpm@12.14.0"`.

## Security Domain

`security_enforcement: true`, ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (single local user; loopback bind is the boundary) | `-H 127.0.0.1` + proxy Host guard |
| V3 Session Management | no | — |
| V4 Access Control | yes (network-level) | loopback bind; `proxy.ts` Host/Origin allowlist; dev trigger 404 in prod |
| V5 Input Validation | yes | zod on Server Action inputs and the `secrets.json` parse; `resolveData` traversal guard |
| V6 Cryptography | no hand-rolled crypto | secrets stored plaintext, file mode 0600, outside `data/` (D-08) |
| V7 Error Handling/Logging | yes | Never log secret values; the Anthropic test maps errors to generic messages |
| V8 Data Protection | yes | masked DTOs only; no `NEXT_PUBLIC_`; `server-only` on secret modules; `.gitignore` from commit 1 |
| V14 Configuration | yes | `allowBuilds` explicit allowlist; exact version pins + lockfile |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LAN client calls mutating routes (burns API credit) | Elevation/Spoofing | `-H 127.0.0.1` (verified LAN refused) |
| DNS rebinding / malicious site POSTs to 127.0.0.1 | Spoofing/Tampering | `proxy.ts` Host + Origin check (verified 403); Server Actions' built-in origin check |
| Secret echoed in HTML/RSC payload/API | Information disclosure | masked DTO; canary test; `grep .next/static` |
| Secret committed or shared with the data folder | Information disclosure | `secrets.json` outside `data/`, gitignored, 0600 |
| Path traversal via stored relative paths | Tampering/Disclosure | `resolveData()` prefix check |
| Supply chain (new versions, build scripts) | Tampering | exact pins, committed lockfile, `allowBuilds` allowlist, single human-verify checkpoint |

## Sources

### Primary (HIGH confidence)
- **Spike run this session** (Next 16.4.2 Turbopack, better-sqlite3 13.0.3, drizzle-orm 0.45.4, drizzle-kit 0.31.11, TS 6.0.3, vitest 5.0.5, pnpm 12.14.0 via corepack, Node 22.22.1). Verified: register once/HMR, dual module graphs + globalThis, prod build/start, kill -9 recovery exactly-once, SIGTERM/SIGINT WAL cleanup, LAN refusal, proxy 403s, `connection()` vs prerender (cacheComponents on/off), turbopackIgnore, pnpm `ERR_PNPM_IGNORED_BUILDS`, server-only in Vitest, create-next-app behaviour, SQLite 3.53.4 RETURNING, DQS=0.
- Next 16.4.2 bundled docs (`node_modules/next/dist/docs/01-app/`): `03-api-reference/03-file-conventions/instrumentation.md`, `02-guides/instrumentation.md`, `03-api-reference/06-cli/next.md`, `03-api-reference/05-config/01-next-config-js/serverExternalPackages.md`, `03-api-reference/03-file-conventions/proxy.md`, `03-api-reference/04-functions/connection.md`, `03-api-reference/03-file-conventions/02-route-segment-config/index.md`, `01-getting-started/05-server-and-client-components.md`.
- npm registry (`npm view`) and the gsd package-legitimacy seam: versions, engines, publish dates, scripts.

### Secondary (MEDIUM confidence)
- Project research: `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` (reused, not re-derived).

### Tertiary (LOW confidence)
- None relied upon.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Installed and built in the spike on the exact versions.
- Architecture (boot/worker/queue): HIGH. Every lifecycle behaviour was observed directly in dev and prod.
- Pitfalls: HIGH for 1–5, 8 and 9 (reproduced). MEDIUM/ASSUMED for 6 and 7.
- Security: HIGH for the bind and proxy (probed). The rest are standard controls.

**Research date:** 2026-10-18
**Valid until:** ~2026-11-18 (Next/pnpm release quickly; re-check if bumping off the pinned versions)
