# Phase 3: Discogs Match - Context

**Gathered:** 2026-10-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The owner connects their Discogs account (OAuth 1.0a) and, for every active CD spine, sees candidate Discogs releases they can recognize: cover thumbnail, title, year, country, label, catalog number, format. Candidates are fetched automatically after a scan through one throttled Discogs queue. The owner can re-run a spine's search after editing it, run a manual search, or paste a release URL/ID.

**Not in this phase:** confirming a candidate, adding to the collection, already-in-collection warnings, status filters for import states, "not on Discogs" marking (all Phase 4). Nothing is written to the owner's Discogs account in Phase 3. All calls are reads.

</domain>

<decisions>
## Implementation Decisions

All decisions below were auto-selected (`--auto`) using the recommended option. Review them before planning if any look wrong.

### Connecting Discogs
- **D-01:** The Settings page gets a "Discogs" card. It holds the existing consumer key/secret fields plus a "Connect Discogs" button that starts the OAuth 1.0a PLAINTEXT flow (request_token, then the discogs.com authorize page, then a callback, then access_token). After connecting, the card shows "Connected as {username}" (from `/oauth/identity`) with Disconnect and "Test connection" buttons. The "Test connection" button fulfils the Phase 1 D-10 promise.
- **D-02:** The OAuth access token and secret are stored in `secrets.json` next to the consumer credentials (Phase 1 D-08). They are never sent to the browser, which only sees the username. Disconnect deletes them locally. Discogs has no revoke endpoint.
- **D-03:** The callback URL is built from the incoming request's own origin plus `/api/discogs/callback`, so non-default ports (the owner runs on 3001) work. The pending request-token secret is held server-side and keyed by `oauth_token`, with a short expiry.
- **D-04:** Every Discogs request sends `User-Agent: DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer`. Searching requires a connection, because unauthenticated search returns empty thumbnails. With no connection, spines show "Connect Discogs to find matches" with a link to Settings.

### Throttled queue
- **D-05:** All Discogs HTTP goes through one in-house client on native `fetch` (no Discogs npm client). The client is driven by the existing durable `jobs` table on the `discogs` lane (concurrency 1). Pacing is about 1 request per 1.1 s. It also adapts to `X-Discogs-Ratelimit-Remaining`: it slows down below about 10% headroom.
- **D-06:** A 429 never loses work. The job is rescheduled via `run_after` using `Retry-After` when present, or 60 s otherwise. A 429 does not count as a failed attempt. Other errors (network, 5xx) retry with the existing backoff up to 3 attempts, then the spine shows "Search failed" with a Retry action.
- **D-07:** The header status indicator (Phase 1 D-17) also shows the Discogs backlog, e.g. "Searching Discogs · 34 left", so a large batch's progress is visible.

### Automatic search
- **D-08:** When a scan run finishes, one `search_spine` job is enqueued for each active spine whose `media_kind` is `cd`. It is deduped by spine id plus a hash of the search inputs. Orphaned and superseded spines are not auto-searched. A re-scan only re-enqueues spines whose fields changed.
- **D-09:** The search cascade stops at the first stage that returns results. All stages use `type=release` and `format=CD` (Project decision: CDs only), and never masters.
  1. `catno` (when a catalog number exists)
  2. `artist` + `release_title`
  3. free text `q` from the raw text
- **D-10:** The top 10 results of the winning stage are stored as the spine's candidates. Each stores: Discogs release id, title, artist, year, country, labels, catno, formats, thumb URL, and which stage found it. Results are shown in Discogs order. An exact catno match is pinned first and tagged "Catalog number match". More ranking is deferred.
- **D-11:** Each spine shows a search state in the card's status slot (Phase 2 D-11): Not searched, Queued, Searching, N candidates, No matches, or Search failed.

### Candidates UI
- **D-12:** Candidates render in the spine card's footer slot (Phase 2 D-11) as a compact list: thumbnail (about 64 px), "Artist – Title", then year · country · label · catno · format, plus an external link to the release on discogs.com. The first 3 are shown, with "Show all 10" to expand. There is no select/confirm control in Phase 3; that arrives in Phase 4.
- **D-13:** Thumbnails are fetched server-side on first display and cached under `data/discogs-thumbs/` (keyed by URL hash), then served through the existing `/api/files` route. That route's allowlist is extended. Caching keeps the app portable and offline, and avoids repeat hotlinking.

