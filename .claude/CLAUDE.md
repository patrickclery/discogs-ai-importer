<!-- GSD:project-start source:PROJECT.md -->

## Project

**Discogs AI Importer**

A local, portable web app that turns photos of CD shelves into Discogs collection entries. The user drags and drops photos of disc spines; Claude's vision API reads every spine in a photo in a single call; each detected spine is cropped, stored locally (SQLite), matched against the Discogs database, reviewed/corrected by the user, and added to their Discogs collection. Built for a single user (the owner) cataloguing their own physical media.

**Core Value:** Photograph a shelf once and get every disc on it reliably into Discogs — with the spine image always visible next to what the AI read, so mistakes are easy to see and fix.

### Constraints

- **Tech stack**: Next.js (App Router, TypeScript) — user's choice for the UI
- **Storage**: SQLite (preferred for portability); Postgres acceptable but not default
- **Cost**: Exactly one Claude vision call per uploaded photo; no per-spine AI calls; cache by image hash
- **Rate limits**: Discogs 60 req/min authenticated — must queue
- **Portability**: Whole app state (DB + images) lives in the project/data folder and can be copied elsewhere
- **Secrets**: API keys stored locally (.env or local settings), never committed

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Node.js | 24 LTS (>=22 required) | Runtime | `better-sqlite3@13` requires Node >=22, and Next 16 requires >=20.9. Node 24 is the current Active LTS. The system currently has v22.22.1, which works. | HIGH |
| Next.js (App Router) | 16.4.x | UI, route handlers, server actions | The user chose it. 16.x is current: Turbopack is the default bundler, `proxy.ts` replaces `middleware.ts`, and `better-sqlite3` and `sharp` are already on the default `serverExternalPackages` list, so native modules work without config. | HIGH |
| React / React DOM | 19.3.x | UI runtime | Pinned by Next 16 (peer `^19`). | HIGH |
| TypeScript | **6.0.x (pin `~6.0.3`)** | Types | `typescript@latest` is now **7.0.2**, the Go-native compiler. Next 16 only type-checks with TS 7 behind `experimental.useTypeScriptCli`, which is marked experimental and loses the Next-specific error frames. Pin 6.0 to keep `next build` boring. | HIGH |
| SQLite via better-sqlite3 | 13.0.x | Embedded DB, one file under `data/` | A synchronous, in-process driver that is very fast for single-user local work. It is the most battle-tested Drizzle SQLite driver, and the DB is a single portable file. | HIGH |
| Drizzle ORM + drizzle-kit | drizzle-orm 0.45.x, drizzle-kit 0.31.x | Schema, typed queries, migrations | Typed schema in TS, with no codegen step and no separate engine binary (unlike Prisma). `drizzle-kit generate` + `migrate()` at boot keeps the DB file self-upgrading when copied elsewhere. **Stay on 0.45 stable.** 1.0 is at `rc` (1.0.0-rc.4/5) and rewrites the migration engine and relational queries. Adopt it once it ships stable, not now. | HIGH |
| sharp | 0.35.x | EXIF auto-rotate, downscale, crop spines, thumbnails | The standard Node image library (libvips): fast, low-memory, and it ships prebuilt binaries for linux/mac/win. | HIGH |
| @anthropic-ai/sdk | 0.135.x | Claude vision call, one per photo | The official SDK. `client.messages.parse()` + `zodOutputFormat()` returns a validated, typed object. Peer-depends on `zod ^3.25 || ^4`. | HIGH |
| Zod | 4.6.x | Schema for Claude output, forms, settings | One schema drives the Claude structured output, runtime validation and form validation. | HIGH |
| Tailwind CSS | 4.3.x | Styling | v4 is CSS-first config (`@import "tailwindcss"`) and is what the current shadcn CLI scaffolds. | HIGH |
| shadcn/ui (CLI `shadcn`) | CLI 4.22.x | Component source copied into the repo | Owned code, Radix primitives, and Tailwind v4 native. You get Table, Card, Badge, Dialog, Form, Sonner toasts and Skeleton out of the box, which is everything the review UI needs. | HIGH |

### Claude Model and Call Shape

