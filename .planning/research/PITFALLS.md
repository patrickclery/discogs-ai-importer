# Pitfalls Research

**Domain:** Local single-user Next.js app: shelf photo -> Claude vision (one call per photo) -> spine crops -> Discogs match -> collection import
**Researched:** 2026-10-18
**Confidence:** MEDIUM-HIGH overall. Claude vision, coordinate, and structured-output facts come from first-party Anthropic docs (platform.claude.com, fetched today). Discogs search, rate-limit headers, thumbnails, and pagination were checked with live `curl` probes against `api.discogs.com` today. The Discogs developer page itself returned 403 (Cloudflare), so the OAuth and collection-folder details come from secondary sources (client libraries and API wrappers). Those are MEDIUM. The GSD classify-confidence seam rates webfetch as LOW and verified websearch as MEDIUM, so anything not marked [OFFICIAL] or [LIVE-PROBE] below should be treated as MEDIUM or lower.

**Phase names used below** (suggested; the roadmapper may rename them):
- **P1 Foundation**: Next.js, SQLite/Drizzle, data folder layout, settings and secrets
- **P2 Ingest + Vision**: upload, normalize, hash, Claude call, schema, cropping
- **P3 Discogs Connect + Search**: auth, request queue, search and ranking
- **P4 Review + Import**: review UI, correction, add-to-collection, statuses
- **P5 Hardening/Portability**: export/move, recovery, cost controls

---

## Critical Pitfalls

### Pitfall 1: Cropping with model coordinates in the wrong pixel space (API resize)

**What goes wrong:**
Every spine crop is offset or scaled wrong. Crops show half of the neighbouring disc, or empty shelf. The error gets worse further from the top-left corner.

**Why it happens:**
Claude returns absolute pixel coordinates in the image *it sees*, after its server-side resize. That is not your original image. [OFFICIAL] A 12 MP phone photo (4032x3024) on a high-res-tier model (Claude 4.7+, long-edge limit 2576 px, 4784 visual tokens) is downscaled to **2212x1659**, a 1.82x factor. The visual-token limit sets this size, not the edge limit, so "scale to 2576 on the long edge" is also wrong. Standard-tier models (e.g. Haiku 4.5: 1568 px / 1568 tokens) downscale the same photo to **1270x952**. Claude also pads to a multiple of 28 px on the bottom and right edges. Dividing by the padded dimensions skews every coordinate slightly.

**How to avoid:**
- Normalize every photo once at ingest: auto-orient, then resize to exactly `resizedSize(w, h, maxEdge, maxTokens)` using Anthropic's reference algorithm (binary search on the long edge, round-half-to-even). Save the result as the canonical **analysis image**. Send exactly those bytes to Claude. Crops can then use the coordinates 1:1. To get sharper crops, map the box to the oriented full-res master with a per-axis linear scale.
- Set `"transformations": {"oversized_image": "error"}` on the image block [OFFICIAL]. A tier change or a bug in your resize then fails with a 400 instead of silently shifting every box.
- Store the analysis-image width/height and the model ID on the scan row. Keep the tier limits (2576/4784 vs 1568/1568) in one config keyed by model.
- Ask for `[x1, y1, x2, y2]` in absolute pixels. Claude does badly with normalized 0-1000 coordinates [OFFICIAL]. Normalize in your own code if you need to.

**Warning signs:**
Crops are good near the top-left and drift toward the bottom-right. Boxes extend past the image bounds. Crops are systematically about 1.8x too small.

**Phase to address:** P2. This is the core of the "one call + local crop" design. Include a visual box-overlay debug view and a fixture test before building anything downstream.

---

### Pitfall 2: EXIF orientation mismatch between Claude, sharp, and the browser

**What goes wrong:**
Boxes look correct in the browser overlay but crop the wrong region. Or crops come out rotated 90 degrees. Portrait phone photos are the usual case (EXIF Orientation=6).

