# Phase 1: Foundation - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A runnable local Next.js app shell with: one-command launch bound to 127.0.0.1, a portable data folder (SQLite + file storage), a settings page that saves and masks credentials, and a durable SQLite-backed job queue with a singleton worker that survives restarts and dev hot-reloads. No photo upload, vision, or Discogs calls yet — the worker runs but has only a no-op/test job type.

Requirements: FOUND-01, FOUND-02, FOUND-03, FOUND-04.

</domain>

<decisions>
## Implementation Decisions

All decisions below were auto-selected (`--auto`) using the recommended option; review before planning if any look wrong.

### Launch & runtime
- **D-01:** Package manager is pnpm. One command: `pnpm dev` for development and `pnpm start` (build + start) for daily use; both bind `-H 127.0.0.1`, default port 3000 (overridable via `PORT`).
- **D-02:** Node 24 LTS (engines `>=22`); pin via `.nvmrc` / `engines`.
- **D-03:** Stack per research/STACK.md: Next.js 16 App Router, React 19, TypeScript pinned `~6.0.3`, Tailwind 4 + shadcn/ui, Biome, Vitest.

### Data folder & portability
- **D-04:** `DATA_DIR` defaults to `./data` (gitignored), overridable by env. Layout: `data/app.db` plus `photos/`, `vision/`, `crops/`, `thumbs/`, `backups/` subfolders created on boot. — **Reversibility:** costly — every stored path and the file route depend on this layout.
- **D-05:** DB stores only paths relative to `DATA_DIR`; `storage/paths.ts` is the single module that knows the absolute root.
- **D-06:** SQLite via better-sqlite3 + Drizzle 0.45; WAL mode; migrations run automatically at boot from `instrumentation.ts`. IDs are ULIDs, timestamps epoch ms. — **Reversibility:** one-way — switching DB driver/ORM later means rewriting the schema and migrations.
- **D-07:** Copying is safe when the app is stopped; a hot backup uses `VACUUM INTO` (backup UI itself is v2/DATA-03).

### Secrets & settings
- **D-08:** Secrets (Discogs consumer key/secret, later OAuth tokens — NO Anthropic API key, see D-18) are stored in a gitignored `secrets.json` at the project root (path overridable), NOT inside `data/` — so copying or sharing the data folder never leaks keys. Non-secret settings (model id, folder id) live in the DB `settings` table. Env vars (`DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET`) override saved values.
- **D-09:** Settings page shows each secret masked (e.g. `sk-ant-…a1b2`), an "overridden by env" badge when applicable, and a replace/clear action. No API route ever returns an unmasked secret; secrets are only read in server-only modules (`import 'server-only'`).
- **D-10:** Settings page has a "Claude CLI" card: detects `claude` on PATH, and a "Test Claude" button runs a tiny headless `claude -p` call and reports ok / not installed / not logged in. Discogs test arrives with Phase 3.
- **D-11:** `.gitignore` committed in the first code commit covering `data/`, `secrets.json`, `.env*.local`.

### Job queue & worker
- **D-12:** `jobs` table with lane (`anthropic` | `discogs`), type, payload JSON, status (queued/running/succeeded/failed/cancelled), attempts, `run_after`, unique `dedupe_key`. Atomic claim via `UPDATE … RETURNING`.
- **D-13:** Worker is a singleton on `globalThis`, started from `instrumentation.ts` (nodejs runtime only); HMR reuses the existing worker instead of starting another.
- **D-14:** On boot, jobs left in `running` are reset to `queued` (crash recovery). Failed jobs retry with exponential backoff up to 3 attempts, then stay `failed` for manual retry.
- **D-15:** Phase 1 ships a `noop`/`test` job type plus a dev-only trigger to prove restart and HMR behavior (success criterion 4).

### App shell
- **D-16:** Minimal shell with top nav: Upload, Spines, Settings (Upload/Spines are placeholders until Phase 2). Light/dark follows system.
- **D-17:** A small status indicator in the shell (worker running, queued job count) polled from `GET /api/status`.

### Vision via Claude subscription (user decision 2026-10-18)
- **D-18:** No Anthropic API key and no API billing. All Claude calls go through the user's Claude subscription by spawning the local Claude Code CLI headless (`claude -p --output-format json --json-schema <schema> --model <id> --allowedTools Read`, image passed by file path). The child process env must have `ANTHROPIC_API_KEY` removed so the CLI uses subscription login; Settings shows a warning if that var is set server-side. `@anthropic-ai/sdk` is not a dependency. — **Reversibility:** costly — vision call site, settings UI and cost assumptions depend on it.

### Claude's Discretion
- Exact component layout and styling of settings page and shell.
- Migration tooling details (drizzle-kit generate vs push), test structure, Biome config.
- Port choice beyond the default.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope
- `.planning/PROJECT.md` — vision, constraints (portability, SQLite, one call per photo)
- `.planning/REQUIREMENTS.md` — FOUND-01..04 definitions
- `.planning/ROADMAP.md` §Phase 1 — goal and success criteria

### Research
- `.planning/research/STACK.md` — pinned versions, what not to use (TS 7, Drizzle 1.0 RC, Server Actions for uploads)
- `.planning/research/ARCHITECTURE.md` — component boundaries, project structure, data model, jobs table, worker loop
- `.planning/research/PITFALLS.md` — SQLite native module bundling, HMR double workers, WAL copying, secrets, LAN binding
- `.planning/research/SUMMARY.md` — consolidated recommendations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repository (only `.planning/` and `.claude/CLAUDE.md` exist).

### Established Patterns
- None yet; this phase establishes them (storage/paths authority, server-only secrets, durable jobs).

### Integration Points
- `instrumentation.ts` is the boot hook later phases rely on for the worker and migrations.
- `jobs/handlers/` is where Phase 2 (vision) and Phase 3/4 (Discogs) register handlers.

</code_context>

<specifics>
## Specific Ideas

- User wants the whole thing "very portable" — SQLite preferred, Postgres acceptable but not default.
- Cost sensitivity: worker/queue design must make duplicate paid calls impossible by construction (dedupe keys), which Phase 2 relies on.

</specifics>

<deferred>
## Deferred Ideas

- One-click backup/export of the data folder — v2 (DATA-03).
- Discogs connection test button — Phase 3.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-10-18*
