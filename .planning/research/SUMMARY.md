# Project Research Summary

**Project:** discogs-ai-importer
**Domain:** Local single-user Next.js app: shelf/spine photo -> Claude vision (one call per photo) -> spine crops -> Discogs match -> collection import
**Researched:** 2026-10-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a shelf scanner with a barcode-app-grade confirmation step. Barcode apps (Discogs app, CLZ) are accurate but go one item at a time. Shelf scanners (TitleEntry, BiblioScan) are fast, but none of them shows the source crop next to the guess. Most of the value is in the review queue, not the AI call. The product has to show every spine crop next to what the AI read, let the user fix it cheaply, and never add anything to Discogs without an explicit confirm.

The recommended build is one Next.js 16 process with SQLite (better-sqlite3 + Drizzle 0.45) as both the store and a durable job queue. An in-process worker starts from `instrumentation.ts` and runs two lanes: Claude (concurrency 2) and Discogs (one serialized gate at about 54 req/min, driven by the rate-limit headers). Images are normalized with sharp (EXIF rotate, then resize to 2576 px or less on the long edge) **before** the Claude call. Crops are cut from that exact buffer, because Opus 5.5 returns pixel coordinates 1:1 with the image it received. Claude output uses structured outputs (`messages.parse` + `zodOutputFormat`). Forced tool use returns HTTP 400 on Opus/Sonnet 5.5. The Discogs client is a thin in-house `fetch` wrapper using OAuth 1.0a PLAINTEXT.

The main risks fall into three groups. Coordinate and orientation mistakes make every crop wrong. Dense shelves cause hallucinated titles and truncated structured output. On the Discogs side, the risks are master vs release ID confusion, non-idempotent POSTs creating duplicate collection instances, and rate-limit queues duplicated by HMR. Each has a known mitigation: pre-resize plus fixtures, a `raw_text`/legibility schema plus a density warning, `stop_reason` branching, typed release IDs, a pre-flight collection check plus idempotency keys, and a `globalThis` singleton. Discogs official docs returned 403 to every researcher, so the Discogs behaviour details have to be verified on a real account.

## Key Findings

### Recommended Stack

Versions were checked against npm on 2026-10-18. See STACK.md for the full list.

**Core technologies:**
- Node 24 LTS (22 or later required): runtime. better-sqlite3 13 needs Node 22 or later.
- Next.js 16.4 App Router + React 19.3: UI and route handlers. sharp and better-sqlite3 are on the default external-packages list.
- TypeScript **pinned ~6.0.3**: TS 7 needs an experimental flag in Next 16.
- better-sqlite3 13 + Drizzle ORM 0.45 / drizzle-kit 0.31: run `migrate()` at boot. **Do not adopt Drizzle 1.0 RC.**
- sharp 0.35: EXIF rotate, resize and crop. Add heic-convert if photos come straight off an iPhone, because sharp has no HEIC decoder.
- @anthropic-ai/sdk 0.135 + Zod 4.6: one schema drives the Claude output, validation and forms.
- Tailwind 4.3 + shadcn/ui, TanStack Query 5 (polling), react-dropzone, react-hook-form, sonner.
- p-queue 10 as the executor only. Durability lives in the SQLite `jobs` table.
- Biome (Next 16 dropped `next lint`), Vitest with recorded fixtures and no live APIs.

**Claude call shape:** default model `claude-opus-5-5`, with `claude-sonnet-5-5` as a setting to A/B test. Never use Haiku (1568 px cap). Omit `thinking`; set `output_config.effort` (start at medium). Set max_tokens to about 16000, non-streaming. Check `stop_reason` before trusting `parsed_output`. Use the server-side fallback beta. Clamp boxes in code, because the schema cannot express min/max. Estimated cost is $0.03-0.08 per photo.

### Expected Features

**Must have (table stakes / v1):**
- Settings for the Anthropic key and Discogs credentials. Discogs OAuth 1.0a connect.
- Drag-and-drop multi-upload with per-photo status, SHA-256 dedup and an explicit re-scan.
- One vision call per photo. The schema has fields, bbox, `kind` (music/film/other), per-field confidence, text orientation and `raw_text`. **The schema must be right from day one**, because changes mean paid re-runs.
- Crop rotated to horizontal next to editable fields. User edits are stored separately from the AI output.
- Throttled Discogs queue, a catno-first search cascade, and candidates with thumbnails.
- Manual search and paste release URL/ID as the escape hatch.
- Explicit confirm, then add to the chosen folder (default 1, Uncategorized; folder 0 is invalid), with an already-in-collection warning.
- Status list with filters (pending/matched/imported/not found/not on Discogs/failed) and per-item retry.