**Why it happens:**
Three systems treat orientation differently:
- The Claude API applies orientation correction server-side [OFFICIAL: "orientation correction proceed[s] as usual"], so its coordinates are in *upright* space.
- `sharp(...).metadata().width/height` ignore EXIF orientation [OFFICIAL sharp docs]. You need `metadata().autoOrient`.
- `sharp(...).extract()` on an un-rotated buffer works in *raw sensor* space.
- Browsers apply EXIF orientation to `<img>` by default.
The result is that one photo has two coordinate systems.

**How to avoid:**
At ingest, run `sharp(input).autoOrient()` (or `.rotate()` with no args) **before** any resize or extract, and strip the metadata. Store the upright master and derive the analysis image from it. Never crop from the raw upload. Note that only the EXIF Orientation tag is honoured. XMP orientation is ignored [OFFICIAL sharp].

**Warning signs:**
Landscape photos work and portrait photos fail. Width and height look swapped in the DB.

**Phase to address:** P2. Put an orientation-6 JPEG in the fixture set.

---

### Pitfall 3: Too many, too-thin spines per photo, so the model invents titles

**What goes wrong:**
The model returns confident but wrong titles. Plausible albums by the right artist that are not on the shelf. Spine counts are off by a few. Boxes drift progressively along a long row of identical-width jewel cases.

**Why it happens:**
- After the resize in Pitfall 1, a 40-CD shelf in a 12 MP photo leaves each spine about 55 px wide in model space. Spine text is about 2 patches (28 px each) tall. At 80 spines it falls below one patch.
- Anthropic documents hallucination on "rotated, or very small images," approximate counting with "large numbers of small objects," and approximate localization [OFFICIAL Limitations].
- Spine text is vertical. US/UK spines read top-to-bottom and many EU/JP spines read bottom-to-top, so both directions occur on one shelf.
- The model fills partially legible text with prior knowledge.

**How to avoid:**
- Schema: separate `raw_text` (verbatim, what is printed; `"?"` for illegible characters) from interpreted `artist`/`title`. Add a per-spine `legibility` enum (`clear|partial|illegible`) and `reading_direction`. Ask for spines in strict left-to-right order with an `index`.
- Use a high-res-tier model (Claude 4.7+). Do not "save money" with Haiku 4.5. It is standard-tier, and 1568 px wrecks small spine text.
- UX guidance: aim for about 15-30 spines per photo. Fill the frame with the shelf, shoot square-on, and offer an optional 90-degree rotation before analysis.
- Post-validate. Clamp boxes to the image. Reject zero-area or inverted boxes. Flag heavy horizontal overlap between neighbours, non-monotonic x order, and median spine width under about 40 px in model space ("photo too dense, retake closer").
- Escape hatch inside the one-call constraint: one request may contain several images. For dense shelves, send the full image plus 2-3 overlapping high-res tiles in the *same* call. Treat this as a later fallback only, because tile coordinates need per-tile offsets.

**Warning signs:**
Many `partial` spines that are still "matched". Detected count differs from a manual count. Titles that look plausible but whose crop text doesn't match.

**Phase to address:** P2 (schema, validation, model choice). P4 (UI shows crop next to `raw_text` and flags low legibility). This is why the correction UI is core.

---

### Pitfall 4: Structured output breaks on long shelves (max_tokens, thinking, refusals, forced tools)

**What goes wrong:**
Truncated JSON, a parse crash, or a 400 on the first request. A photo with 50 spines returns 35 and the rest silently disappear.