### Re-search, manual search, paste ID
- **D-14:** Editing a field does not auto-search. When fields changed since the last search, the state shows "Fields changed since last search" and a "Search again" button that enqueues a new search with the current values.
- **D-15:** Each card has a "Search Discogs…" action that opens a dialog with one input. Free text runs a manual search, shown in the dialog through the same queue. A value that parses as a release URL (`discogs.com/release/{id}…`) or bare numeric ID fetches `/releases/{id}`. Either way, the release the owner picks is added to the spine's candidates as "Added manually" and pinned to the top. Master URLs are rejected with "That's a master, not a release — pick a specific version".
- **D-16:** Manual and auto candidates live in one candidate table with a `source` column (`auto` | `manual`). A new auto search replaces only `auto` rows.

### Claude's Discretion
- Exact schema and table names (e.g. `discogs_searches`, `spine_candidates`) and migration layout.
- The OAuth pending-token store (DB row vs memory with expiry).
- Pacing constants and the header-adaptive algorithm details, within D-05/D-06.
- Visual details of the candidate list and dialog, within the existing UI-SPEC tokens.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md` — DISC-01..DISC-06
- `.planning/ROADMAP.md` § Phase 3 — goal and 5 success criteria
- `.planning/PROJECT.md` — constraints (60 req/min queue, secrets local, CDs only, `format=CD`)

### Discogs research
- `.planning/research/PITFALLS.md` — rate limits and headers, PLAINTEXT OAuth, master vs release (Pitfall 5), unauthenticated empty thumbnails, `per_page` cap 100, User-Agent, folder-0, and the "verify on a real account" list
- `.planning/research/FEATURES.md` — candidate list fields, catno-first cascade, queue with visible backlog
- `.planning/research/STACK.md` and `.claude/CLAUDE.md` § Discogs Integration — thin in-house client, endpoints, OAuth URLs

### Prior phase decisions
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-08/D-09 secrets, D-10 Discogs test, D-12..D-14 jobs and lanes, D-17 status indicator
- `.planning/phases/02-shelf-scan/02-CONTEXT.md` — D-11 card status/footer slots, D-13..D-16 runs, re-scan merge and orphans
- `.planning/phases/01-foundation/01-UI-SPEC.md`, `.planning/phases/02-shelf-scan/02-UI-SPEC.md` — design tokens and components

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/server/secrets.ts`: already defines `discogsConsumerKey` / `discogsConsumerSecret` with env overrides and masking; extend it with the OAuth token/secret.
- `src/server/jobs/` (queue, worker, lease, handlers/index.ts): the `discogs` lane already exists with concurrency 1. Register `search_spine` (and `fetch_release`) handlers here.
- `src/components/spine-card.tsx`: has `statusSlot` and `footer` props (empty footer renders nothing).
- `src/components/secret-field.tsx`, `test-claude-button.tsx`, `claude-cli-card.tsx`: patterns for the Discogs settings card and test button.
- `src/app/api/files/[...path]/route.ts`: root/extension allowlist to extend for cached thumbnails.
- `src/components/reattach-dialog.tsx`: dialog pattern for "Search Discogs…".

### Established Patterns
- Mutating routes are JSON-only (415 otherwise) behind the proxy Origin / sec-fetch-site guard (src/proxy.ts).
- TanStack Query polling for live status; nuqs for URL state.
- Paid or rate-limited work is enqueued with dedupe keys, never run inline in a route.
- The scan handler (src/server/jobs/handlers/scan-photo.ts) is where "scan finished, enqueue searches" hooks in.

### Integration Points
- After a run is `done` (scan-photo handler / merge), enqueue searches for active CD spines.
- `GET /api/spines` payload gains search state and candidates per spine.
- `GET /api/status` gains the Discogs backlog count.
- New routes: `/api/discogs/connect`, `/api/discogs/callback`, `/api/discogs/disconnect`, `/api/discogs/test`, `/api/spines/{id}/search`, `/api/spines/{id}/candidates` (manual add).

</code_context>

<specifics>
## Specific Ideas

- The owner runs the prod server on port 3001 (port 3000 is taken by Grafana). OAuth callbacks must not assume 3000.
- About 230 spines are already scanned across 3 photos. The first connect should backfill searches for all existing active CD spines (about 230 requests, about 4.5 min at the pacing above).

</specifics>

<deferred>
## Deferred Ideas

- Smart candidate ranking beyond the catno pin (format/label/country scoring): FEATURES P2.
- Keyboard-driven review and bulk accept: Phase 4 or later.
- Barcode search (spines rarely show barcodes).

</deferred>

---

*Phase: 03-discogs-match*
*Context gathered: 2026-10-20*