**Should have (v1.x differentiators):**
- Bbox overlay on the photo plus manual "add missed spine". Expect spines to be missed often.
- Keyboard review (j/k/Enter/e/n) and user-initiated bulk accept.
- Smart candidate ranking, undo import (via `instance_id`), CSV/JSON export including film items, adjustable crop.

**Defer (v2+):** shelf location custom field, cost dashboard, film catalogue integration.

**Anti-features (do not build):** auto-add, per-spine second vision pass, live camera mode, a Discogs data-dump mirror, marketplace pricing, websockets/SSE, Discogs-client parity (wantlist, ratings).

### Architecture Approach

Route handlers return in milliseconds. All paid or remote work runs as durable jobs in SQLite, claimed atomically (`UPDATE ... RETURNING`) by a singleton worker on `globalThis`. All files live under a relative DATA_DIR and are served through a guarded `/api/files` route, never `public/`.

**Major components:**
1. **Upload / file / status routes**: ingest and dedup, file streaming, and a single-aggregate status endpoint for polling.
2. **jobs/queue + worker loop**: enqueue with a dedupe key, claim/complete/fail with backoff, crash recovery.
3. **images/ + vision/**: normalize, pre-resize, exactly one Messages call, **persist the raw response before parsing**, map boxes, crop.
4. **discogs/client + gate**: the single choke point for all Discogs HTTP. Signs requests, reads `X-Discogs-Ratelimit-*`, handles 429/401.
5. **discogs/search + score, discogs/collection**: query cascade, local ranking, idempotent add that records `instance_id`.
6. **domain/spine-state**: the *only* place spine status changes, enforced by a transition table.
7. **settings**: env overrides the DB. Secrets are masked in the API.

### Critical Pitfalls

1. **Wrong coordinate space**: if Claude resizes server-side, the boxes do not match. Pre-resize to 2576 px or less, send and crop from the same buffer, set `oversized_image:"error"`, and use overlay fixture tests.
2. **EXIF orientation mismatch**: apply `.rotate()` before everything. Use an EXIF-6 fixture.
3. **Dense-shelf hallucination and truncation**: include `raw_text`/legibility in the schema, warn when a photo is dense, branch on `stop_reason` (max_tokens/refusal), and test with a 50-spine photo.
4. **Master vs release ID**: search with `type=release` and keep the two IDs as separate types.
5. **Duplicate collection adds**: POST is not idempotent. Use a pre-flight collection check, idempotent job keys, and a kill-mid-POST test. Also keep the rate-limit queue a `globalThis` singleton so HMR or extra tabs do not double it.

Also important: portability (WAL, so use `VACUUM INTO` for backups, and native-module rebuilds), secrets in the data folder, the client bundle or on the LAN (bind to 127.0.0.1, add `.gitignore` at the first commit), and hash/re-scan semantics (re-upload makes 0 API calls; re-scan keeps user overrides).

## Implications for Roadmap

Five phases. ARCHITECTURE and PITFALLS agree on this order.

### Phase 1: Foundation
**Rationale:** Everything depends on storage, settings and the job queue. Prove the worker singleton survives HMR before any paid call exists.
**Delivers:** Next 16 scaffold, DATA_DIR layout, Drizzle schema with migrations at boot, WAL pragmas, settings with env precedence and masked secrets, `/api/files`, a jobs table with enqueue/claim/recover, an idle worker from `instrumentation.ts`, a 127.0.0.1 bind and `.gitignore`.
**Avoids:** Pitfalls 7 (singleton groundwork), 8 and 9.

### Phase 2: Ingest + Vision + Crops
**Rationale:** Delivers the core value ("see what the AI read next to the spine") with no Discogs dependency. Freeze the schema here.
**Delivers:** Upload/dropzone, SHA-256 dedup, explicit re-scan, EXIF normalize and pre-resize, a single structured-output call with persist-then-parse, box clamping and crops rotated horizontal, a spine list with crop | AI text | editable `user_*` fields, and per-photo status.
**Features:** upload, dedup, vision schema (including `kind`, confidence, orientation, `raw_text`), crops, editable fields.
**Avoids:** Pitfalls 1, 2, 3, 4 and 10.

### Phase 3: Discogs Connect + Search
**Rationale:** The gate must exist before any Discogs call site. Search input is just text, so this phase can overlap with Phase 2.
**Delivers:** A thin client with an auth seam (personal token first, then OAuth 1.0a start/callback/identity), a header-driven gate, search jobs auto-enqueued after vision (skipping `kind=film`), a catno-first cascade, candidate scoring and cached thumbnails, manual search and paste-URL, and re-search on edit (`search_generation`).
**Avoids:** Pitfalls 5 and 7.

### Phase 4: Review + Import + State Machine
**Rationale:** Needs candidates and write-capable OAuth tokens.
**Delivers:** The transition table, the confirm action, `collection_add` jobs with idempotency guards, an already-in-collection warning, folder choice, not-on-Discogs/dismiss/retry, and status filters and badges.
**Avoids:** Pitfalls 6, 5 (UI side) and 3 (review surfacing).

### Phase 5: Hardening, Portability + v1.x Review Speed
**Rationale:** Polish and recovery, then the differentiators that real shelf sessions prove are needed.
**Delivers:** Re-scan supersede rules, `VACUUM INTO` backup/export, Discogs lane pause, a 401 reconnect banner, progress/ETA, crash-recovery checks for `importing`, and a fresh-clone restore test. Then, as v1.x: bbox overlay with manual missed spine, keyboard review and bulk accept, undo import, CSV export. The roadmapper may split these v1.x items into a Phase 6.

### Phase Ordering Rationale

- Schema and coordinate correctness come first, because mistakes there cost paid re-runs.
- The Discogs gate comes before any search or add, so call sites never need rewriting.
- Import comes after search because confirming needs candidates and tokens.
- The v1.x features wait on evidence from real photos (miss rate, review speed).

### Research Flags

Needs research (`/gsd-plan-phase --research-phase`):
- **Phase 2:** prompt and schema design, Opus vs Sonnet and effort level, dense-shelf accuracy, and whether full photo plus tiles in one request helps. Start with a spike on 3-5 real CD/DVD shelf photos.
- **Phase 3:** `user_data.in_collection` in search results, thumbnail hotlinking, per-request `oauth_callback` override, personal-token write access, and 429 `Retry-After`.
- **Phase 4 (light):** folder-0 POST behaviour and duplicate-instance creation, verified on a real account.

Standard patterns (skip research): Phases 1 and 5.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm-verified. Claude details come from the first-party reference. The Discogs client choice is MEDIUM. |
| Features | MEDIUM | Competitor data comes from vendor listings. Discogs flags were not verified. |
| Architecture | HIGH | Standard single-process patterns. HMR double-start still needs testing. |
| Pitfalls | MEDIUM-HIGH | Claude facts are official, and Discogs search/headers were live-probed. OAuth and folder details are secondary. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Discogs official docs were unreachable (403).** Verify OAuth, the folder, duplicate and 429 behaviour on a real account before Phase 3/4 plans are finalized.
- **Real spine accuracy is unknown.** Run a Phase 2 spike that decides the model, effort level, spines-per-photo guidance and whether tiling is needed.
- **Hash target conflict:** FEATURES says hash the normalized bytes; STACK and ARCHITECTURE say hash the raw upload bytes. Recommendation: hash the raw bytes (cheaper, and dedup happens before processing).
- **Output mechanism wording:** FEATURES mentions "tool-use schema". That is wrong for Opus 5.5. Use `output_config.format` structured outputs.
- **The `next dev` bind address (0.0.0.0)** needs confirming on the installed version.
- **iPhone HEIC:** decide whether to use heic-convert or a "Most Compatible" instruction.

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view`, 2026-10-18): all package versions and engines
- Anthropic Claude API reference / platform.claude.com: models, structured outputs, vision coordinates, Opus 5.5 breaking changes
- Next.js docs: serverExternalPackages, useTypeScriptCli. Drizzle release notes. sharp issue #1105 (HEIC)
- Live `curl` probes of api.discogs.com: search, rate-limit headers, thumbnails, pagination

### Secondary (MEDIUM confidence)
- lionralfs/discogs-client README, Nango Discogs docs, discogs-service OpenAPI: OAuth PLAINTEXT, rate-limit window
- Competitor listings: CLZ, Discogs app, TitleEntry, BiblioScan, SnapVinyl, Common Ground

### Tertiary (LOW confidence)
- Per-user collection flags in search results (from knowledge of the API, not verified)

---
*Research completed: 2026-10-18*
*Ready for roadmap: yes*