**Why it happens:**
- `stop_reason: "max_tokens"` returns incomplete JSON that "may not match schema". `refusal` returns HTTP 200 with plain text instead of JSON [OFFICIAL].
- On Claude Opus 5.5, thinking cannot be disabled. Thinking tokens consume `max_tokens`, and a low `max_tokens` (e.g. 4096) cuts the spine list off.
- Forced `tool_choice: {type:"tool"}` / `"any"` now **returns a 400** on Opus 5.5 / Sonnet 5.5 / Fable 5.1. Most older tutorials use exactly that pattern for JSON extraction.
- The deprecated `output_format` parameter appears in old examples. The current parameter is `output_config: {format: {...}}`.
- Schema limits [OFFICIAL]: no `minimum`/`maximum`, no `minLength`, `minItems` only 0/1. Recursive schemas are rejected. Max 24 optional params and 16 union-typed params (type arrays like `["string","null"]` count). Unsupported keywords cause a 400 unless the SDK helper strips them.

**How to avoid:**
- Use `output_config.format` with a JSON schema via the SDK's `messages.parse()` helper and Zod. Make every field `required`, and use nullable only where needed (stay under 16 unions). Validate bbox ranges in your own code.
- Stream, with `max_tokens` around 32-64K. Set `output_config.effort` explicitly (`low`/`medium`). Opus 5.5 defaults to `medium`. Effort is the main lever on output-token cost.
- Always branch on `stop_reason` before parsing. Persist the raw response body to disk before parsing, so a parser bug never forces a paid re-scan.
- Include `spine_count_estimate` at the top of the schema as a cross-check against `spines.length`.

**Warning signs:**
The longest shelf photos fail. `usage.output_tokens` equals `max_tokens`. JSON parse errors in the logs.

**Phase to address:** P2.

---

### Pitfall 5: Discogs master ID vs release ID, so the wrong thing gets added silently

**What goes wrong:**
The collection gets a random unrelated release. Or the user is offered 372 near-identical "Nevermind" CDs and can't tell which one they own.

**Why it happens:**
- Search returns mixed `type` values (`artist`, `master`, `release`, `label`). Master IDs and release IDs are separate number spaces. Posting a master ID to `/collection/folders/{id}/releases/{release_id}` adds whatever *release* has that number.
- [LIVE-PROBE] `release_title=nevermind&artist=nirvana&type=release&format=CD` returned **372 releases** sharing `master_id` 13814, differing only by country, year, and catno.

**How to avoid:**
- Always search with `type=release`, plus `format=CD` or `format=DVD` from the extracted format. Never POST an ID taken from a `master` result. Keep `master_id` and `release_id` as separate typed columns.
- Two-level candidate UI: group by `master_id` first ("this album"), then pick a pressing. Rank pressings by catno/label match from the spine (often printed on the spine), then country and year. Default to the most common pressing only with explicit confirmation.
- Before POSTing, re-fetch `/releases/{id}` and show title, format, and catno in the confirm step.

**Warning signs:**
Imported items whose Discogs title doesn't match the spine. `master_id` values stored in a `release_id` column.

**Phase to address:** P3 (search query building and ranking). P4 (confirm step).

---

### Pitfall 6: Duplicate collection adds (POST is not idempotent)

**What goes wrong:**
The user's real Discogs collection ends up with 2-3 copies of the same disc. Causes: a retry after a timeout, a double-click, re-importing a re-scanned photo, or two overlapping shelf photos that both contain the same disc.

**Why it happens:**
Discogs allows multiple instances of one release in a collection. Each POST creates a new `instance_id` (MEDIUM, from client-library docs). Generic HTTP retry wrappers retry POSTs on 5xx or timeouts.

**How to avoid:**
- Persist an "import intent" row (spine -> release_id, status `importing`) *before* the POST. Store the returned `instance_id`.
- Never auto-retry the POST. On an ambiguous failure, first `GET /users/{u}/collection/releases/{release_id}` and only POST if no instance was created after the intent timestamp.
- Pre-flight check: if the release is already in the collection, show "already owned (n copies)" and require an explicit "add another copy".
- Cross-photo dedup: warn when two spines in the local DB resolve to the same `release_id`.
- Keep an undo: `DELETE .../folders/{folder_id}/releases/{release_id}/instances/{instance_id}`.

**Warning signs:**
Collection count grows faster than imported-item count. Same release_id on multiple local rows.