| Decision | Value | Why | Confidence |
|----------|-------|-----|------------|
| Default model | `claude-opus-5-5` ($4 / $20 per MTok) | Current Opus and the default. It is in the high-resolution vision tier (2576 px long edge, up to ~4784 image tokens) and returns **pixel coordinates that map 1:1 to the image you send**, so no scale-factor math. Stronger at bounding-box localization than pre-4.7 models. | HIGH |
| Cheaper option | `claude-sonnet-5-5` ($2 / $10) | Same vision tier and same structured-output support. Make the model a setting and A/B test it on 5-10 real shelf photos before deciding. Do not hard-code a downgrade. | HIGH |
| Do not use | `claude-haiku-4-5`, any date-suffixed or 4.5-and-older IDs | Haiku is capped at 1568 px, which makes small vertical spine text illegible. Older IDs lack 1:1 coordinates. | HIGH |
| Output mechanism | **Structured outputs**: `client.messages.parse({ output_config: { format: zodOutputFormat(SpinesSchema) } })` | Guarantees schema-valid JSON. **Forced tool use (`tool_choice: {type:"tool"}`) returns HTTP 400 on Opus 5.5 / Sonnet 5.5**, so the old "fake tool to get JSON" trick is dead. Use `output_config.format`, not the deprecated `output_format`. | HIGH |
| Thinking / effort | Omit `thinking` (adaptive is always on for Opus 5.5). Set `output_config.effort` explicitly (start at `medium`, try `high` if reads are sloppy). | `{type:"disabled"}` and `budget_tokens` return 400 on Opus 5.5. Its default effort is `medium`. | HIGH |
| Schema constraints | Bounding box as integer pixels `{x, y, width, height}` in the coordinate space of the **normalized image you sent** | Structured outputs reject `minimum`/`maximum`/`minLength`. The TS SDK strips them and validates client-side, so also clamp boxes to the image bounds in code. | HIGH |
| Refusal handling | Check `stop_reason` (`refusal`, `max_tokens`) before trusting `parsed_output`. Add the server-side fallback beta (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`). | `parsed_output` is null or partial on refusal or truncation. Fallbacks reroute instead of failing the photo. | HIGH |
| max_tokens | ~16000, non-streaming | 40 spines x ~100 tokens plus adaptive thinking fits easily. Streaming is unnecessary for a background job. | HIGH |
| Image prep | sharp: `.rotate()` (apply EXIF) then resize to **<=2576 px long edge**, JPEG q~90. Send **that exact buffer** and crop from **that same buffer**. | Coordinates are only valid against the pixels Claude saw. Phone photos at 4000-6000 px would otherwise be resized server-side and the boxes would not line up. | HIGH |
| Cost per photo | ~$0.03-0.08 on Opus 5.5 (~4.8K image tokens + prompt + ~2-5K output incl. thinking) | Estimate. Measure with `count_tokens` and `response.usage`, and store usage per scan in SQLite. | MEDIUM |

### Discogs Integration

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **Thin in-house Discogs client** on native `fetch` | n/a (~150 LOC) | OAuth 1.0a handshake, `/oauth/identity`, `/database/search`, `/releases/{id}`, collection folders, add-to-collection | Discogs OAuth uses the **PLAINTEXT** signature method (signature = `consumer_secret&token_secret` over HTTPS), so no HMAC library is needed. You use about 6 endpoints, and every call must pass through your own rate-limit queue and record `X-Discogs-Ratelimit-Remaining`. A wrapper you own makes that trivial. | MEDIUM |
| Alternative: `@lionralfs/discogs-client` | 4.1.4 (Nov 2025) | Full typed Discogs v2 client with a `DiscogsOAuth` helper and 429 exponential backoff | Use it if you would rather not write the OAuth handshake. Caveats: it has a small user base (~40 stars), its backoff runs independently of your queue (two throttles fighting), and it pulls in `node-fetch@3`. | MEDIUM |
- Rate limit: 60 req/min authenticated, measured as a **moving 60 s window**. Headers: `X-Discogs-Ratelimit`, `X-Discogs-Ratelimit-Used`, `X-Discogs-Ratelimit-Remaining`.
- A descriptive `User-Agent` (e.g. `DiscogsAIImporter/0.1 +contact`) is required. Generic UAs get throttled or blocked.
- OAuth endpoints: `GET https://api.discogs.com/oauth/request_token` -> user visits `https://www.discogs.com/oauth/authorize?oauth_token=...` -> `POST https://api.discogs.com/oauth/access_token` with the verifier. The callback must be `http://localhost:3000/api/discogs/callback`.
- Add to collection: `POST /users/{username}/collection/folders/{folder_id}/releases/{release_id}` (folder 1 = "Uncategorized"; folder 0 "All" is read-only).
- Search params worth using: `q`, `artist`, `release_title`, `catno`, `label`, `barcode`, `format`, `type=release`.

### Background Jobs / Rate Limiting

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| **SQLite `jobs` table** (in-house) | n/a | Durable queue: `scan_photo`, `search_spine`, `add_to_collection` with status, attempts, `run_after`, last_error | Single user, single process: a table plus a poller is all you need, and jobs survive restarts and travel with the DB file. Claim jobs with `UPDATE ... RETURNING` inside a transaction. | HIGH |
| p-queue | 10.0.x | In-process executor with `{ concurrency: 1, intervalCap: 1, interval: 1100 }` for Discogs (~54/min) and a separate `{ concurrency: 2 }` queue for Claude | Simple, maintained (Oct 2026 release), and it supports interval caps. Steady spacing suits Discogs's moving window better than bursts of 60. Also back off when `Remaining` < 5 or on a 429. ESM-only, which is fine in Next 16. | HIGH |
| `instrumentation.ts` `register()` | Next 16 built-in | Starts the worker loop once per server process (guard on `process.env.NEXT_RUNTIME === "nodejs"`) | No separate worker process or second terminal for a local tool. Store the worker on `globalThis` so dev HMR does not spawn duplicates. | MEDIUM (dev HMR double-start needs testing) |
| Status updates to UI | TanStack Query 5.104.x `refetchInterval` (1-2 s while jobs are active) | Polling a `/api/status` route handler is simplest for a local app. Server-Sent Events are an optional later upgrade. | HIGH |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-dropzone | 20.1.x | Drag-and-drop multi-file input | Always. Wrap it in your own shadcn-styled `<Dropzone>` (copy the Kibo UI / shadcn.io dropzone registry component as a starting point). Accept `image/jpeg,image/png,image/webp,image/heic`. |
| @tanstack/react-query | 5.104.x | Client cache, polling job status, mutations (confirm match, retry search) | The review list and status badges. |
| react-hook-form + @hookform/resolvers | 7.90.x / 5.9.x | Edit extracted fields, settings form | The correction UI and the API-key settings page. The shadcn `Form` builds on these. |
| sonner | 2.0.x | Toasts | "Added to Discogs", "Rate limited, retrying". Installed via `shadcn add sonner`. |
| lucide-react | 1.59.x | Icons | The shadcn default. |
| nuqs | 2.10.x | Status filters in the URL (`?status=pending`) | Optional, but cheap and keeps filter state on refresh. |
| @tanstack/react-virtual | 3.14.x | Virtualize the spine list | Only if the list goes past ~500 rows with images. Defer. |
| heic-convert | 2.1.0 | HEIC to JPEG on the server before sharp | **Needed if photos come straight off an iPhone.** sharp's prebuilt binaries have no HEIC decoder and never will (HEVC patents). It is pure JS/WASM: slow, but fine for a few photos. Alternatively, tell the user to set the iPhone camera to "Most Compatible" (JPEG). |
| node:crypto (built-in) | n/a | SHA-256 of the original upload bytes for dedup | Always. Exact-byte hash per the requirements. A perceptual hash (`sharp-phash`) is a possible later addition for "same photo re-exported". |
| nanoid | 6.0.x | IDs for photos and spines (also used as file names) | Optional. Integer autoincrement PKs are also fine in SQLite. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Biome 2.5.x | Lint + format | Next 16 removed `next lint`. Biome is one fast binary with zero ESLint plugin wrangling. (ESLint 10 + `eslint-config-next` also works if you prefer.) |
| Vitest 5.0.x | Unit tests | Test the pure parts: box clamping/cropping math, the PLAINTEXT signer, the job state machine, the Discogs query builder. Record Claude/Discogs fixtures and never hit live APIs in tests. |
| drizzle-kit 0.31.x | `generate` migrations, `studio` to browse the DB | Commit `drizzle/` migrations and run `migrate()` at startup. |
| tsx 4.23.x | Run one-off scripts (re-crop all spines, backfill) | Optional. |

## Installation

# Scaffold (Next 16, App Router, TS, Tailwind v4, Turbopack)

# Core

# Supporting

# Dev

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| better-sqlite3 | `@libsql/client` 0.18 | If you later want Turso cloud sync or embedded replicas. It is async and network-oriented, which adds overhead with no benefit for a local file. |
| better-sqlite3 | `node:sqlite` (built-in) | Once Drizzle 1.0 ships stable with its node-sqlite driver (currently only on beta/rc tags). That would remove the native compile step. Not yet. |
| Drizzle 0.45 | Drizzle 1.0.0-rc | If 1.0 goes stable before Phase 1 starts. Re-check `npm view drizzle-orm dist-tags` at kickoff. |
| Drizzle | Kysely 0.29 | If you want a pure query builder with no schema DSL. You lose drizzle-kit migrations. |
| SQLite jobs table + p-queue | BullMQ 6 | Multi-process or hosted deployments. It needs Redis, which breaks portability. Not for this project. |
| SQLite jobs table + p-queue | `liteque` 0.10 (SQLite-backed queue, used by Karakeep) | If you would rather not hand-write claim/retry logic. It is small and newer, so check the API fits first. |
| Opus 5.5 synchronous | Message Batches API (50% off) | Bulk mode: dump 50 shelf photos at once and accept minutes-to-hours latency. Worth a later phase if cost matters. |
| Route handler upload | Server Action upload | Never for photos: Server Actions default to a **1 MB body limit**, and phone photos are 3-12 MB. |
| shadcn/ui | Mantine, HeroUI | If you want a batteries-included component library over owned source. shadcn is the de facto default for Next + Tailwind. |
| react-dropzone | Native `onDrop` handlers | If you want zero dependencies. react-dropzone handles MIME filtering, folders and keyboard access for free. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `disconnect` (npm) | Legacy callback-style Discogs client: no types, no built-in rate-limit awareness, depends on `oauth-1.0a`, and has had minimal activity for years. | Thin in-house client or `@lionralfs/discogs-client` |
| `discogs-client` (npm, 0.5.1) | Abandoned since 2022. | Same as above |
| `oauth` / `oauth-1.0a` packages | Unneeded. Discogs uses PLAINTEXT signing, which is a header string build. `oauth-1.0a` was last published in 2022. | ~20-line `buildOAuthHeader()` you own and unit-test |
| Prisma | Separate query-engine binary, slower cold start, and its SQLite support is weaker for a portable single file. Overkill here. | Drizzle |
| `sqlite3` (npm, async) | Callback API, slower, and a worse fit with Drizzle. | better-sqlite3 |
| TypeScript 7.0 (`typescript@latest`) | `next build` refuses it without the experimental `useTypeScriptCli` flag. | `typescript@~6.0.3` |
| Forced `tool_choice` to get JSON | Returns 400 on Opus 5.5 / Sonnet 5.5. | `messages.parse` + `output_config.format` |
| `thinking: {type:"enabled", budget_tokens}` / `{type:"disabled"}` | Returns 400 on Opus 5.5. | Omit `thinking` and tune `output_config.effort` |
| Asking Claude for normalized 0-1 or 0-1000 coordinates | Unnecessary on 1:1-pixel models and adds a conversion bug surface. | Integer pixels in the sent image's space |
| Sending raw phone photos to Claude | The API downscales anything over 2576 px, so the boxes stop matching your file. EXIF orientation is also ignored. | sharp normalize (rotate + resize) and persist that buffer |
| BullMQ / Redis / Inngest / Trigger.dev | External services that break "copy the folder and it works". | SQLite jobs table |
| `public/` folder for uploaded images | Not served for files added after build in `next start`. | Route handler streaming from `data/` |

## Stack Patterns by Variant

- Detect `image/heic` or `.heic`, convert with `heic-convert` to JPEG, then the normal sharp pipeline.
- Because sharp prebuilt binaries cannot decode HEIC.
- Still one call per photo (hard constraint). Prompt the user in the UI to photograph shelves in narrower sections.
- Because image tokens cap near ~4784 per image, so a wide shot loses per-spine resolution.
- Switch the model setting to `claude-sonnet-5-5`, then try the Batches API for bulk uploads.
- Because both keep one call per photo and the dedup cache.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16.4 | react@19.3, node>=20.9 | TS 7 only with `experimental.useTypeScriptCli`. Pin TS 6. |
| better-sqlite3@13.0 | node>=22 | Native addon. Prebuilds for current LTS. Rebuild (`npm rebuild better-sqlite3`) after switching Node major. |
| @types/better-sqlite3@9.6 | better-sqlite3@13 | Types lag the major version but the API is stable. |
| drizzle-orm@0.45 | drizzle-kit@0.31, better-sqlite3@13 | Keep orm and kit on matching release lines. Do not mix the 1.0 rc of one with 0.x of the other. |
| @anthropic-ai/sdk@0.135 | zod ^3.25 or ^4 | `zodOutputFormat` lives at `@anthropic-ai/sdk/helpers/zod`. |
| sharp@0.35 | node>=20.9 | Auto-externalized by Next 16. No HEIC in prebuilts. |
| tailwindcss@4.3 | shadcn CLI 4.x | Use `shadcn@latest init`. Old v3 `tailwind.config.js` guides do not apply. |
| p-queue@10 | ESM only | Import only from server code (worker/instrumentation), not client components. |

## Sources

- npm registry (`npm view`, 2026-10-18): versions and engines for next, react, typescript, better-sqlite3, drizzle-orm/kit (dist-tags show 1.0 at rc), @libsql/client, sharp, @anthropic-ai/sdk, zod, p-queue, react-dropzone, tailwindcss, shadcn, @tanstack/*, @lionralfs/discogs-client, disconnect, oauth-1.0a, heic-convert. HIGH
- Bundled Anthropic Claude API reference (cached 2026-09-25): model IDs/pricing, Opus 5.5 breaking changes (no forced tool_choice, no disabled thinking, effort default medium), structured outputs via `messages.parse` + `zodOutputFormat`, JSON schema limits, 2576 px / 1:1 pixel coordinates. HIGH
- [Next.js useTypeScriptCli docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli), [Next.js 16.3 + TS 7 upgrade notes](https://www.achromatic.dev/blog/nextjs-16-3-typescript-7-upgrade): TS 7 requires the experimental flag. HIGH
- [Next.js serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages): better-sqlite3 and sharp are on the default opt-out list. HIGH
- [Drizzle latest releases](https://orm.drizzle.team/docs/latest-releases): 1.0 still pre-stable. HIGH
- [lionralfs/discogs-client README](https://github.com/lionralfs/discogs-client): OAuth class, 429 backoff, TS types. MEDIUM
- [Nango Discogs integration docs](https://nango.dev/docs/api-integrations/discogs.md), [discogs-service OpenAPI](https://repo.rock-n-code.com/rock-n-code/discogs-service/blame/tag/v0.6.0/Sources/DiscogsService/openapi.yaml): moving 60 s window, `X-Discogs-Ratelimit-Remaining`, PLAINTEXT OAuth 1.0a. MEDIUM (official developer page returned 403; verify in Phase research)
- [sharp HEIF/HEIC issue #1105](https://github.com/lovell/sharp/issues/1105): no HEIC in prebuilt binaries. HIGH
- [shadcn.io dropzone](https://www.shadcn.io/components/forms/dropzone), [Kibo UI dropzone](https://21st.dev/@haydenbleasel/components/dropzone.md): react-dropzone-based shadcn components. MEDIUM

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
