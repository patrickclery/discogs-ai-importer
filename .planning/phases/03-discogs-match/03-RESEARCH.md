# Phase 3: Discogs Match - Research

**Researched:** 2026-10-20
**Domain:** Discogs API v2 (OAuth 1.0a PLAINTEXT, database search, releases), durable rate-limited job lane, candidate UI
**Confidence:** HIGH for the codebase seams and the unauthenticated API behavior (read and probed live this session). MEDIUM for the OAuth handshake, which follows the official docs (read via an archive.org copy) but can't be run end to end without the owner's account.

## Summary

The codebase already has everything this phase builds on. There is a durable `jobs` table with a `discogs` lane at concurrency 1, dedupe keys, `run_after`, and attempt-guarded writes. Secrets live in `secrets.json`. The card has `statusSlot` and `footer` props, a JSON-only mutation convention sits behind the `src/proxy.ts` Origin guard, `/api/files` has an allowlist, and verify scripts use fake external tools. Phase 3 adds an in-house Discogs client on native `fetch`, two job handlers (`search_spine`, `fetch_release`), two tables (searches and candidates), a set of `/api/discogs/*` and `/api/spines/{id}/*` routes, and UI in the existing slots. No npm packages are needed.

Live probes against `api.discogs.com` this session settled most of the open "verify on a real account" items:
- A 429 carries **no `Retry-After` header** and has an empty body.
- The window is a true moving window: one slot came back 6 s after the 429.
- `X-Discogs-Ratelimit-Used` is one counter per IP. It reports a cap of 25 for unsigned requests and 60 for OAuth-signed ones.
- Thumbnail fetches from `i.discogs.com` need no auth or referrer and **did not increment** the API rate-limit counter.
- Unauthenticated search returns empty `thumb`/`cover_image`, but `/releases/{id}` returns a `thumb` even unauthenticated.
- Catalog-number search is fuzzy: `DGCD-24425`, `DGCD 24425` and `dgcd-24425` all hit, so the "exact catno" pin must compare normalized strings.
- Release IDs and master IDs are **separate number spaces that collide**: `/releases/13814` is a Billy Nasty record, while master 13814 is Nevermind.

Three code facts constrain the design most:
1. `jobs.dedupe_key` is UNIQUE forever (`ON CONFLICT(dedupe_key) DO NOTHING`, with no partial index). A retry or "Search again" with the same key silently returns the old failed job, so explicit re-runs need a fresh key.
2. The worker has no way to "reschedule without spending an attempt". A 429 needs a new `deferJob()` queue primitive and a worker branch for it.
3. The orphan footer is the **fallback** for `footer` (`footer ?? <OrphanFooter/>`). Always passing a candidates footer would silently remove the Re-attach/Dismiss actions.

**Primary recommendation:**
- Build `src/server/discogs/` with four pieces: a PLAINTEXT signer, one process-wide pacing gate on `globalThis` (interval derived from `X-Discogs-Ratelimit`, slowdown under 10% headroom, lane-wide pause on 429), a typed client, and a search cascade.
- Drive every non-interactive call through `search_spine`/`fetch_release` jobs on the `discogs` lane.
- Add `deferJob()` so a 429 never spends an attempt.
- Store each search as its own row, keyed `search:<searchId>`, so retries are never deduped away.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth handshake (request_token, authorize redirect, callback, access_token) | API / Backend (route handlers) | Browser (top-level navigation to discogs.com) | Consumer and token secrets never leave the server (D-02). The browser only follows redirects. |
| Token storage | Storage (`secrets.json`, outside DATA_DIR) | — | Phase 1 D-08: secrets are never in app.db or the browser |
| Rate-limit pacing and 429 pause | API / Backend (process-wide gate on `globalThis`) | Database (`jobs.run_after`) | One process holds the worker lease and serves routes. Durable deferral lives in the jobs table. |
| Auto, again and manual searches, release lookup | API / Backend (job handlers, `discogs` lane) | Database (searches and candidates tables) | Never run inline in a route (established pattern). Survives restarts. |
| Candidate ranking (catno pin, manual pin) | API / Backend (pure function) | — | Deterministic and unit-testable |
| Thumbnail cache | API / Backend (GET route, fetch on miss) | Storage (`data/discogs-thumbs/`) | Portability and offline use (D-13). Host-allowlisted fetch. |
| Search state, candidate list, dialog | Browser (TanStack Query polling) | API (`/api/spines`, `/api/status`) | Existing polling pattern |
| Release URL/ID parsing | Shared (`src/lib`, client-safe) | API re-validates | The client can show "That's a master…" instantly; the server is authoritative |

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All decisions below were auto-selected (`--auto`) using the recommended option. Review them before planning if any look wrong.

#### Connecting Discogs
- **D-01:** The Settings page gets a "Discogs" card. It holds the existing consumer key/secret fields plus a "Connect Discogs" button that starts the OAuth 1.0a PLAINTEXT flow (request_token, then the discogs.com authorize page, then a callback, then access_token). After connecting, the card shows "Connected as {username}" (from `/oauth/identity`) with Disconnect and "Test connection" buttons. The "Test connection" button fulfils the Phase 1 D-10 promise.
- **D-02:** The OAuth access token and secret are stored in `secrets.json` next to the consumer credentials (Phase 1 D-08). They are never sent to the browser, which only sees the username. Disconnect deletes them locally. Discogs has no revoke endpoint.
- **D-03:** The callback URL is built from the incoming request's own origin plus `/api/discogs/callback`, so non-default ports (the owner runs on 3001) work. The pending request-token secret is held server-side and keyed by `oauth_token`, with a short expiry.
- **D-04:** Every Discogs request sends `User-Agent: DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer`. Searching requires a connection, because unauthenticated search returns empty thumbnails. With no connection, spines show "Connect Discogs to find matches" with a link to Settings.

#### Throttled queue
- **D-05:** All Discogs HTTP goes through one in-house client on native `fetch` (no Discogs npm client). The client is driven by the existing durable `jobs` table on the `discogs` lane (concurrency 1). Pacing is about 1 request per 1.1 s. It also adapts to `X-Discogs-Ratelimit-Remaining`: it slows down below about 10% headroom.
- **D-06:** A 429 never loses work. The job is rescheduled via `run_after` using `Retry-After` when present, or 60 s otherwise. A 429 does not count as a failed attempt. Other errors (network, 5xx) retry with the existing backoff up to 3 attempts, then the spine shows "Search failed" with a Retry action.
- **D-07:** The header status indicator (Phase 1 D-17) also shows the Discogs backlog, e.g. "Searching Discogs · 34 left", so a large batch's progress is visible.

#### Automatic search
- **D-08:** When a scan run finishes, one `search_spine` job is enqueued for each active spine whose `media_kind` is `cd`. It is deduped by spine id plus a hash of the search inputs. Orphaned and superseded spines are not auto-searched. A re-scan only re-enqueues spines whose fields changed.
- **D-09:** The search cascade stops at the first stage that returns results. All stages use `type=release` and `format=CD` (Project decision: CDs only), and never masters.
  1. `catno` (when a catalog number exists)
  2. `artist` + `release_title`
  3. free text `q` from the raw text
- **D-10:** The top 10 results of the winning stage are stored as the spine's candidates. Each stores: Discogs release id, title, artist, year, country, labels, catno, formats, thumb URL, and which stage found it. Results are shown in Discogs order. An exact catno match is pinned first and tagged "Catalog number match". More ranking is deferred.
- **D-11:** Each spine shows a search state in the card's status slot (Phase 2 D-11): Not searched, Queued, Searching, N candidates, No matches, or Search failed.