**Phase to address:** P4.

---

### Pitfall 7: Rate limiter is per process, but HMR and multiple tabs create multiple queues

**What goes wrong:**
429 storms during batch matching, or a stalled queue. Searches hang after a dev reload.

**Why it happens:**
- Discogs throttles **by source IP** to 60/min authenticated and 25/min unauthenticated, as a moving 60-second window. Headers: `X-Discogs-Ratelimit`, `-Used`, `-Remaining`. Over the limit returns 429 (MEDIUM, from secondary sources).
- [LIVE-PROBE] Unauthenticated calls today returned `x-discogs-ratelimit: 25`.
- In `next dev`, HMR re-evaluates modules. A module-level `new Queue()` gets duplicated, each copy thinks it has 60/min, and orphaned timers keep running. Thumbnail lookups, collection checks, and search all share the same budget.

**How to avoid:**
- One queue singleton stored on `globalThis`, used by every Discogs call: search, release fetch, collection check, add.
- Adapt to `X-Discogs-Ratelimit-Remaining`. Keep about 10% headroom. On 429, back off and honour `Retry-After` if present, else wait 60 s.
- Persist queue jobs in SQLite (status per spine). Restarts and reloads should then resume instead of re-issuing.
- Search lazily per spine and cache search responses in SQLite keyed by normalized query. Re-opening a spine must not spend requests.

**Warning signs:**
429s in logs. `Remaining` hits 0 well under 60 calls. Queue throughput doubles after editing a file.

**Phase to address:** P3.

---

### Pitfall 8: Copying the project folder breaks native modules or loses the DB (WAL)

**What goes wrong:**
"Portable" fails in practice:
- Copying the folder to another machine or OS crashes with `NODE_MODULE_VERSION` / "Could not locate the bindings file" (better-sqlite3), or with a missing sharp platform binary.
- Copying the DB while the app is running loses recent writes. In WAL mode, uncommitted pages live in `app.db-wal`.
- Absolute image paths stored in the DB break after the move.

**Why it happens:**
better-sqlite3 and sharp ship platform- and Node-ABI-specific binaries. WAL keeps data outside the main file until checkpoint.

**How to avoid:**
- Portability means **the `data/` folder** (DB plus images), not `node_modules`. Document "copy `data/`, run `npm install`".
- Store **relative** paths (`photos/<sha256>.jpg`, `crops/<scanId>/<idx>.webp`) only.
- Provide an "Export" action: `PRAGMA wal_checkpoint(TRUNCATE)`, or better `VACUUM INTO 'export.db'`, then zip it with the images.
- Pin the Node version (`.nvmrc` / `engines`). Run `npm rebuild` on ABI mismatch.
- Consider `node:sqlite` (Drizzle ≥0.44 supports `drizzle-orm/node-sqlite`) to avoid one native module. It is still "active development" in Node, so better-sqlite3 is the safer default. Pick one in P1 and don't switch.

**Warning signs:**
Errors right after `nvm use` or on a second machine. DB file timestamp older than the `-wal` file.

**Phase to address:** P1 (layout, relative paths, driver choice). P5 (export).

---

### Pitfall 9: Secrets leak through the "portable" data folder, the client bundle, or the LAN

**What goes wrong:**
- The Anthropic key or the Discogs OAuth token+secret ends up in git, in a zip you share, or in the browser bundle.
- Anyone on the café or home Wi-Fi can call your `/api/scan` and burn Anthropic credit, or add releases to your Discogs collection.

**Why it happens:**
- Storing keys in the SQLite settings table makes them travel with the "portable" data folder.
- A `NEXT_PUBLIC_` prefix inlines a value into client JS.
- A settings GET route that echoes the stored key back to the form leaks it.
- `next dev` listens on 0.0.0.0 (all interfaces) by default (MEDIUM), and routes have no auth because "it's local".

**How to avoid:**
- Keys live in `.env.local` (gitignored), or in a separate `data/secrets.json` excluded from export. Never use a `NEXT_PUBLIC_` prefix. The settings API returns only masked values (`sk-ant-…a1b2`) and a "configured" boolean.
- Run with `next dev -H 127.0.0.1` / `next start -H 127.0.0.1`. Add `import 'server-only'` to modules that read secrets.
- `.gitignore` covers `data/`, `.env*.local`, and `*.db*` from commit #1.
- Set a monthly spend limit on the Anthropic key in Console.

**Warning signs:**
`grep -r sk-ant .next/static` returns hits. The app is reachable at the LAN IP.

**Phase to address:** P1.

---

### Pitfall 10: Hash dedup that dedups the wrong thing, or ties to the pipeline

**What goes wrong:**
- The same photo re-exported from the phone (new bytes) gets re-sent and re-billed.
- After a change to the normalization code, every hash changes and the cache misses.
- "Re-scan" overwrites the user's manual corrections.

**How to avoid:**
- Hash the **original uploaded bytes** (SHA-256) as the dedup key. Do not hash the normalized output. Optionally add a perceptual hash later to warn "looks like a photo you already scanned".
- Model scans as their own table: `photo -> scans (model, prompt_version, created_at, raw_response) -> spines`. Re-scan creates a new scan. User corrections live on a separate `spine_overrides` / reviewed layer that is never overwritten, and a mapping step carries them forward.
- Re-scan only from an explicit button with a cost estimate ("about $0.02-0.10").