#### Candidates UI
- **D-12:** Candidates render in the spine card's footer slot (Phase 2 D-11) as a compact list: thumbnail (about 64 px), "Artist – Title", then year · country · label · catno · format, plus an external link to the release on discogs.com. The first 3 are shown, with "Show all 10" to expand. There is no select/confirm control in Phase 3; that arrives in Phase 4.
- **D-13:** Thumbnails are fetched server-side on first display and cached under `data/discogs-thumbs/` (keyed by URL hash), then served through the existing `/api/files` route. That route's allowlist is extended. Caching keeps the app portable and offline, and avoids repeat hotlinking.

#### Re-search, manual search, paste ID
- **D-14:** Editing a field does not auto-search. When fields changed since the last search, the state shows "Fields changed since last search" and a "Search again" button that enqueues a new search with the current values.
- **D-15:** Each card has a "Search Discogs…" action that opens a dialog with one input. Free text runs a manual search, shown in the dialog through the same queue. A value that parses as a release URL (`discogs.com/release/{id}…`) or bare numeric ID fetches `/releases/{id}`. Either way, the release the owner picks is added to the spine's candidates as "Added manually" and pinned to the top. Master URLs are rejected with "That's a master, not a release — pick a specific version".
- **D-16:** Manual and auto candidates live in one candidate table with a `source` column (`auto` | `manual`). A new auto search replaces only `auto` rows.

### Claude's Discretion
- Exact schema and table names (e.g. `discogs_searches`, `spine_candidates`) and migration layout.
- The OAuth pending-token store (DB row vs memory with expiry).
- Pacing constants and the header-adaptive algorithm details, within D-05/D-06.
- Visual details of the candidate list and dialog, within the existing UI-SPEC tokens.

### Deferred Ideas (OUT OF SCOPE)
- Smart candidate ranking beyond the catno pin (format/label/country scoring): FEATURES P2.
- Keyboard-driven review and bulk accept: Phase 4 or later.
- Barcode search (spines rarely show barcodes).

### Specifics (from CONTEXT.md)
- The owner runs the prod server on port 3001 (port 3000 is taken by Grafana). OAuth callbacks must not assume 3000.
- About 230 spines are already scanned across 3 photos. The first connect should backfill searches for all existing active CD spines (about 230 requests, about 4.5 min at the pacing above). [VERIFIED: data/app.db read-only query this session: `('active', 'cd', 237), ('superseded', 'cd', 1)`]
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | Connect a Discogs account via OAuth 1.0a and see which account is connected | § OAuth flow (Pattern 1), § Code Examples: PLAINTEXT header. Callback built from the Host header. Pending store in memory with a 15-min expiry. `/oauth/identity` gives the username. Assumption A1 (per-request callback) has a manual-verifier fallback. |
| DISC-02 | All Discogs requests go through a single throttled queue (rate-limit headers, back off on 429) | § Pattern 2 (pacing gate), § Pattern 3 (`deferJob` + lane pause). Live 429 probe: no Retry-After, so use 60 s. Interval = 60000/(limit×0.9). |
| DISC-03 | Auto search after extraction: catno, then artist+title+format, then free text | § Pattern 4 (cascade) and § Pattern 5 (enqueue points: `persistRunResult` transaction, connect backfill, maintenance hook). Live probe confirms catno search quality on real spine catnos. |
| DISC-04 | Candidates show thumbnail, year, country, label, catno, format | § Search result shape (verified live), § Pattern 6 (thumb cache), DTO shape |
| DISC-05 | Re-run search after editing fields | § Input hash and "fields changed" derivation. "Search again" creates a new search row with a fresh dedupe key (Pitfall 1). |
| DISC-06 | Manual search or paste release URL/ID | § Pattern 7 (`parseDiscogsRef`), manual search job storing results on the search row, pick-from-stored-results route. Master/release ID collision (Pitfall 5). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Next.js 16 App Router + TypeScript 6.0 (pinned). `proxy.ts`, not middleware. [VERIFIED: package.json `"next": "16.4.2"`, `"typescript": "6.0.3"`]
- SQLite via better-sqlite3 + Drizzle 0.45. Migrations generated by `drizzle-kit generate` (`pnpm db:generate`) and committed under `drizzle/`. [VERIFIED: drizzle/meta/_journal.json entries `0000_init`, `0001_shelf_scan`]
- Discogs: 60 req/min authenticated, which **must queue**. A descriptive User-Agent is required. Use a thin in-house client. `disconnect`, `discogs-client`, `oauth`/`oauth-1.0a` and `@lionralfs/discogs-client` are out by D-05.
- Secrets stored locally, never committed, never sent to the browser.
- Portability: all app state lives in the data folder (DB + images). The thumbnail cache must live under DATA_DIR.
- Biome for lint/format (`pnpm lint`). Vitest for unit tests. **Never hit live APIs in tests** (CLAUDE.md "Record Claude/Discogs fixtures and never hit live APIs in tests").
- Do not use `public/` for runtime images. Stream them from `data/` through a route handler.
- GSD workflow enforcement: edits go through GSD commands.
- Raw SQL in this codebase uses single-quoted literals (better-sqlite3 built with DQS=0) and named parameters (`@name`, never `?1`). [VERIFIED: src/server/jobs/queue.ts:49 "better-sqlite3 is built with DQS=0: string literals must be single-quoted."; src/server/scan/merge.ts:13 "Named parameters (better-sqlite3 rejects ?1)."]

## Standard Stack

### Core (all already installed; no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| native `fetch` (undici, Node 24) | Node v24.22.0 | All Discogs HTTP | D-05. `AbortSignal.any` + `AbortSignal.timeout` for per-request timeouts. [VERIFIED: `node --version` → v24.22.0] |
| `node:crypto` | built-in | OAuth nonce (`randomBytes`), thumb cache key (`sha256` of the URL), search input hash | Already used in secrets.ts |
| zod | 4.6.7 | Validate Discogs JSON (search, release, identity), route bodies, job payloads | Existing pattern (`ScanPhotoPayload`, route `Body` schemas) [VERIFIED: package.json] |
| sharp | 0.35.5 | Re-encode downloaded thumbnails to webp (sanitize and cap dimensions) | Already used for crops and thumbs [VERIFIED: package.json] |
| better-sqlite3 / drizzle-orm / drizzle-kit | 13.0.3 / 0.45.4 / 0.31.11 | New tables + migration `0002_*` | [VERIFIED: package.json] |
| @tanstack/react-query | 5.104.2 | Polling search state, manual-search dialog polling | [VERIFIED: package.json] |
| radix-ui (shadcn) | 1.8.1 | Dialog (exists), optional `collapsible` for "Show all 10" | UI-SPEC 02 reserved `collapsible` for Phase 3 [VERIFIED: 02-UI-SPEC.md:73 "Reserved for later phases (do NOT install in Phase 2): `collapsible` (Phase 3 fills the card footer)"] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-house client | `@lionralfs/discogs-client` | Rejected by D-05: its own backoff fights the queue. |
| Memory pending-token store | DB row in `settings` | The settings table must never hold secrets (Phase 1 D-08), and the request-token secret is a secret. Memory with expiry is enough: a restart mid-flow just means clicking Connect again. |
| p-queue for pacing | In-house gate (about 40 LOC) | p-queue is not installed, and the lane is already concurrency 1. A gate that understands rate-limit headers and pause-until is simpler than adapting p-queue's `intervalCap`. |

**Installation:** none.

## Package Legitimacy Audit

This phase installs no external npm packages. Adding the shadcn `collapsible` component copies source into `src/components/ui/` and uses the already-installed `radix-ui` 1.8.1. If the planner adds it via `pnpm dlx shadcn@4.22.1 add collapsible`, the CLI is already an approved devDependency (STATE.md: "Owner approved cn@0.5.0 and shadcn@4.22.1 (dev)").

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Discogs API Facts (live-probed this session)

All probes were unauthenticated, from the owner's machine, with the project User-Agent, on 2026-10-20. The owner's credentials were never used.