**Phase to address:** P2 (schema). P4 (re-scan UX).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Send the raw phone JPEG to Claude and let the API resize | No resize code | Every crop wrong (1.82x on 12 MP), silent drift on model change | Never |
| Discogs personal access token (`Authorization: Discogs token=...`) instead of OAuth | Skips the whole OAuth 1.0a flow; 60/min, thumbnails, collection writes all work for your own account | PROJECT.md asks for OAuth; token is a long-lived credential to store | **Acceptable and recommended as P3's first auth path** for a single-user tool. Add OAuth after, behind the same `DiscogsClient` interface |
| Parse model JSON with `JSON.parse` and no stop_reason check | Fast to write | Crashes or partial data on long shelves, lost paid responses | Never. Persist the raw body first |
| Module-level DB connection / queue | One line | Duplicate connections and queues under HMR, SQLITE_BUSY, 429s | Never in dev. Use `globalThis` |
| Store absolute file paths | Simpler code | Breaks portability | Never |
| Auto-pick the top Discogs result | Skips review | Wrong pressings, master-ID adds, polluted collection | Never for import. OK for pre-selecting a default in the UI |
| Axis-aligned bbox only | Simple crop | Tilted spines include neighbour text | MVP OK. Add manual box nudge in UI later |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Opus 5.5 | `tool_choice: {type:"tool"}` to force JSON (400s); `thinking: {type:"disabled"}` (400s); old `output_format` param | `output_config.format` + `messages.parse()`; omit `thinking`; set `effort` explicitly; stream |
| Claude vision | Assuming the long edge scales to 2576 | Use the reference `resizedSize` (token budget usually binds). Opt into `oversized_image: "error"` |
| Claude vision | Base64 > 10 MB (raw phone HEIC/PNG) or unsupported format | Re-encode to JPEG/WebP at analysis size (~0.5-1.5 MB). Supported: JPEG, PNG, GIF, WebP only |
| HEIC uploads | Expecting sharp to decode iPhone HEIC | sharp prebuilt binaries exclude libheif (patent). Reject HEIC with a clear message ("export as JPEG"), or accept only browser-decodable formats in the dropzone |
| Discogs search | Believing search is unusable without auth, or that unauth is fine | [LIVE-PROBE] Unauth `/database/search` returns 200 today, but `thumb`/`cover_image` are **empty strings** and the limit is 25/min. Auth is required for the thumbnail feature. Corrects the PROJECT.md assumption |
| Discogs search | Expecting all results / `per_page=500` | [LIVE-PROBE] `per_page` caps at 100; deep result sets are page-capped (17,711 items shown as 100 pages × 100). Use field params (`artist`, `release_title`, `catno`, `format`, `type=release`), not bare `q` |
| Discogs User-Agent | Default `node-fetch`/undici UA or a browser UA | A unique UA on every request, e.g. `DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer`. Requests without one still returned 200 in today's probe, but the docs require it, and generic UAs risk lower limits or blocking |
| Discogs OAuth 1.0a | Doing HMAC-SHA1 base-string signing by hand and getting it subtly wrong | Discogs accepts **PLAINTEXT** over HTTPS: `oauth_signature="<consumer_secret>&<token_secret>"` (trailing `&` when no token yet). Flow: `GET api.discogs.com/oauth/request_token` -> `www.discogs.com/oauth/authorize?oauth_token=` -> `POST api.discogs.com/oauth/access_token` with `oauth_verifier`. Callback `http://localhost:3000/api/discogs/callback`. Then `GET /oauth/identity` for the username. Persist the request-token secret between steps (MEDIUM) |
| Discogs collection | POST to folder 0 ("All") | Folder 0 is read-only "All". Add to **folder 1 "Uncategorized"** or a user folder fetched from `GET /users/{u}/collection/folders`. Make the target folder a setting (MEDIUM) |
| Discogs collection | Hard-coding the username | Get it from `/oauth/identity`. Usernames are case-sensitive in URLs |
| Discogs coverage | Treating movie DVDs as "search failed" | Discogs catalogs music releases (incl. concert and music-video DVDs), not feature films. Add a `content_kind` guess (`music_cd|music_dvd|movie_dvd|game|unknown`) to the vision schema and route `movie_dvd` straight to "not on Discogs" without spending searches |
| Discogs images | Hotlinking `i.discogs.com` thumbs on every render | Cache chosen-candidate thumbnails into `data/` (portable, offline, no repeat fetches) |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Next.js Server Action upload | "Body exceeded 1 MB limit" on every phone photo | Upload via a Route Handler (`request.formData()`), or raise `serverActions.bodySizeLimit`. Watch the 10 MB proxy limit if middleware/proxy exists | First real photo (3-12 MB) |
| Claude call inside the request | Browser request hangs 30-120 s, dev reload kills it mid-flight (money spent, result lost) | Fire the job, persist status in SQLite, poll or SSE from the UI. Write the raw response to disk on completion | Any photo with thinking enabled |
| Output tokens dominate cost | Bill higher than the image-token math predicts | Image ≈ 4,740 tokens ≈ $0.019 on Opus 5.5, but 5K output/thinking tokens ≈ $0.10. Tune `effort`, keep schema compact (short keys, no prose), log `usage` per scan | From photo #1; matters at hundreds |
| better-sqlite3 is synchronous | UI stalls during big inserts | Wrap per-scan inserts in one transaction. WAL + `busy_timeout=5000` | Rarely at single-user scale |
| sharp on huge inputs | Memory spikes, `limitInputPixels` errors on panoramas | Downscale once to master/analysis sizes. Keep sharp concurrency low | > ~50 MP inputs |
| Batch match of a whole shelf | 40 spines × (search + release fetch) = 80 requests = 1.5-3 min at 60/min | Show per-spine progress, search one level only until the user opens a spine, cache aggressively | Every full shelf |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| App bound to 0.0.0.0 with unauthenticated mutating routes | LAN users spend your Anthropic credit and write to your Discogs | Bind `127.0.0.1`. Optionally check `Origin`/`Host` headers on POST routes |
| Secrets inside the exported/portable data folder | Keys leak when the folder is shared or backed up to the cloud | Separate secrets file excluded from export, or `.env.local` |
| Settings API echoes secrets | Key visible in devtools/network | Write-only fields, masked display |
| Logging full request headers | OAuth token secret / `x-api-key` in log files under `data/` | Redact `Authorization` and `x-api-key` in the logger |
| Trusting filenames from upload | Path traversal into `data/` | Name files by SHA-256 only. Validate MIME by magic bytes (sharp metadata), not extension |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing only the parsed title | Can't tell AI misreads from Discogs mismatches | Always show crop + `raw_text` + parsed fields + candidate cover side by side (core value) |
| No box overlay on the full photo | Missed spines are invisible; can't see that #17 was skipped | Overlay numbered boxes on the analysis image. Allow "add missed spine" by drawing a box (crop locally, no new AI call) |
| Flat list of 372 pressings | Decision paralysis | Group by master, rank by catno/label/country, show format details |
| Ambiguous statuses | Re-importing or forgetting items | Explicit state machine: `pending → searching → candidates → confirmed → importing → imported` / `not_found` / `not_on_discogs` / `failed`, with retry only from `failed`/`not_found` |
| Editing a field doesn't re-search | User thinks the fix was applied | Edit → debounce → re-queue search for that spine only. Show "searching…" |
| Silent spend | Surprise bill | Show per-scan token usage and cost. Confirm before re-scan |

## "Looks Done But Isn't" Checklist

- [ ] **Cropping:** Works with a portrait EXIF-6 photo, a 4032x3024 photo, and a panorama. Verify with a fixture overlay test.
- [ ] **Vision call:** A 50-spine photo returns all spines (no `max_tokens` stop). The raw response is persisted before parse. `refusal` handled.
- [ ] **Model change:** Switching model ID to a different tier either works or 400s loudly (`oversized_image: "error"`). Coordinates never shift silently.
- [ ] **Dedup:** Re-uploading the same file makes no API call. Re-scan keeps user corrections.
- [ ] **Discogs auth:** Thumbnails present in search results (proves the request is authenticated). Username from `/oauth/identity`.
- [ ] **Rate limit:** 100 queued searches complete with zero 429s, including after an HMR reload mid-run.
- [ ] **Import:** Kill the server mid-POST, restart, and no duplicate instance appears. `instance_id` stored. Undo works.
- [ ] **IDs:** No code path posts a `master_id`. Results filtered with `type=release`.
- [ ] **Portability:** Copy only `data/` to a fresh clone, `npm install`, and everything shows (relative paths, WAL checkpointed).
- [ ] **Secrets:** `git status` is clean of `data/` and `.env.local`. No `sk-ant` in `.next/static`. Server not reachable on the LAN IP.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Crops computed in the wrong space | LOW if raw responses + analysis dims were stored; HIGH if not | Recompute crops from stored boxes + stored dims. No re-billing. This is why both must be persisted |
| Truncated/failed parse | LOW if the raw body was saved | Re-parse from disk after fixing the parser |
| Duplicate Discogs instances | MEDIUM | List `collection/releases/{id}` instances and delete extras by `instance_id`. Needs stored instance IDs to know which ones the app added |
| Wrong release added (master/release mixup) | MEDIUM | Same delete-by-instance flow; then mark spine `candidates` again |
| Lost WAL data after copy | HIGH | Usually unrecoverable. Prevent with export via `VACUUM INTO` |
| Leaked API key | MEDIUM | Rotate the Anthropic key in Console. Revoke the Discogs app token / regenerate consumer secret |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Coordinate space / API resize | P2 | Fixture: known boxes on 4032x3024 + overlay snapshot; `oversized_image:"error"` set |
| 2 EXIF orientation | P2 | EXIF-6 fixture crops match upright view |
| 3 Dense shelf hallucination | P2 + P4 | Schema has `raw_text`/`legibility`; density warning fires on a 60-spine photo |
| 4 Structured-output reliability | P2 | 50-spine test photo; stop_reason branches unit-tested |
| 5 Master vs release ID | P3 + P4 | Type-level separation; test asserting search uses `type=release` |
| 6 Duplicate adds | P4 | Kill-mid-POST test; pre-flight collection check |
| 7 Rate-limit queue under HMR | P3 | globalThis singleton; header-driven throttle test with mocked headers |
| 8 Portability / native modules / WAL | P1 + P5 | Fresh-clone restore test of `data/` |
| 9 Secrets / LAN exposure | P1 | `.gitignore` present at first commit; host bound to 127.0.0.1; masked settings API |
| 10 Hash/re-scan semantics | P2 + P4 | Re-upload = 0 API calls; re-scan preserves overrides |