### Rate limiting
- Headers on every `api.discogs.com` response: `x-discogs-ratelimit`, `x-discogs-ratelimit-remaining`, `x-discogs-ratelimit-used`. [VERIFIED: curl probe]
- An unsigned request reports `x-discogs-ratelimit: 25`. A request carrying an OAuth header (even an invalid one) reported `x-discogs-ratelimit: 60` with `remaining: 49, used: 11`, so **one per-IP counter is shared, and the cap depends on authentication**. [VERIFIED: curl probe]
- The 429 response is `HTTP/2 429`, `content-type: application/json`, with a 1-byte body and **no `Retry-After` header**. [VERIFIED: curl probe; headers `x-discogs-ratelimit: 25`, `x-discogs-ratelimit-remaining: 0`, `x-discogs-ratelimit-used: 25`] Authenticated 429s were not probed (A3).
- Recovery is gradual: 6 s after the 429, a request succeeded with `remaining: 1, used: 24`. [VERIFIED: curl probe] The official docs say: "Our rate limiting tracks your requests using a moving average over a 60 second window. If no requests are made in 60 seconds, your window will reset." [CITED: web.archive.org/web/20261013233149/https://www.discogs.com/developers/]
- The official docs do not mention `Retry-After` at all. [VERIFIED: archived docs text search for "Retry-After" returned no hits]

### Search (`GET /database/search`)
- Docs: "Authentication (as any user) is required." Params include `q, type, title, release_title, credit, artist, anv, label, genre, style, country, year, format, catno, barcode, track…`. [CITED: archived developers page]
- In practice, unauthenticated search returns 200 with `"thumb": ""` and `"cover_image": ""`. [VERIFIED: curl probe]
- Result shape (verbatim keys from probe): `country, year (string, can be missing), format (string[]), label (string[], can repeat e.g. ['DGC','DGC']), type, genre, style, id (number), barcode (string[]), master_id (number), master_url, uri ("/release/11452396-Nirvana-Nevermind", relative), catno (string), title ("Nirvana - Nevermind", combined), thumb, cover_image, resource_url, community, format_quantity, formats ([{name, qty, text?, descriptions?}])`. [VERIFIED: curl probe]
- `title` is the combined "Artist - Title" and keeps disambiguation suffixes: `"Don Williams (2) - The Best Of Don Williams"`. [VERIFIED: curl probe]
- `catno` matching is fuzzy and normalizes punctuation and case. `catno=DGCD-24425` returned results whose `catno` is `DGCD24425`, `CDGCD 24425 *` and `DGC DGCD-24425`. [VERIFIED: curl probe] A real spine value like `CK 44384` gave 6 results, 5 of them exact after normalization. `314 536 003-2` matched `314-536 003-2`. `TMI405` gave 0, so the cascade falls through. [VERIFIED: curl probe on catnos read from data/app.db]
- `artist=Sigur Ros&release_title=Agaetis Byrjun` matches `Sigur Rós - Ágætis Byrjun`: diacritics are folded. [VERIFIED: curl probe]
- Result order varies between near-identical queries, so tests must not depend on live ordering. [VERIFIED: probes returned different top results for stage-2 vs stage-3 Nevermind queries]
- No results: `{"pagination": {... "items": 0}, "results": []}` with status 200. [VERIFIED: curl probe]

### Release (`GET /releases/{id}`)
- Keys (verbatim): `artists, artists_sort, blocked_from_sale, community, companies, country, data_quality, date_added, date_changed, estimated_weight, extraartists, format_quantity, formats, genres, id, identifiers, images, is_offensive, labels, lowest_price, master_id, master_url, notes, num_for_sale, released, released_formatted, resource_url, series, status, styles, thumb, title, tracklist, uri, videos, year`. [VERIFIED: curl probe of /releases/1820636]
- `title` is the title only (`'Nevermind'`), `year` is a number (`1991`), `uri` is absolute (`https://www.discogs.com/release/1820636-Nirvana-Nevermind`), `labels: [{name, catno, entity_type_name}]`, `artists: [{name, anv, join}]`. `thumb` is present **even unauthenticated**. [VERIFIED: curl probe]
- Missing release: HTTP 404 `{"message":"That release does not exist or may have been deleted."}`. [VERIFIED: curl probe of /releases/999999999999]
- **ID collision:** `/releases/13814` is "Billy Nasty - Race Data ETA" (1997), while 13814 is also the Nevermind **master** id. A pasted master number silently fetches an unrelated release. [VERIFIED: curl probe]

### Images (`i.discogs.com`)
- A thumb URL (`https://i.discogs.com/…/h:150/w:150/….jpeg`) returned 200 `image/jpeg`, 2535 bytes, 150x149, `cache-control: public, max-age=31536000`. It works with no User-Agent and with a foreign Referer. [VERIFIED: curl probe]
- `i.discogs.com` responses carry no `x-discogs-ratelimit*` headers, and three thumbnail fetches did not move `x-discogs-ratelimit-used` on the next API call (6, then 9 after exactly 3 API calls). [VERIFIED: curl probe] This contradicts the docs, which say "Image requests require authentication and are subject to rate limiting" [CITED: archived developers page]. Treat thumbnails as outside the 60/min budget, but still fetch them politely (small concurrency, cached forever).

### OAuth endpoints
- Request token: `GET https://api.discogs.com/oauth/request_token` with headers `Content-Type: application/x-www-form-urlencoded`, `Authorization: OAuth oauth_consumer_key="…", oauth_nonce="…", oauth_signature="your_consumer_secret&", oauth_signature_method="PLAINTEXT", oauth_timestamp="…", oauth_callback="your_callback"`, `User-Agent`. The response holds `oauth_token`, `oauth_token_secret` and `oauth_callback_confirmed`. [CITED: archived developers page]
- Authorize: `https://discogs.com/oauth/authorize?oauth_token=<request token>`. "If you added a callback URL to your Discogs application registration, the user will be redirected to that URL, and you can capture their verifier." [CITED: archived developers page] (See A1: whether a per-request `oauth_callback` overrides the registered one is not stated.)
- Access token: `POST https://api.discogs.com/oauth/access_token` with `oauth_consumer_key, oauth_nonce, oauth_token, oauth_signature="your_consumer_secret&", oauth_signature_method="PLAINTEXT", oauth_timestamp, oauth_verifier`. "If the OAuth access token is not created within 15 minutes of when you receive the OAuth request token, your OAuth request token and verifier will expire." Access tokens "do not expire (unless the user revokes access from your app)". [CITED: archived developers page]
  - Note: the docs print the access-token signature as `consumer_secret&`. RFC 5849 PLAINTEXT is `consumer_secret&token_secret`, and every client library sends the request-token secret here. Send `consumer_secret&request_token_secret`. [ASSUMED, A2]
- Identity: `GET /oauth/identity` returns `{ "id": 1, "username": "example", "resource_url": … }`. [CITED: archived developers page] Unauthenticated, it returns 401 `{"message":"You must authenticate to access this resource."}`. [VERIFIED: curl probe]
- Error shapes: a bogus consumer key returns **401** with `content-type: application/x-www-form-urlencoded`, body `Invalid consumer.` (plain text, not JSON). A request_token with no Authorization header returns **500** JSON `{"message":"An internal server error occurred (code: …)"}`. [VERIFIED: curl probe] The parser must not assume JSON on OAuth endpoints.

## Architecture Patterns

### System Architecture Diagram

```
                 ┌──────────── Browser (127.0.0.1/localhost:3001) ────────────┐
 Settings card ──POST /api/discogs/connect (JSON)──┐                          │
     ▲                                             ▼                          │
     │                      [route] signer → gate.acquire → GET request_token │
     │                      pending.set(oauth_token → {secret, exp 15m})      │
     │   ◄── {authorizeUrl} ─────────────────────────┘                        │
     │   window.location = discogs.com/oauth/authorize?oauth_token=…          │
     │                                   │ owner approves                     │
     │   GET /api/discogs/callback?oauth_token&oauth_verifier  ◄──────────────┘
     │        [route] pending.take(token) ─(missing/expired)→ 303 /settings?discogs=expired
     │                → POST access_token → GET /oauth/identity
     │                → secrets.json {token, secret, username}
     │                → enqueueMissingSearches()  (backfill ~237 jobs)
     └──── 303 /settings?discogs=connected

 Scan run done ── persistRunResult tx ──► enqueue search_spine for new or changed CD spines
 Lease tick ───── maintenance hook ─────► enqueueMissingSearches() (connected only; idempotent)
 "Search again"/Retry/manual/paste ─POST /api/spines/{id}/search─► new discogs_searches row + job

 jobs table (lane=discogs, concurrency 1)
     │ runLane: if gate.pausedUntil > now → sleep; else claimNext
     ▼
 search_spine handler ── spine still active? ── connected? ──► cascade:
     catno → artist+release_title → q   (each: gate.acquire → fetch → gate.observe(headers))
        │ 429 → gate.pause(Retry-After ?? 60s) → throw JobDeferredError → worker deferJob()
        │ 5xx/network → throw → failOrRetry (2s, 4s, then failed)
        │ 401 → search row 'auth_failed' (no retry)
        ▼
 discogs_searches row (done | no_match | failed) + discogs_candidates (replace auto rows)

 GET /api/spines ─► SpineDto.discogs {state, count, fieldsChanged, top 3}
 GET /api/spines/{id}/candidates ─► all candidates (Show all 10)
 GET /api/discogs/thumb/{candidateId} ─► cache hit: stream data/discogs-thumbs/<sha>.webp
                                      └► miss: fetch https://i.discogs.com/… (host allowlist), sharp → webp, write atomically
 GET /api/status ─► jobs counts + discogs {connected, backlog, pausedUntil}
```

### Recommended Project Structure

```
src/server/discogs/
├── oauth.ts          # percentEncode, buildOAuthHeader (PLAINTEXT), parseFormBody
├── gate.ts           # process-wide pacing/pause gate on globalThis (acquire, observe, pause, pausedUntil)
├── client.ts         # discogsFetch(): UA, auth header, timeout, gate, error classification
├── auth.ts           # getDiscogsAuth/saveDiscogsAuth/clearDiscogsAuth (secrets.json), pending-token Map
├── search.ts         # buildStages(inputs), runCascade(), toCandidate(result), rankCandidates()
├── inputs.ts         # searchInputs(spineFields) + inputHash()
├── store.ts          # searches/candidates SQL (create search, finish, replace auto candidates)
├── enqueue.ts        # enqueueSearch(), enqueueMissingSearches(), enqueueChangedAfterRescan()
└── thumbs.ts         # ensureThumb(candidateId) with host allowlist, in-flight dedupe
src/server/jobs/handlers/search-spine.ts, fetch-release.ts
src/lib/discogs-ref.ts        # parseDiscogsRef(input) → release | master | text (client-safe)
src/lib/discogs-types.ts      # DTOs and state enums (client-safe)
src/app/api/discogs/{connect,callback,disconnect,test}/route.ts
src/app/api/discogs/thumb/[id]/route.ts
src/app/api/discogs/searches/[id]/route.ts       # manual-search dialog polling
src/app/api/spines/[id]/search/route.ts          # POST: again | manual text | release ref
src/app/api/spines/[id]/candidates/route.ts      # GET all; POST add-manual {searchId, releaseId}
src/components/discogs-card.tsx, discogs-candidates.tsx, discogs-search-dialog.tsx, search-state-badge.tsx
drizzle/0002_discogs_match.sql (generated)
scripts/verify-discogs.ts + test/fixtures/fake-discogs.mjs (node:http fake API, images, authorize)
```

### Pattern 1: OAuth 1.0a PLAINTEXT, entirely server-side
**What:** `connect` (POST, JSON) gets a request token and stores `{secret, callback, expiresAt}` in a `globalThis` Map keyed by `oauth_token`. It replaces any earlier pending entry, keeping one in flight. It returns `{ authorizeUrl }`. `callback` (GET, top-level navigation from discogs.com, which the proxy allows because it is a GET) takes the pending entry and deletes it, exchanges for the access token, calls `/oauth/identity`, saves `{token, secret, username}` to secrets.json, then backfills searches and returns a 303 to a **fixed** path (`/settings?discogs=connected|denied|expired|error`).
**Callback URL:** `` `http://${req.headers.get('host')}/api/discogs/callback` ``. The Host header is already restricted to `127.0.0.1`/`localhost` by `src/proxy.ts` [VERIFIED: src/proxy.ts:10 `const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);` and :39 `if (!ALLOWED_HOSTNAMES.has(hostnameOfHost(host)))`]. Do not use `req.url`'s origin: with `-H 127.0.0.1` it can differ from what the browser used. Show this exact URL in the Settings card so the owner can paste it into the Discogs app's Callback URL field (A1 fallback).
**Manual verifier fallback (recommended):** if Discogs ignores `oauth_callback` and the app has no registered callback, discogs.com shows the verifier to the user. A small "Paste the code Discogs showed you" input posting `{oauth_token, verifier}` reuses the same exchange path and makes the flow work either way.
**Secrets storage:** do **not** add the token keys to `SECRET_KEYS`. `listSecretStatus()` maps every `SECRET_KEYS` entry into the editable `DiscogsCredentials` form, and `clearSecretAction` accepts any of them [VERIFIED: src/server/secrets.ts:14-17 `export const SECRET_KEYS = [ 'discogsConsumerKey', 'discogsConsumerSecret', ] as const;` and :135-151 `return SECRET_KEYS.map((key) => {`]. Add a separate set of keys (`discogsOAuthToken`, `discogsOAuthTokenSecret`, `discogsUsername`) with dedicated get/save/clear functions that reuse `readFileMap`/`writeFileMap` (sync read-modify-write, mode 0600). The username can live there too, so connect and disconnect are each one atomic write.

### Pattern 2: One pacing gate for every api.discogs.com request
**What:** a `globalThis` singleton (HMR-safe, like `__appWorker`) with `nextAt`, `intervalMs` and `pausedUntil`.
- `acquire(signal)`: wait until `max(nextAt, pausedUntil)` (abortable), then set `nextAt = now + intervalMs`.
- `observe(headers)`: let `limit = X-Discogs-Ratelimit` (default 60) and `remaining = X-Discogs-Ratelimit-Remaining`. Set `intervalMs = ceil(60000 / (limit × 0.9))`, which is 1112 ms at 60 and 2667 ms at 25. If `remaining < ceil(limit × 0.1)`, double it.
- `pause(ms)`: `pausedUntil = max(pausedUntil, now + ms)`.

Route handlers (connect, callback, test) and job handlers use the same gate, because routes and the lease-holding worker run in the same Next server process.
**Why derive from the limit header:** it gives D-05's 1.1 s at 60/min automatically, and it degrades safely to 2.7 s if requests ever go out unauthenticated (cap 25, verified).
**Steady state:** at 1.11 s spacing you use about 54 of 60 per window, so `remaining` hovers at about 6. That is right at the 10% threshold, so expect occasional slowdowns. This is intended, not a bug.

### Pattern 3: 429 deferral without burning an attempt
Add to `src/server/jobs/queue.ts`:
```sql
UPDATE jobs SET status = 'queued', attempts = attempts - 1, run_after = @runAfter,
  locked_at = NULL, last_error = @reason, updated_at = @now
WHERE id = @id AND status = 'running' AND attempts = @attempt
```
`claimNext` increments `attempts` on claim [VERIFIED: src/server/jobs/queue.ts:137 `UPDATE jobs SET status = 'running', locked_at = @now, attempts = attempts + 1, updated_at = @now`], so decrementing restores the count.

In `processNext`'s catch, add a branch before `failOrRetry`. Compare by `name`, as the worker already does for `WorkerStoppedError` because HMR can leave two class copies [VERIFIED: src/server/jobs/worker.ts:205-207 `// Compare by name: HMR can leave two copies of the class alive.`]. If `err.name === 'JobDeferredError'`, call `deferJob(job.id, err.runAfter, …, job.attempts)` and return `'deferred'`.

Add a lane gate so the other 230 queued jobs are not claimed and deferred one by one during a pause. In `runLane`, before `processNext`, check `laneGates[lane]?.()`, a function exported from `handlers/index.ts` next to `maintenance` that returns `pausedUntil`. If the value is in the future, `sleep(min(wait, 1000))` and loop. Keep the job `run_after` update as the durable record, so a restart during a pause still honors it for that job.

### Pattern 4: Search cascade (D-09) and candidate mapping (D-10)
```ts
// inputs come from spine_fields.value (owner value wins over the AI read), normalized:
// NFC, trim, collapse whitespace, empty → null; q capped at ~200 chars
stages = [
  catno && { stage: 'catno', params: { catno } },
  (artist || title) && { stage: 'artist_title', params: { ...(artist && { artist }), ...(title && { release_title: title }) } },
  (rawText || [artist, title, catno].filter(Boolean).join(' ')) && { stage: 'text', params: { q } },
].filter(Boolean)
// every stage adds: type=release, format=CD, per_page=10 (or 50, see Open Q2), page=1
```
Stop at the first stage with `results.length > 0`. Candidate mapping from a search result:
- `releaseId = r.id`
- `title = r.title` (the combined "Artist - Title"; do not split it)
- `year = r.year ?? null`, `country = r.country ?? null`
- `labels = unique(r.label)`, `catno = r.catno`, `formats = r.formats`
- `thumbUrl = r.thumb || null`, `masterId = r.master_id || null`, `stage`

From a release: `title = artistsDisplay + ' - ' + rel.title`, `year = rel.year || null`, `labels = unique(rel.labels.map(l => l.name))`, `catno = rel.labels[0]?.catno`, `thumbUrl = rel.thumb || rel.images?.[0]?.uri150 || null`.

Exact-catno pin: `norm = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')`, then `norm(candidate.catno) === norm(spine.catno)`. Pin matching rows first, keeping Discogs order within each group, and flag them `catnoMatch: true`.
Build the discogs.com link from the numeric id, `https://www.discogs.com/release/${id}`, not from the API `uri` (search returns a relative uri and release returns an absolute one, and a link built from an integer can't be tampered with).

### Pattern 5: Enqueue points and idempotency
Use one row per search attempt, `discogs_searches(id, spine_id, kind 'auto'|'again'|'manual'|'release', input_hash, inputs_json, query_text, release_id, status, stage, result_count, results_json, error_kind, error, job_id, created_at, finished_at)`.

| Trigger | Where | Dedupe key | Predicate |
|---------|-------|-----------|-----------|
| First scan finished | Inside `persistRunResult`'s IMMEDIATE transaction, after spines are inserted and before `status='done'` | `search:auto:<spineId>:<inputHash>` | Connected; the spine is active with `media_kind='cd'` |
| Re-scan finished | Same transaction (merge path) | Same | The matched spine's new input hash differs from its latest search's hash (D-08) |
| Connect backfill + crash safety net | `callback` route + a `maintenance` hook (cheap single SQL) | Same | Connected; active CD spine with **no** search row at all, or whose latest search ended `not_connected` |
| Search again / Retry | `POST /api/spines/{id}/search {mode:'again'}` | `search:<newSearchId>` | Always creates a new row (Pitfall 1) |
| Manual text / paste ref | `POST /api/spines/{id}/search {mode:'text'|'ref', value}` | `search:<newSearchId>` | Any active or orphaned spine, any media kind |

Store the job id on the search row. Search state (D-11):
- No row: "Not searched" ("Connect Discogs to find matches" when disconnected).
- Row not terminal: from `jobs.status` (queued → Queued, running → Searching, failed → Search failed).
- Terminal: `done` → "N candidates", `no_match` → "No matches", `failed`/`auth_failed` → "Search failed".

`fieldsChanged = latestAutoOrAgain.input_hash !== inputHash(current values)`. Compute `inputHash` in TypeScript, both at enqueue and in the read model, from the same normalize function.

The handler must re-check at run time that the spine is still `active` or `orphaned`, and must skip (finish the row as `skipped`) for superseded or dismissed spines. Re-attach and re-scan supersede spines that may have queued jobs. It must also check `ctx.isCurrent()` before each request (the WR-04 convention [VERIFIED: src/server/jobs/types.ts:19-24 "Handlers MUST check it right before any paid or external side effect (WR-04)"]).

### Pattern 6: Thumbnail cache (D-13)
`GET /api/discogs/thumb/{candidateId}` looks up `thumb_url` in the DB, so no URL ever comes from the client. Then:
- Require `https:` and hostname `i.discogs.com`, or the host of a `DISCOGS_IMAGE_BASE` test override.
- `key = sha256(url)`. If `data/discogs-thumbs/<key>.webp` exists, redirect 307 to `/api/files/discogs-thumbs/<key>.webp`, or stream it directly.
- Otherwise fetch with the UA and a 10 s timeout, cap the body at 2 MB, require `content-type: image/*`, run `sharp(buf).rotate().resize(128,128,{fit:'inside'}).webp()`, write atomically (temp + rename, as in scan-photo `writeAtomic`), then serve.

Dedupe concurrent misses with an in-flight `Map<key, Promise>` and cap concurrency at about 4. Add `'discogs-thumbs'` to `ROOTS` in the files route [VERIFIED: src/app/api/files/[...path]/route.ts:11 `const ROOTS = new Set(['crops', 'thumbs', 'vision']);`] and to `SUBDIRS` in storage/paths [VERIFIED: src/server/storage/paths.ts:6-12 `'photos', 'vision', 'crops', 'thumbs', 'backups'`]. On fetch failure, return 404 so the `<img>` falls back to a placeholder. Use `loading="lazy"` on candidate thumbnails.

### Pattern 7: Release reference parser (client-safe, shared)
```ts
// returns { kind: 'release', id } | { kind: 'master', id } | { kind: 'text', q }
// - /^\s*\d{1,10}\s*$/                         → release
// - /^\s*\[?r(\d+)\]?\s*$/i                    → release   ([r1820636] Discogs markup)
// - /^\s*\[?m(\d+)\]?\s*$/i                    → master
// - URL with hostname (www.)?discogs.com:
//     path matches /\/release\/(\d+)/          → release (covers /release/1-…, /fr/release/1, /sell/release/1, legacy /Artist-Title/release/1)
//     path matches /\/master\/(\d+)/           → master → "That's a master, not a release — pick a specific version"
// - anything else                              → text search
```
The server re-parses. A bare number is treated as a release id. Because of the ID collision, the dialog must show the fetched release (cover, artist, title, year) and require an explicit pick (D-15 already says "the release the owner picks").

### Anti-Patterns to Avoid
- **Searching inline in a route:** it bypasses the durable queue and the pause. Only the interactive OAuth/test calls run inline, and they still go through the gate.
- **A fixed dedupe key for retries:** the old failed job swallows the retry silently (Pitfall 1).
- **Passing the candidates footer unconditionally:** it removes the orphan Re-attach/Dismiss row (Pitfall 3).
- **Trusting the client with candidate data on "add manually":** post `{searchId, releaseId}` and copy from the stored `results_json`.
- **Logging request headers or the full fetch init:** the Authorization header carries the consumer secret and token secret.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Durable retry, backoff and lease | A second queue or p-queue loop | Existing `jobs` + `worker.ts` (add only `deferJob` + lane gate) | Lease, recovery, reaper and attempt fences already exist and are tested |
| HMAC-SHA1 signing | Base-string builder | PLAINTEXT over HTTPS (docs recommend it) | Signature is `encode(cs)&encode(ts)`, no base string |
| Form body parsing | Regex | `new URLSearchParams(text)` | Handles encoding |
| Query string building | String concatenation | `URLSearchParams` | Encodes `&`, `#` and unicode in titles |
| Image sanitizing | Passing upstream bytes through | sharp re-encode to webp | Strips metadata, caps size, rejects non-images |
| Atomic secrets writes | New file writer | `writeFileMap` in secrets.ts (temp + rename, 0600) | Already reviewed (01-03) |

**Key insight:** the risky parts of this phase are state-machine edges (dedupe, deferral, stale spines, orphan footer), not HTTP. Reuse the existing fences.

## Common Pitfalls

### Pitfall 1: Permanent dedupe keys swallow retries
**What goes wrong:** "Retry" or "Search again" enqueues `search:<spineId>:<hash>`, `ON CONFLICT DO NOTHING` returns the old failed job id, and nothing runs.
**Why:** `dedupe_key` is a plain UNIQUE column, kept after the job finishes [VERIFIED: src/server/db/schema.ts:29 `dedupeKey: text('dedupe_key').unique(),`; queue.ts:112 `ON CONFLICT(dedupe_key) DO NOTHING`].
**How to avoid:** use the hash-based key only for automatic triggers (where "never twice for the same inputs" is the point). Explicit actions create a new search row with key `search:<searchId>`.
**Warning signs:** `enqueue()` returns `created: false` from a user action.

### Pitfall 2: 429 handling that still spends attempts or hammers the API
**What goes wrong:** a thrown 429 goes to `failOrRetry`, which spends attempts (after 3, "Search failed") and backs off for only 2 s or 4 s. That violates D-06.
**How to avoid:** use `JobDeferredError`, `deferJob` (decrements attempts) and the lane-gate pause (Pattern 3). Use 60 s when `Retry-After` is absent, which is always for unauthenticated requests per the probe.
**Warning signs:** `last_error` containing 429 on a `failed` job; `attempts` climbing on deferred jobs.

### Pitfall 3: Orphan actions disappear
**What goes wrong:** `SpineCard` renders `footer ?? <OrphanFooter/>` [VERIFIED: src/components/spine-card.tsx:87-88 `const shownFooter = footer ?? (orphaned ? <OrphanFooter spine={spine} /> : null);`]. A candidates footer on an orphaned card hides Re-attach/Dismiss.
**How to avoid:** compose them. For orphaned spines, render the orphan row and then the candidates (or export `OrphanFooter` and include it). Pass `undefined` when there is nothing to show, so no separator renders.

### Pitfall 4: The /spines poll stops before searches finish, or gets too heavy
**What goes wrong:** `SpinesView` polls only while a photo is active (`refetchInterval: photosRefetchInterval(…)`) [VERIFIED: src/components/spines-view.tsx:160-161], so search states freeze on "Queued". If you then include 10 candidates × 237 spines in each 1.5 s poll, that is roughly 700 KB per poll.
**How to avoid:** add a `discogsActive` boolean (any search queued or running) to `SpinesResponse` and poll at about 3 s while it is true. Inline only the summary and the top 3 candidates. "Show all 10" lazily GETs `/api/spines/{id}/candidates`, with its own query-key prefix (not `['spines', …]`, which the field editor rewrites as a `SpinesResponse` [VERIFIED: src/components/reattach-dialog.tsx:27-28 "The candidates query has its own key prefix: the field editor rewrites every ['spines', …] query as a SpinesResponse."]).

### Pitfall 5: Master and release ID collision
**What goes wrong:** the owner pastes `13814` thinking of Nevermind's master and gets Billy Nasty (verified).
**How to avoid:** always show the fetched release before adding. Reject `/master/` URLs and `[m…]`. Use `type=release` everywhere. Never store `master_id` in a release column.

### Pitfall 6: Searches for spines that no longer exist
**What goes wrong:** re-scan or re-attach supersedes a spine with a queued search, and the search still spends a request.
**How to avoid:** the handler checks the spine state first and finishes the row as `skipped`. The `/api/spines` read model already lists only `active`/`orphaned` spines [VERIFIED: src/server/scan/queries.ts:259 `` `s.state IN ('active', 'orphaned')${photoFilter}` ``].

### Pitfall 7: Disconnect or a revoked token mid-backlog
**What goes wrong:** 230 queued jobs each fail with 401, and each retries 3 times.
**How to avoid:**
- If there are no tokens at run time, finish the search as `not_connected` (no request, job succeeds).
- On 401 from a signed request, finish as `auth_failed` with no retry, and set an in-memory "auth invalid" flag. The flag makes the remaining jobs short-circuit to `auth_failed` without a request, and the Settings card shows "Reconnect Discogs".
- On reconnect, the backfill predicate includes `not_connected` and `auth_failed` latest searches.
- Changing the consumer key invalidates the tokens (A4). Clearing the consumer key or secret should also clear the OAuth tokens.

### Pitfall 8: The header "failed" count only grows
**What goes wrong:** `StatusIndicator` sums `failed` jobs across all time and lanes [VERIFIED: src/components/status-indicator.tsx:257-260 `const failed = LANES.reduce((n, lane) => n + count(data, lane, 'failed'), 0);`]. Every exhausted search stays in that count after a successful retry.
**How to avoid:** for the Discogs part, show the backlog (`queued + running`) and a "paused, resumes in Ns" hint. Count Discogs failures as spines whose **latest** search failed, not as `jobs.failed`.

### Pitfall 9: OAuth plumbing traps
- PLAINTEXT signature and header values must be RFC 3986 percent-encoded (`encodeURIComponent` plus `!*'()`). The callback URL, which contains `:` and `/`, must be encoded in the header.
- OAuth error bodies are plain text with a form content type, and some errors are 500 JSON. Read `res.text()`, try JSON, and never `res.json()` blindly.
- The request token expires in 15 minutes [CITED: docs]. Make the pending entry expire at 15 minutes and make it single-use.
- Never echo the verifier or tokens into redirects, logs or error copy.

### Pitfall 10: Catno-only search on generic numbers
**What goes wrong:** stage 1 runs on any catalog_number. A short or generic value (e.g. `74321331832`, `TMI405`) can return unrelated releases or 0.
**How to avoid:** 0 results falls through to stage 2 by design (verified for `TMI405`). For false positives, the exact-catno pin plus the owner's review (Phase 4 confirm) is the mitigation. Smarter ranking is deferred.

## Code Examples

### PLAINTEXT OAuth header
```ts
// Source: Discogs developers docs (archived 2026-10-13), RFC 5849 §3.4.4 / §3.6
const enc = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function buildOAuthHeader(p: {
  consumerKey: string; consumerSecret: string;
  token?: string; tokenSecret?: string;
  callback?: string; verifier?: string;
}): string {
  const params: Record<string, string> = {
    oauth_consumer_key: p.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    oauth_signature: `${enc(p.consumerSecret)}&${enc(p.tokenSecret ?? '')}`,
    ...(p.token && { oauth_token: p.token }),
    ...(p.callback && { oauth_callback: p.callback }),
    ...(p.verifier && { oauth_verifier: p.verifier }),
  };
  return 'OAuth ' + Object.entries(params).map(([k, v]) => `${k}="${enc(v)}"`).join(', ');
}
```
Note: `oauth_signature` is encoded once to form the value (`cs&ts`) and again as a header parameter value. That double encoding is per spec. Discogs secrets are typically alphanumeric, so this only matters for edge characters. [ASSUMED for Discogs-specific tolerance; RFC behavior cited]

### Client request classification
```ts
// 200..299 → parse; 429 → gate.pause(retryAfterMs ?? 60_000) + throw JobDeferredError(gate.pausedUntil)
// 401 → DiscogsAuthError (no retry); 404 → DiscogsNotFound (no retry); 400/403/422 → DiscogsRequestError (no retry)
// 5xx, fetch TypeError, timeout → plain Error (worker failOrRetry: 3 attempts, 2 s/4 s)
// Always: gate.observe(res.headers) before branching; headers: User-Agent, Accept: application/vnd.discogs.v2.discogs+json
// Signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)])
```
`Retry-After` parsing: accept delta-seconds or an HTTP-date, and clamp to 1 to 300 s.

### Handler registration
```ts
// src/server/jobs/handlers/index.ts — existing shape [VERIFIED: handlers/index.ts:7-14]
export const handlers: Record<string, JobHandler> = {
  noop: { run: runNoop, timeoutMs: 120000 },
  scan_photo: { run: (payload, ctx) => runScanPhoto(payload, ctx), timeoutMs: 720_000 },
  search_spine: { run: (p, ctx) => runSearchSpine(p, ctx), timeoutMs: 90_000 },   // up to 3 paced requests
  fetch_release: { run: (p, ctx) => runFetchRelease(p, ctx), timeoutMs: 60_000 },
};
```
The job lane must be `'discogs'` [VERIFIED: src/server/jobs/types.ts:4 `export const LANES = ['anthropic', 'discogs'] as const;`; worker.ts:23-26 `discogs: 1`].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `api-img.discogs.com` / `img.discogs.com` thumb hosts (in old docs examples) | `i.discogs.com` with signed imgproxy-style paths | Before this session (live thumbs are all `i.discogs.com`) | Allowlist `i.discogs.com`. The old hosts appear only in the archived docs' sample JSON. [VERIFIED: probe; CITED: archived docs samples] |
| Fixed 60 s window assumption | Moving window, gradual recovery | Docs + probe | 60 s pause is safe but conservative. It is kept per D-06. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Discogs honors the per-request `oauth_callback` (dynamic `http://localhost:3001/...`) even if the app registration has a different or no callback | Pattern 1 | The owner lands on a discogs.com verifier page or the wrong port. Mitigation: show the exact callback URL to paste into the app settings, plus the manual verifier input. **Needs owner checkpoint.** |
| A2 | Access-token exchange signature is `consumer_secret&request_token_secret` (docs show `consumer_secret&`) | OAuth endpoints | 401 on exchange. Mitigation: if the first form returns 401, try the docs' literal form once, behind a unit-tested switch. Owner checkpoint. |
| A3 | Authenticated 429s also omit `Retry-After` | Rate limiting | None: the code parses it when present |
| A4 | Changing the consumer key invalidates existing access tokens | Pitfall 7 | A stale-but-working token, which is harmless |
| A5 | Authenticated search returns non-empty `thumb` URLs on i.discogs.com | DISC-04 | No thumbnails in search candidates. Fallback: lazily GET `/releases/{id}` thumbs (costs rate budget). From prior research, not re-probed. **Owner checkpoint: first real search shows thumbs.** |
| A6 | Denying authorization redirects to the callback without `oauth_verifier` (or with `denied=`) | Pattern 1 | The callback must treat any missing verifier as "denied". Low risk. |
| A7 | `/oauth/identity` also returns `consumer_name` | Pattern 1 | None: only `username` is used (cited) |
| A8 | `master_id` is 0 or absent for releases without a master | Pattern 4 | Store `master_id || null`, so there is no risk |
| A9 | i.discogs.com thumb URLs are stable (no expiry) | Pattern 6 | A re-fetch of an expired URL 404s and the placeholder shows. The cache makes this rare. |
| A10 | Routes and the lease-holding worker share one Node process in `next start`, so one `globalThis` gate covers both | Pattern 2 | Under a second process (another `next dev` on the same DATA_DIR), routes in the non-holder could exceed pacing slightly. Single-user and rare. |

## Open Questions

1. **Stage-2 condition when only artist or only title exists**
   - What we know: D-09 says "artist + release_title". 164/237 spines have an artist and 181/237 a title [VERIFIED: app.db read-only counts].
   - Recommendation: run stage 2 when either is present, sending whichever exist. A title-only query with `format=CD` is still useful before free text.
2. **`per_page` for the catno stage**
   - What we know: catno search is fuzzy, and exact matches can fall outside Discogs' top 10. One request returns up to 100 at the same cost.
   - Recommendation: request `per_page=50` for the catno stage, pin exact normalized matches, then keep the top 10. Request 10 for the other stages. This is a slight reading of D-10 ("top 10 results of the winning stage"), so the planner should confirm it or keep 10 everywhere.
3. **Lane pause after a 429: 60 s vs shorter**
   - The probe shows recovery in about 6 s. D-06 locks 60 s when Retry-After is absent. Keep 60 s.
4. **Unsure-media spines**
   - D-08 auto-searches only `cd`. `unsure` spines get "Not searched" plus the manual "Search Discogs…" action. `SpineDto` currently has no media kind, so add `mediaKind` from the current detection.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | runtime, verify scripts (native TS strip) | ✓ | v24.22.0 | — |
| api.discogs.com reachable | DISC-01..06 | ✓ | v2 (`x-discogs-media-type: discogs.v2`) | — |
| i.discogs.com reachable | thumbnails | ✓ | — | Placeholder image |
| Discogs consumer key/secret | OAuth | ✓ (keys present in secrets.json; values not read) | — | — |
| Owner Discogs account + browser | OAuth checkpoint (A1, A2, A5) | Human | — | None: end-of-phase human verify |
| Existing data | backfill test | ✓ 237 active CD spines | — | — |

**Missing dependencies with no fallback:** none for building. A live OAuth connection is needed only for the end-of-phase human verification (`human_verify_mode: end-of-phase`).

## Validation Architecture

(Included at the orchestrator's request. `workflow.nyquist_validation` is `false` in config.)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5, `pool: 'forks'`, `include: ['src/**/*.test.ts']`, `server-only` stubbed [VERIFIED: vitest.config.ts] |
| Config file | vitest.config.ts |
| DB fixture | `useTempDataDir()` (fresh migrated DATA_DIR per test) [VERIFIED: test/helpers/temp-data-dir.ts] |
| Quick run command | `pnpm vitest run src/server/discogs src/server/jobs src/lib/discogs-ref.test.ts` |
| Full suite command | `pnpm test && pnpm typecheck && pnpm lint` |
| E2E | `node scripts/verify-discogs.ts` (new; `VERIFY_SKIP_BUILD=1` reuses .next), modeled on verify-scan.ts with `startServer`/`waitFor` from scripts/lib/server.ts |

### Fake Discogs for tests (never live, per CLAUDE.md)
- Unit: the client takes an injected `fetch` and clock (deps parameter, like `ScanPhotoDeps`). Use recorded JSON fixtures under `test/fixtures/discogs/`, built from this session's probe shapes (search hit, search empty, release, 404, 429 with no Retry-After, OAuth 401 plain-text body).
- E2E: `test/fixtures/fake-discogs.mjs`, a `node:http` server implementing:
  - `/oauth/request_token` (asserts the PLAINTEXT header shape, returns a form body)
  - `/oauth/authorize` (302 to `oauth_callback` with a verifier)
  - `/oauth/access_token`
  - `/oauth/identity`
  - `/database/search` (scriptable: N results per stage, inject a 429 once, rate-limit headers)
  - `/releases/:id` and a small JPEG at `/img/...`
- Point the app at it with env overrides (`DISCOGS_API_BASE`, `DISCOGS_WEB_BASE`, `DISCOGS_IMAGE_BASE`), honored server-side only. Add them to `.env.example`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | PLAINTEXT header exact shape and encoding; request/access body parsing; plain-text error | unit | `pnpm vitest run src/server/discogs/oauth.test.ts` | ❌ Wave 0 |
| DISC-01 | Connect → authorize → callback → "Connected as" and tokens never in any response or page; expired/unknown token → `/settings?discogs=expired`; disconnect clears | e2e | `node scripts/verify-discogs.ts` | ❌ |
| DISC-02 | Gate interval from limit header; slowdown under 10%; pause; abortable acquire | unit (fake clock) | `pnpm vitest run src/server/discogs/gate.test.ts` | ❌ |
| DISC-02 | `deferJob` restores attempts and sets run_after; stale attempt is a no-op; worker defers on `JobDeferredError` and lane gate blocks claims | unit | `pnpm vitest run src/server/jobs/queue.test.ts src/server/jobs/worker.test.ts` | ✅ extend |
| DISC-02 | 429 mid-batch: all jobs eventually succeed, `attempts` unchanged, no request during pause | e2e | `node scripts/verify-discogs.ts` | ❌ |
| DISC-03 | Cascade stops at first non-empty stage; stage params; `type=release&format=CD` on every stage | unit | `pnpm vitest run src/server/discogs/search.test.ts` | ❌ |
| DISC-03 | Scan done enqueues only active CD spines; re-scan enqueues only changed; backfill idempotent; superseded skipped | unit (DB) | `pnpm vitest run src/server/discogs/enqueue.test.ts src/server/jobs/handlers/search-spine.test.ts` | ❌ |
| DISC-04 | Candidate mapping (labels dedupe, year null, combined title); catno normalized pin; thumb host allowlist rejects non-i.discogs.com; files route serves `discogs-thumbs` only `.webp`/`.jpg` | unit | `pnpm vitest run src/server/discogs/thumbs.test.ts` | ❌ |
| DISC-05 | `fieldsChanged` flips after edit; "Search again" creates new row and job even with identical inputs (Pitfall 1); auto rows replaced, manual kept | unit (DB) | `pnpm vitest run src/server/discogs/store.test.ts` | ❌ |
| DISC-06 | `parseDiscogsRef` table: bare id, `[r1]`, `/release/1-x`, `/fr/release/1`, legacy `/A-T/release/1`, `/master/1` → master, non-discogs URL → text | unit | `pnpm vitest run src/lib/discogs-ref.test.ts` | ❌ |
| DISC-06 | Manual add copies from stored results; rejects releaseId not in that search; 415 for non-JSON | unit (route) | `pnpm vitest run src/app/api/spines/[id]/candidates/route.test.ts` | ❌ |
| DISC-01/04 | Real account: connect on port 3001, username shown, first searches show thumbnails | manual (end-of-phase human verify) | — | — |

### Sampling Rate
- **Per task commit:** the quick run command for touched modules
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** full suite + `node scripts/verify-discogs.ts` + existing `verify-guard.ts`/`verify-scan.ts` still green, before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/fixtures/discogs/*.json`, recorded shapes from this research
- [ ] `test/fixtures/fake-discogs.mjs`
- [ ] Env-override plumbing (`DISCOGS_API_BASE`, `DISCOGS_WEB_BASE`, `DISCOGS_IMAGE_BASE`) in the client and the thumb allowlist

## Security Domain

`security_enforcement: true`, ASVS level 1, block on high [VERIFIED: .planning/config.json].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (third-party OAuth) | OAuth 1.0a PLAINTEXT over HTTPS only. Request token single-use with 15 min expiry. No tokens to the browser. |
| V3 Session Management | yes (pending OAuth state) | Server-side pending Map keyed by `oauth_token`. Callback rejects unknown or expired tokens. |
| V4 Access Control | yes | Existing loopback Host + same-origin guard (`src/proxy.ts`). Mutations are POST + JSON-only (415). |
| V5 Input Validation | yes | zod for route bodies and job payloads, **and** for Discogs responses (untrusted upstream). Field length caps. `parseDiscogsRef` re-run server-side. |
| V6 Cryptography | minimal | `crypto.randomBytes` nonce; sha256 cache keys. No custom crypto. |
| V7 Error/Logging | yes | Never log Authorization headers, tokens, verifier or secrets.json content (Phase 1 `SecretsFileError` convention) |
| V12 Files/Resources | yes | Thumb fetch only from DB-stored URLs, host allowlist `i.discogs.com`, https, 2 MB cap, `image/*`, sharp re-encode, hash filenames, served via allowlisted `/api/files` root |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged callback (attacker page navigates owner to `/api/discogs/callback?oauth_token=X&oauth_verifier=Y`) | Spoofing | Only a token from our own pending Map is accepted, single use. The attacker's account token can't be injected without our request-token secret. |
| Cross-site POST to connect/disconnect/search (CSRF) | Tampering | proxy Origin + `sec-fetch-site` check; `application/json` required (no simple-form preflight bypass) |
| SSRF via thumbnail URL | Info disclosure | URL read from the DB (originating from Discogs), never the client. Strict https + hostname allowlist, no redirects followed (`redirect: 'error'`). |
| Malicious image bytes | Tampering | sharp decode + re-encode; `nosniff` already set by files route |
| XSS via Discogs strings (titles, labels) | Tampering | Render as React text only. External link built from the numeric id. |
| Open redirect from callback | Spoofing | Redirect only to fixed `/settings?discogs=<enum>` |
| Token leakage via DTO, RSC payload or logs | Info disclosure | Settings page receives `{connected, username}` only. Add a verify-secrets-style canary check that tokens never appear in `/settings` HTML or any API response. |
| Rate-limit abuse leading to Discogs ban | DoS | Single gate, derived pacing, lane pause, unique UA |

## Sources

### Primary (HIGH confidence)
- Live `curl` probes against api.discogs.com and i.discogs.com, 2026-10-20, unauthenticated, project UA: search shapes, release shape, 404, 429 headers/body, recovery, OAuth error shapes, image behavior, shared counter
- Codebase, read this session: src/server/jobs/{types,queue,worker}.ts, handlers/{index,scan-photo}.ts, src/server/scan/{store,merge,queries,fields,field-sql,orphans}.ts, src/server/secrets.ts, src/server/storage/paths.ts, src/server/db/schema.ts, src/proxy.ts, src/app/api/files/[...path]/route.ts, src/app/api/status/route.ts, src/app/api/spines/route.ts, src/app/api/spines/[id]/fields/route.ts (+ test), src/app/settings/{page,actions}.tsx, src/components/{spine-card,status-indicator,spines-view,reattach-dialog,spine-field}.tsx, vitest.config.ts, test/helpers/temp-data-dir.ts, scripts/lib/{server,jobs}.ts, scripts/verify-scan.ts
- data/app.db (read-only): spine counts by state/media kind, field fill rates, sample catnos

### Secondary (MEDIUM confidence)
- Discogs developers page via web.archive.org snapshot 20261013233149 (the live page returns 403): OAuth flow steps, endpoints, 15 min expiry, rate-limit header semantics, search params, "Authentication (as any user) is required", images note
- .planning/research/PITFALLS.md (2026-10-18 probes, secondary OAuth sources)

### Tertiary (LOW confidence)
- None relied on beyond the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new packages, all versions read from package.json.
- Architecture: HIGH. Every integration seam was read and is cited with lines.
- Discogs behavior: HIGH for unauthenticated and rate limits (probed), MEDIUM for the OAuth handshake (docs only; A1/A2 need an owner checkpoint).
- Pitfalls: HIGH. Derived from code read this session and probe results.

**Research date:** 2026-10-20
**Valid until:** 2026-11-19 for codebase seams; re-probe Discogs rate-limit and thumb behavior if planning slips past that date.