## Gaps / Needs Phase Research

- **Discogs official docs were not reachable** (403). Before P3, verify on a real account: folder-0 POST behaviour, duplicate-instance creation, 429 `Retry-After` presence, and exact OAuth error shapes.
- **Real spine accuracy is unknown.** Run a P2 spike: 3-5 real shelf photos (CD and DVD, both text directions) on Opus 5.5 at `low` vs `medium` effort. Measure misread rate, box quality, and cost. This decides the spines-per-photo guidance and whether the tiling fallback is needed.
- **`next dev` default bind address** (0.0.0.0) is from secondary sources. Confirm on the installed Next.js version.

## Sources

- [OFFICIAL] Claude Vision docs: https://platform.claude.com/docs/en/build-with-claude/vision (limits: 8000 px, 10 MB base64, 32 MB request, tier table 1568/2576 px and 1568/4784 tokens, formats, limitations)
- [OFFICIAL] Claude Coordinates & bounding boxes: https://platform.claude.com/docs/en/build-with-claude/vision-coordinates (resize algorithm, 28-px padding, `transformations.oversized_image`, orientation correction, pixel vs normalized coords)
- [OFFICIAL] Claude Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (unsupported constraints, 24 optional / 16 union limits, max_tokens/refusal behaviour, grammar cache)
- [OFFICIAL] claude-api skill reference (Opus 5.5: thinking can't be disabled, forced tool_choice 400s, effort default `medium`, pricing $4/$20 per MTok)
- [OFFICIAL] sharp docs: https://sharp.pixelplumbing.com/api-operation (autoOrient/rotate) and https://sharp.pixelplumbing.com/api-input (metadata width/height ignore EXIF orientation)
- [LIVE-PROBE] `curl` against `https://api.discogs.com/database/search` and `/releases/249504` on 2026-10-18: unauth 200, `x-discogs-ratelimit: 25`, empty `thumb`/`cover_image`, per_page cap 100, 372 CD releases for Nirvana/Nevermind master 13814
- [MEDIUM] Discogs rate limits / headers / UA (secondary): https://publicapis.dev/resource/discogs/gt7co86z, https://repo.rock-n-code.com/rock-n-code/discogs-service
- [MEDIUM] Discogs OAuth PLAINTEXT flow: https://ex-disco.hexdocs.pm/ExDisco.Auth.html, https://minim.readthedocs.io/en/latest/_modules/minim/discogs.html
- [MEDIUM] Discogs folders/instances: https://python3-discogs-client.readthedocs.io/en/latest/fetching_data.html, https://minim.readthedocs.io/en/dev/api-ref/minim.api.discogs.UsersAPI.html
- [MEDIUM] Next.js `serverExternalPackages` / Server Action 1 MB limit / proxyClientMaxBodySize: https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages, https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions, https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize
- [MEDIUM] Drizzle node:sqlite: https://orm.drizzle.team/docs/connect-node-sqlite
- [MEDIUM] better-sqlite3 ABI errors: https://docs.triliumnotes.org/developer-guide/troubleshooting/better-sqlite3
- [MEDIUM] sharp HEIC (libheif excluded from prebuilt): https://github.com/lovell/sharp/issues/1105
- [LOW-MEDIUM] `next dev` default hostname 0.0.0.0: https://mintlify.wiki/vercel/next.js/api-reference/cli/next-dev

---
*Pitfalls research for: shelf-photo → Claude vision → Discogs collection importer*
*Researched: 2026-10-18*
