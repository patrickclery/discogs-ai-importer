# Architecture Research

**Domain:** Local single-user Next.js + SQLite pipeline app (photo upload → one Claude vision call per photo → local crops → rate-limited Discogs search → human confirm → Discogs collection add)
**Researched:** 2026-10-18
**Confidence:** MEDIUM overall. Claude vision coordinate behaviour and the Next.js runtime facts come straight from official docs fetched today (platform.claude.com, nextjs.org). The research-seam classifier rates all web-fetched sources LOW, so treat the exact numbers as "verify during the phase". The Discogs API facts come from the Discogs developer docs (fetched through a mirror because discogs.com returns 403 to bots) plus client-library docs: MEDIUM. The job-queue, state-machine and data-model design is my recommendation from established patterns. It is opinionated, not something I looked up.

## Standard Architecture

### System Overview

One Node process: `next start -H 127.0.0.1`. Inside it are three logical tiers: request handlers, a durable job worker, and storage. No Redis or external queue. SQLite holds both the domain data and the job queue.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (React client)                           │
│  ┌───────────┐  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Dropzone  │  │ Spine list +    │  │ Candidate    │  │ Settings /   │  │
│  │ (multi)   │  │ crop|text|edit  │  │ picker       │  │ Connect      │  │
│  └─────┬─────┘  └───────┬─────────┘  └──────┬───────┘  └──────┬───────┘  │
│        │ POST multipart │ poll 2s           │ Server Action   │ redirect │
├────────┴────────────────┴───────────────────┴─────────────────┴──────────┤
│                   NEXT.JS REQUEST TIER (App Router)                      │
│  ┌──────────────┐ ┌────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │ Route: POST  │ │ Route: GET │ │ Server       │ │ Route: OAuth      │  │
│  │ /api/uploads │ │ /api/files │ │ Actions      │ │ start / callback  │  │
│  │ (hash,dedup, │ │ /api/status│ │ (edit,confirm│ │                   │  │
│  │  enqueue)    │ │            │ │  flag,rescan)│ │                   │  │
│  └──────┬───────┘ └─────┬──────┘ └──────┬───────┘ └─────────┬─────────┘  │
│         │ enqueue        │ read          │ enqueue / update  │ tokens    │
├─────────┴────────────────┴───────────────┴───────────────────┴───────────┤
│              DOMAIN / SERVICE LAYER  (src/server/**, server-only)        │
│  ┌────────────┐ ┌───────────┐ ┌────────────┐ ┌──────────┐ ┌───────────┐  │
│  │ jobs/queue │ │ images/   │ │ vision/    │ │ discogs/ │ │ domain/   │  │
│  │ enqueue,   │ │ normalize │ │ analyze    │ │ client + │ │ spine     │  │
│  │ claim,done │ │ resize,   │ │ (1 call/   │ │ GATE     │ │ state     │  │
│  │            │ │ crop      │ │  photo)    │ │ (60/min) │ │ machine   │  │
│  └─────┬──────┘ └─────┬─────┘ └─────┬──────┘ └────┬─────┘ └───────────┘  │
│        │              │             │             │                      │
│  ┌─────┴──────────────┴─────────────┴─────────────┴───────────────────┐  │
│  │  WORKER LOOP (started once from instrumentation.ts, nodejs runtime)│  │
│  │   lane "anthropic" (concurrency 2)  │  lane "discogs" (concurrency 1)│  │
│  └────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│                   STORAGE  (DATA_DIR, default ./data)                    │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────┐  │
│  │ app.db (SQLite, WAL) │  │ photos/ vision/ crops/ thumbs/ backups/  │  │
│  │ domain + jobs tables │  │ content-addressed files, relative paths  │  │
│  └──────────────────────┘  └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
        │ HTTPS (server-side only)                   │ HTTPS (server-side only)
        ▼                                            ▼
  api.anthropic.com  (Messages + vision)       api.discogs.com (OAuth 1.0a, search,
                                               collection) / www.discogs.com/oauth/authorize
```

### Component Responsibilities

| Component | Responsibility (owns) | Implementation | Talks to |
|-----------|----------------------|----------------|----------|
| **Upload route** `POST /api/uploads` | Accept multipart files, sha256 the bytes, dedup, write the original, create the `photos` row, enqueue the `vision` job. Returns within milliseconds. | Route Handler (not a Server Action: the 1MB body cap and sequential dispatch rule it out) | storage, db, jobs/queue |
| **File route** `GET /api/files/[...path]` | Stream originals, crops and thumbnails from DATA_DIR, with path traversal guarded | Route Handler + `fs.createReadStream`, `Cache-Control: immutable` (paths are content-addressed) | storage |
| **Status route** `GET /api/status` | Cheap counters (jobs queued/running per lane, spines per status, Discogs auth OK, rate-limit remaining) for the polling UI | Route Handler, a single SQL aggregate | db, discogs gate (in-memory stats) |
| **Server Actions** | Small user mutations: edit spine fields, re-search, select candidate, confirm import, flag not-on-Discogs, dismiss, rescan photo, save settings | `'use server'` modules that validate with zod, call the domain layer, then `revalidatePath` | domain, jobs/queue |
| **OAuth routes** `/api/discogs/oauth/{start,callback}` | Three-legged OAuth 1.0a dance; persist tokens; fetch identity | Route Handlers + redirect | discogs/oauth, db |
| **jobs/queue** | Durable job table API: `enqueue` (with dedupe key), atomic `claim`, `complete`, `fail` (with backoff), crash recovery | better-sqlite3 synchronous statements | db |
| **Worker loop** | Poll `jobs` per lane, dispatch to handlers, enforce lane concurrency | Plain async loop, a singleton on `globalThis`, started from `instrumentation.ts` | jobs/queue, handlers |
| **images/** | EXIF auto-orient + normalize, compute the vision-sized image, crop spines, rotate crops for readability | sharp | storage |
| **vision/** | Build the prompt and schema, make exactly ONE Messages call per photo, persist the raw response *before* parsing, then parse/validate | @anthropic-ai/sdk + structured output/tool schema + zod | Anthropic API, db, images |
| **discogs/client + gate** | Sign requests (OAuth PLAINTEXT), serialize every Discogs HTTP call through one rate gate, read `X-Discogs-Ratelimit-*` headers, handle 429/401 | Hand-rolled `fetch` wrapper (about 60 lines) + in-memory token gate | Discogs API, db (auth row) |
| **discogs/search + score** | Build 1–2 queries per spine, store candidates, rank them locally | Pure functions + client | gate, db |
| **discogs/collection** | Idempotent add-to-collection; record `instance_id` | client | gate, db |
| **domain/spine-state** | The *only* place spine status changes; a transition table rejects illegal moves | Pure TS + one `transition(spineId, event)` DB helper | db |
| **settings** | API keys and Discogs consumer credentials (env overrides DB), selected folder id, model id | `settings` table + `process.env` | db |

## Recommended Project Structure

```
discogs-ai-importer/
├── data/                         # DATA_DIR. Gitignored. THE portable unit (copy this folder = move the app state)
│   ├── app.db                    # SQLite (WAL mode → also app.db-wal / app.db-shm while running)
│   ├── photos/ab/<sha256>.jpg    # normalized original (EXIF-rotated, metadata stripped), sharded by first 2 hex chars
│   ├── vision/ab/<sha256>.jpg    # EXACT bytes sent to Claude (pre-resized to model limits) → bbox coords are in this space
│   ├── crops/ab/<sha256>/<runId>-<idx>.webp   # spine crops, grouped by photo, versioned by vision run
│   ├── thumbs/<releaseId>.jpg    # optional cached Discogs thumbnails (only if hotlinking fails)
│   └── backups/                  # VACUUM INTO snapshots
├── drizzle/                      # generated SQL migrations (committed)
├── src/
│   ├── instrumentation.ts        # register(): if NEXT_RUNTIME==='nodejs' → migrate DB, recover jobs, start worker
│   ├── app/
│   │   ├── page.tsx              # Dashboard: dropzone + spine list (filter by status)
│   │   ├── photos/[id]/page.tsx  # Photo view with bbox overlay + its spines
│   │   ├── spines/[id]/page.tsx  # (or a drawer) crop | AI text | editable fields | candidates
│   │   ├── settings/page.tsx     # keys, Discogs connect, folder, model
│   │   ├── actions/              # 'use server' modules: spines.ts, photos.ts, settings.ts
│   │   └── api/
│   │       ├── uploads/route.ts
│   │       ├── files/[...path]/route.ts
│   │       ├── status/route.ts
│   │       └── discogs/oauth/{start,callback}/route.ts
│   ├── components/               # client components (Dropzone, SpineRow, CandidateCard, LiveRefresher)
│   └── server/                   # every file starts with `import 'server-only'`
│       ├── config.ts             # DATA_DIR resolution, env, settings precedence
│       ├── db/{client,schema,migrate}.ts
│       ├── storage/{paths,files}.ts          # relative-path helpers; the only code that knows DATA_DIR
│       ├── images/{normalize,vision-size,crop}.ts
│       ├── vision/{prompt,schema,analyze}.ts
│       ├── discogs/{oauth,client,gate,search,score,collection}.ts
│       ├── jobs/{queue,worker}.ts
│       ├── jobs/handlers/{vision,search,collection-add}.ts
│       └── domain/{spine-state,photo,settings}.ts
├── .env.local                    # optional: ANTHROPIC_API_KEY, DISCOGS_CONSUMER_KEY/SECRET, DATA_DIR (gitignored)
└── next.config.ts                # serverExternalPackages for better-sqlite3/sharp if not defaulted; bodySizeLimit irrelevant (uploads use a route)
```

### Structure Rationale

- **`data/` outside `public/`:** Next.js serves `public/` files that exist at build time, so files added at runtime are not reliably served there. Keeping state out of the source tree also makes "copy `data/`" the whole portability story. A route handler serves the images.
- **`src/server/` with `server-only`:** keeps the DB, the keys and sharp out of client bundles. This also lets the worker code be lifted into a standalone `tsx scripts/worker.ts` process later if needed, because it never imports `next/*`.
- **`storage/paths.ts` as the single DATA_DIR authority:** the DB stores only *relative* paths (`photos/ab/abcd….jpg`). Moving the folder or changing `DATA_DIR` then never breaks a row.
- **`jobs/handlers/` one file per job type:** each handler is a pure-ish `(payload, ctx) => Promise<void>` that you can unit-test without the loop.

## Data Model

Drizzle + better-sqlite3. IDs are text ULIDs (sortable, safe in URLs). All timestamps are integer epoch ms. All paths are relative to DATA_DIR.

```
settings            key TEXT PK, value TEXT, updated_at
                    (anthropic_api_key, discogs_consumer_key/secret, discogs_folder_id=1,
                     vision_model, vision_prompt_version) — env vars take precedence

discogs_auth        id=1 (singleton), access_token, access_token_secret, username, user_id,
                    connected_at, last_verified_at, invalid_at (set on 401)
oauth_pending       request_token PK, request_token_secret, created_at   (rows < 15 min old)

photos              id, sha256 UNIQUE, original_filename, mime, bytes,
                    width, height                    -- normalized (auto-oriented) dims
                    path                             -- photos/ab/<sha>.jpg
                    vision_path, vision_width, vision_height   -- the image actually sent
                    status  ('uploaded'|'analyzing'|'analyzed'|'failed')
                    current_run_id → vision_runs.id
                    spine_count, created_at, updated_at

vision_runs         id, photo_id, model, prompt_version, max_edge, max_tokens,
                    status ('queued'|'running'|'succeeded'|'parse_failed'|'failed'),
                    raw_response TEXT              -- persisted BEFORE parsing (never pay twice)
                    input_tokens, output_tokens, error, started_at, finished_at

spines              id, photo_id, vision_run_id, idx (left→right order),
                    bbox_x1, bbox_y1, bbox_x2, bbox_y2   -- in NORMALIZED-original pixel space
                    text_rotation (0|90|180|270), crop_path,
                    -- what the AI read (immutable after insert):
                    ai_artist, ai_title, ai_format, ai_catno, ai_label, ai_raw_text, ai_confidence,
                    -- user corrections (nullable; effective = COALESCE(user_x, ai_x)):
                    user_artist, user_title, user_format, user_catno, user_label,
                    status (see state machine), status_reason,
                    search_generation INTEGER default 0,   -- bump on every re-search
                    selected_candidate_id, discogs_release_id, discogs_instance_id,
                    superseded INTEGER default 0,          -- hidden after a rescan
                    created_at, updated_at
                    INDEX (status), INDEX (photo_id)

candidates          id, spine_id, search_generation, rank, query_used,
                    release_id, master_id, title, year, country, formats_json, labels_json,
                    catno, barcode_json, thumb_url, cover_url,
                    in_collection INTEGER,                 -- from search user_data when authenticated
                    score REAL, created_at
                    INDEX (spine_id, search_generation)

imports             id, spine_id, release_id, folder_id, instance_id,
                    status ('queued'|'running'|'succeeded'|'failed'),
                    response_json, error, created_at, finished_at
                    UNIQUE (spine_id) WHERE status='succeeded'   -- partial index: one success per spine

jobs                id INTEGER PK, type ('vision'|'discogs_search'|'collection_add'|'thumb_fetch'),
                    lane ('anthropic'|'discogs'), payload_json, priority INTEGER,
                    status ('queued'|'running'|'succeeded'|'failed'|'cancelled'),
                    attempts, max_attempts, run_after (epoch ms), locked_at,
                    dedupe_key UNIQUE,      -- e.g. 'vision:<photoId>:<runId>', 'search:<spineId>:<gen>'
                    last_error, created_at, updated_at
                    INDEX (lane, status, run_after, priority)
```

Key modelling decisions:
- **`ai_*` and `user_*` are separate columns.** Core value: "spine image always visible next to what the AI read". Overwriting the AI fields destroys that comparison and the ability to measure OCR accuracy later.
- **`vision_runs` is its own table.** A rescan creates a new run. The old run's raw JSON is kept for audit and cost tracking, and spines point at the run that produced them.
- **`search_generation`** keeps late results from a stale search from clobbering a newer one. The handler discards results whose generation != the spine's current generation.
- **No BLOBs.** Images live as files, which you can view, stream and diff, and which keep `app.db` small and fast to back up.

## Spine State Machine

Internal states are finer-grained than the five UI states in PROJECT.md. A display mapping collapses them.

```
                  (vision job inserts spine + crop)
                               │
                               ▼
                       ┌──────────────┐  re-search / edit fields
         ┌────────────►│ queued_search│◄───────────────────────────┐
         │             └──────┬───────┘                            │
         │                    │ worker claims search job           │
         │                    ▼                                    │
         │             ┌──────────────┐                            │
         │             │  searching   │──error (retries exhausted)─┼──► failed ──retry──┐
         │             └──┬────────┬──┘                            │                    │
         │       ≥1 cand. │        │ 0 candidates                  │                    │
         │                ▼        ▼                               │                    │
         │       ┌──────────┐  ┌──────────┐                        │                    │
         │       │  review  │  │ no_match │────────────────────────┤                    │
         │       └────┬─────┘  └────┬─────┘                        │                    │
         │            │ user confirms candidate                    │                    │
         │            ▼             │  user flags                  │                    │
         │     ┌─────────────┐      ▼                              │                    │
         │     │import_queued│  ┌────────────────┐  unflag ────────┘                    │
         │     └──────┬──────┘  │ not_on_discogs │                                      │
         │            ▼         └────────────────┘                                      │
         │     ┌─────────────┐                                                          │
         │     │  importing  │──error──► import_failed ──retry──► import_queued          │
         │     └──────┬──────┘                                                          │
         │            ▼                                                                 │
         │     ┌─────────────┐   (terminal; never re-imported automatically)            │
         │     │  imported   │                                                          │
         │     └─────────────┘                                                          │
         └──────────────────────────────────────────────────────────────────────────────┘
   Any non-imported state ──dismiss──► dismissed  (AI false positive: bookend, divider, etc.)
```

| Internal status | UI badge (PROJECT.md) | Allowed user events |
|-----------------|----------------------|---------------------|
| queued_search, searching | pending | edit (cancels + requeues), dismiss |
| review | pending (needs review) | select / confirm, edit, re-search, flag, dismiss |
| no_match | not found | edit, re-search, flag, dismiss |
| not_on_discogs | not found (flagged) | unflag, dismiss |
| import_queued, importing | matched | none (locked) |
| imported | imported | none (read-only; show Discogs link) |
| failed, import_failed | failed | retry, edit, dismiss |
| dismissed | hidden by default | restore |

Implement this as a **transition table** (`Record<Status, Partial<Record<Event, Status>>>`) plus a `transition()` helper that runs `UPDATE spines SET status=? WHERE id=? AND status=?` (compare-and-set). If 0 rows change, the move was illegal or lost a race (for example, a double-click on Confirm). That guard is the first line of duplicate-import protection.

**Photo states:** `uploaded → analyzing → analyzed | failed`. Rescan (explicit user action only) moves `analyzed|failed → analyzing` with a new `vision_run`. On success, the previous run's spines are marked `superseded=1` **except** `imported` ones, which stay visible and linked. Gap: you still need to decide whether to try matching new spines to old ones by bbox overlap so user edits carry over. The simplest acceptable v1: rescan warns "un-imported edits on this photo will be discarded".

## Architectural Patterns

### Pattern 1: Durable SQLite job table + in-process worker started from `instrumentation.ts`

**What:** Every slow or external operation (the vision call, each Discogs search, each collection add) is a row in `jobs`. One worker loop, started once per server process from `register()`, claims jobs atomically and runs them per lane.
**When to use:** Always, for this app. A request handler or Server Action never calls Anthropic or Discogs directly.
**Why this and not the alternatives:**
- *Server Actions for the long work*: Next.js dispatches Server Actions **one at a time per client**, so a 30-second vision call would freeze every other button. They are also capped at 1MB request bodies by default. (Official Next.js docs.)
- *Route handler that awaits the vision call*: the work is lost on refresh or restart, there are no retries, and it can't be throttled across requests.
- *`after()`*: fire-and-forget with no durability or concurrency control. Good for logging, wrong for a queue.
- *A separate worker process (BullMQ/Redis, or a `tsx` worker)*: adds infrastructure and a second command for no gain at single-user scale. Keep `src/server/jobs` free of `next/*` imports so this remains a 10-line escape hatch.
**Trade-offs:** In `next dev`, HMR can re-evaluate modules, so guard with a `globalThis` singleton. The atomic claim makes a double loop harmless anyway. `register()` runs in every runtime, so gate on `NEXT_RUNTIME === 'nodejs'` and import node-only code dynamically (official docs).

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { bootServer } = await import('./server/boot'); // migrate, recover, start worker
  await bootServer();
}

// src/server/jobs/queue.ts  (better-sqlite3 is synchronous → claim is atomic by construction)
const claimStmt = db.prepare(`
  UPDATE jobs SET status='running', locked_at=@now, attempts=attempts+1, updated_at=@now
  WHERE id = (SELECT id FROM jobs
              WHERE lane=@lane AND status='queued' AND run_after<=@now
              ORDER BY priority DESC, id ASC LIMIT 1)
  RETURNING *`);
export const claim = (lane: Lane) => claimStmt.get({ lane, now: Date.now() }) as Job | undefined;

// boot: single process, so anything 'running' at startup was interrupted
db.prepare(`UPDATE jobs SET status='queued', locked_at=NULL WHERE status='running'`).run();

// src/server/jobs/worker.ts
const g = globalThis as { __worker?: boolean };
export function startWorker() {
  if (g.__worker) return; g.__worker = true;
  runLane('anthropic', 2);   // vision: modest parallelism
  runLane('discogs', 1);     // everything Discogs is serialized; the gate does pacing
}
```

### Pattern 2: Coordinate-safe vision pipeline (pre-resize, then a single scale factor)

**What:** Claude returns bounding boxes as **absolute pixels in the image it sees after server-side resizing**, not in your original. The high-res tier (Claude 4.7 and later) caps images at 2576px on the long edge and 4784 visual tokens. Other models cap at 1568px and 1568 tokens. Tokens are `ceil(w/28)*ceil(h/28)`, and for most photos the **token limit**, not the edge limit, sets the final size. (Official Claude vision-coordinates docs.)
**Do:**
1. `normalized = sharp(raw).rotate()` (apply EXIF orientation) → save as `photos/…`. Hash the **raw upload bytes** for dedup.
2. Compute `[vw, vh] = resizedSize(w, h, maxEdge, maxTokens)` using the docs' reference implementation (it includes the banker's-rounding detail), resize to exactly that, and save as `vision/…`.
3. Send that image with `transformations: { oversized_image: "error" }` so any tier mismatch fails loudly instead of silently shifting every box.
4. Ask for `[x1, y1, x2, y2]` **pixel** coordinates (the docs say Claude does worse with normalized 0–1000 coordinates) via a structured-output schema. Also ask for spine order and text rotation.
5. Map to original space with `sx = w / vw`, `sy = h / vh`, clamp, add about 6% padding on the short axis, then `sharp(normalized).extract(...)`. Rotate the crop by `text_rotation` so the UI shows readable text.
**Trade-offs:** The vision image is small relative to a 12MP phone photo, so thin spines may get only 20–40px of width. Crops come from the *full-resolution* normalized image, so the review UI stays crisp even when the AI saw a smaller version.

```typescript
const { width: w, height: h } = await sharp(normPath).metadata();
const [vw, vh] = resizedSize(w!, h!, 2576, 4784);           // tier must match the model in settings
const sx = w! / vw, sy = h! / vh;
const box = (b: [number, number, number, number]) => {
  const [x1, y1, x2, y2] = b.map((v, i) => Math.max(0, i % 2 ? Math.min(v, vh) : Math.min(v, vw)));
  return { left: Math.round(x1 * sx), top: Math.round(y1 * sy),
           width: Math.round((x2 - x1) * sx), height: Math.round((y2 - y1) * sy) };
};
```

### Pattern 3: Single Discogs gate (all HTTP to Discogs goes through one choke point)

**What:** A process-wide gate that serializes Discogs requests and paces them. Discogs allows 60 req/min authenticated (25 unauthenticated), counted **per source IP** over a **moving 60-second window**. It reports `X-Discogs-Ratelimit`, `X-Discogs-Ratelimit-Used` and `X-Discogs-Ratelimit-Remaining` on responses.
**Rules:**
- Concurrency 1, minimum spacing about 1100ms (about 54/min, which leaves headroom for the OAuth or identity calls the user makes).
- After each response, if `Remaining <= 3`, pause about 15s and re-probe. On **429**, pause the whole lane for 60s and requeue the job with `run_after` (don't count that as a failed attempt).
- On **401**, set `discogs_auth.invalid_at`, pause the Discogs lane, and show a "Reconnect Discogs" banner. Don't burn retries.
- Priority: `collection_add` (user is waiting) at 100 > search for a spine the user just edited at 50 > bulk post-vision searches at 0.
- The browser never calls the Discogs API directly. That would leak tokens and hit CORS, and it would consume the same per-IP budget invisibly.

**Throughput reality:** at most 2 requests per spine (structured query, then a broad `q=` fallback only if the first returns 0), so roughly 25–50 spines/min. A 40-spine shelf photo takes 1–2 minutes to fully search. The UI must show per-lane progress so this doesn't look like a hang.

```typescript
// src/server/discogs/gate.ts
let nextAt = 0, pausedUntil = 0, chain = Promise.resolve();
export function viaGate<T>(fn: () => Promise<Response>, parse: (r: Response) => Promise<T>) {
  const run = async () => {
    const wait = Math.max(nextAt, pausedUntil) - Date.now();
    if (wait > 0) await sleep(wait);
    const res = await fn();
    nextAt = Date.now() + 1100;
    const remaining = Number(res.headers.get('x-discogs-ratelimit-remaining') ?? 60);
    if (remaining <= 3) pausedUntil = Date.now() + 15_000;
    if (res.status === 429) { pausedUntil = Date.now() + 60_000; throw new RateLimited(); }
    if (res.status === 401) throw new DiscogsAuthInvalid();
    return parse(res);
  };
  const p = chain.then(run, run); chain = p.then(() => {}, () => {});
  return p;
}
```

### Pattern 4: Persist-then-parse for paid calls

**What:** The vision handler writes `vision_runs.raw_response` (plus token usage) in the same step that receives the response, **before** any zod parsing or cropping. If parsing or cropping fails, the run becomes `parse_failed` and can be re-processed from the stored JSON with no new API call.
**Retry policy:** Auto-retry only on transport failures, 429, 5xx and 529/overloaded, with exponential backoff and at most 3 attempts. Never auto-retry once a response body exists. Any new Claude call for a photo that already has a successful run requires the explicit "Rescan" action. This is the code-level enforcement of "no accidental repeat API spend".

### Pattern 5: Idempotent collection add

**What:** Discogs **allows multiple instances of the same release**. Each `POST /users/{username}/collection/folders/{folder_id}/releases/{release_id}` creates a new `instance_id`, so a retried or double-submitted add creates duplicates in the user's real collection.
**Guards (all three):**
1. A compare-and-set spine transition `review → import_queued` (a double-click becomes a no-op).
2. `jobs.dedupe_key = 'add:<spineId>'` plus the partial unique index on `imports (spine_id) WHERE status='succeeded'`.
3. A crashed `importing` job (worker died mid-request) is **not** blindly re-POSTed. First `GET /users/{u}/collection/releases/{release_id}` checks whether an instance was created since `imports.created_at`. That costs one request, only on recovery.
Also surface `candidates.in_collection` (from search `user_data` when authenticated; MEDIUM confidence, verify in the phase) as an "already in your collection" warning before confirm, and default `folder_id` to 1 (Uncategorized; folder 0 is the read-only "All").

## Data Flow

### Pipeline (upload → collection)

```
[Drop N files]
   │  POST /api/uploads (multipart; client may limit to 3 concurrent uploads)
   ▼
sha256(raw bytes) ── exists? ──yes──► return existing photo {duplicate:true}   (NO Claude call)
   │ no
   ▼
sharp.rotate() → photos/ab/<sha>.jpg ; resizedSize → vision/ab/<sha>.jpg
INSERT photos(status='uploaded'), vision_runs(status='queued'), jobs(type='vision', lane='anthropic')
   │  response returns now; UI shows photo card "queued"
   ▼
WORKER[anthropic] claims vision job ─► photos.status='analyzing'
   │  ONE messages.create(image=vision jpg, schema=spines[]) ──► Anthropic
   ▼
persist raw_response + usage ─► zod parse ─► for each spine: map bbox → crop → crops/…webp
INSERT spines(status='queued_search') + jobs(type='discogs_search', lane='discogs', dedupe 'search:<id>:0')
photos.status='analyzed'                                     (one SQLite transaction)
   ▼
WORKER[discogs] claims search job ─► spine 'searching'
   │  GATE ─► GET /database/search?type=release&artist=…&release_title=…&format=CD|DVD&catno=…&per_page=10
   │          (0 hits → one fallback: q="<artist> <title>")
   ▼
INSERT candidates(gen=N) + local score ─► spine 'review' | 'no_match'
   ▼
[User] sees crop | AI text | candidate thumbnails → edits (→ queued_search, gen+1) or confirms
   │  Server Action confirmImport(spineId, candidateId): CAS review→import_queued, enqueue collection_add (priority 100)
   ▼
WORKER[discogs] ─► GATE ─► POST /users/{u}/collection/folders/{folder}/releases/{rid}
   ▼
imports.succeeded(instance_id) ─► spine 'imported'
```

### UI State Management

Server Components read SQLite directly for lists. Interactivity goes through Server Actions with `revalidatePath`. Background progress uses polling: a small client `<LiveRefresher>` hits `/api/status` every 2s and calls `router.refresh()` when counters change, stopping when no jobs are active. SSE is unnecessary for one local user, and polling survives dev-server restarts for free.

```
SQLite ──(RSC read)──► Server Components ──► HTML/RSC payload
   ▲                                              │
   │ domain.transition / enqueue                  ▼
Server Actions ◄──────── user clicks ───── Client components
   ▲                                              │
   └── worker writes ──► /api/status counters ◄── poll 2s ──► router.refresh()
```

### Discogs OAuth 1.0a Flow (PLAINTEXT signature over HTTPS)

```
Settings: consumer key/secret saved (env or settings table)
   │ click "Connect Discogs"
   ▼
GET /api/discogs/oauth/start
   POST https://api.discogs.com/oauth/request_token
     Authorization: OAuth oauth_consumer_key, oauth_nonce, oauth_timestamp,
       oauth_signature_method="PLAINTEXT", oauth_signature="<consumer_secret>&",
       oauth_callback="http://127.0.0.1:3000/api/discogs/oauth/callback"
     Content-Type: application/x-www-form-urlencoded ; User-Agent: DiscogsAIImporter/0.1
   ◄ oauth_token, oauth_token_secret  → INSERT oauth_pending
   302 → https://www.discogs.com/oauth/authorize?oauth_token=<request_token>
   ▼  (user approves on discogs.com)
GET /api/discogs/oauth/callback?oauth_token=…&oauth_verifier=…
   lookup oauth_pending by token (reject if missing or > 15 min old)
   POST https://api.discogs.com/oauth/access_token
     oauth_token=<request_token>, oauth_verifier, oauth_signature="<consumer_secret>&<request_token_secret>"
   ◄ access oauth_token + oauth_token_secret (do not expire; revocable by user)
   UPSERT discogs_auth ; DELETE oauth_pending
   GET /oauth/identity (via gate) → store username (needed for collection URLs)
   302 → /settings?connected=1
```

Every later request is signed with `oauth_signature="<consumer_secret>&<access_token_secret>"` plus `oauth_token`, a fresh nonce and a timestamp. Hand-roll this. It's string building, and `disconnect` (npm, last published Jan 2025, callback-style, bundles its own throttling) would fight the gate design.

**Auth strategy seam:** put signing behind `interface DiscogsAuth { headers(): Record<string,string> }` with two implementations, `OAuthAuth` and `PersonalTokenAuth` (`Authorization: Discogs token=…`). The personal token lets the search phase be built and tested before the OAuth phase lands, and it is a reasonable fallback for a single-user tool. (MEDIUM: I believe a personal token can write to the owner's own collection. Verify.)

**Token storage:** plaintext in `data/app.db`. This is acceptable for a single-user local tool *only if* the server binds to `127.0.0.1` (Server Actions and routes have no auth layer) and `data/` is gitignored. Document that copying `data/` copies the credentials. Optional hardening: encrypt token columns with a key held in `.env.local`, which keeps secrets out of a shared `data/` folder.

## Scaling Considerations

The realistic scale is one user and a few hundred to a few thousand spines in total.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 shelf (≈ 20–60 spines) | Everything above as-is. Searches finish in 1–2 min. |
| Whole collection (≈ 1–5k spines, 50–150 photos) | Still fine. Discogs needs about 1–3 h of wall-clock search time, so the queue must survive restarts (it does) and the UI needs per-lane ETA. Add a "pause Discogs lane" toggle. |
| Beyond | Not a goal. Multi-user would need auth, per-user tokens and Postgres. Out of scope per PROJECT.md. |

### Scaling Priorities

1. **First bottleneck: the Discogs 60/min per-IP limit.** Mitigate by capping at 2 requests per spine, never auto-re-searching unchanged input (`search_generation` and dedupe key), and loading thumbnails from search results by hotlink (MEDIUM: Discogs docs say image requests need auth and are rate-limited, while search `thumb` URLs on the CDN generally load in an `<img>`. Verify, and fall back to a gated `thumb_fetch` job cached in `data/thumbs/`).
2. **Second: Claude latency and cost per photo.** Lane concurrency 2. The cost is bounded by the dedup and persist-then-parse rules, not by architecture.
3. **Third: SQLite write contention** between the worker and request handlers. Use `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`, and keep transactions short (never hold one across an HTTP call).

## Anti-Patterns

### Anti-Pattern 1: Calling Claude or Discogs inside the upload request or a Server Action
**What people do:** `await anthropic.messages.create()` in the upload handler, then return the spines.
**Why it's wrong:** Server Actions run one at a time per client, so the whole UI blocks behind a 20–60s call. A refresh loses the work. There's no throttling across photos, and a retry after a timeout pays twice.
**Do this instead:** The request stores the file and enqueues a job. The worker does the call. The UI polls.

### Anti-Pattern 2: Using Claude's bbox coordinates against the original photo
**What people do:** Send the 4032×3024 phone photo, get boxes back, crop the original at those numbers.
**Why it's wrong:** Claude sees a downscaled image (token-limited, not just edge-limited), so every crop lands in the wrong place, often on the neighbouring spine.
**Do this instead:** Pre-resize with the reference `resizedSize`, send with `oversized_image: "error"`, and scale by `original / sent` (Pattern 2).

### Anti-Pattern 3: An in-memory-only queue (p-queue/bottleneck holding the work)
**What people do:** `queue.add(() => searchDiscogs(spine))` for 40 spines.
**Why it's wrong:** Restarting the dev server (which happens constantly) silently drops the pending work, and spines sit in "searching" forever.
**Do this instead:** Keep job state in SQLite. In-memory structures may only *pace* (the gate), never *own* work.

### Anti-Pattern 4: Overwriting AI-extracted fields with user edits
**Why it's wrong:** It breaks the core-value side-by-side view and removes the data needed to tune the prompt.
**Do this instead:** Keep separate `ai_*` and `user_*` columns, with effective = `COALESCE`.

### Anti-Pattern 5: Absolute paths, `public/` storage, or a live-copied WAL database
**Why it's wrong:** Absolute paths break when the folder moves. `public/` isn't served for runtime files after build. Copying `app.db` without `-wal` while the app runs can lose recent writes.
**Do this instead:** Store relative paths, serve through `/api/files`, and provide an "Export / Backup" action that runs `PRAGMA wal_checkpoint(TRUNCATE)` + `VACUUM INTO 'backups/…db'`. Document "stop the app, then copy `data/`".

### Anti-Pattern 6: A non-idempotent "Add to collection"
**Why it's wrong:** Discogs happily creates duplicate instances, which pollutes the real collection, the exact thing the human-confirm decision exists to prevent.
**Do this instead:** Pattern 5 (CAS transition + dedupe key + verify-before-retry).

### Anti-Pattern 7: Scattered `UPDATE spines SET status=…`
**Why it's wrong:** Races between worker and UI (the user edits while a search is running) produce impossible states, such as `review` with candidates from the old text.
**Do this instead:** Make all status changes through `domain/spine-state.transition()` with compare-and-set, plus `search_generation` for stale results.

## Integration Points

### External Services

| Service | Integration Pattern | Notes / gotchas |
|---------|---------------------|-----------------|
| Anthropic Messages (vision) | `@anthropic-ai/sdk`, base64 image, structured output schema, only from the `anthropic` lane | 10MB base64 per image, 8000px hard max, JPEG/PNG/GIF/WebP only. **HEIC from iPhones is not accepted**, and sharp's prebuilt binaries likely can't decode HEIC either (MEDIUM). Convert in the browser or reject with a clear message. Pin `max_edge/max_tokens` to the configured model's tier. |
| Discogs OAuth | Route handlers, PLAINTEXT signature, tokens in `discogs_auth` | Unique User-Agent required on every request. Callback must be reachable by the browser (localhost is fine). Tokens don't expire; handle 401 as "revoked". |
| Discogs Database Search | `GET /database/search` via gate | Requires auth. Use structured params (`type=release`, `artist`, `release_title`, `format`, `catno`, `barcode`, `per_page`). Movie DVDs won't exist, so expect `no_match` → `not_on_discogs`. |
| Discogs Collection | `POST …/collection/folders/{folder_id}/releases/{release_id}` → `instance_id` | Folder 1 = Uncategorized. Duplicates allowed (see Pattern 5). Needs `username` from `/oauth/identity`. |
| Discogs images | Hotlink search `thumb`/`cover_image` with plain `<img>` (not the `next/image` optimizer) | Image access may be auth-gated or rate-limited. Fall back to a gated fetch cached in `data/thumbs/`. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| UI ↔ request tier | multipart POST (uploads), Server Actions (mutations), GET polling (status), `<img src="/api/files/…">` | Server Actions only for sub-second DB mutations |
| Request tier ↔ worker | **Only via the `jobs` table** (enqueue) and spine/photo rows (read) | No direct function calls into handlers from requests, so the worker stays extractable |
| Worker ↔ external APIs | Anthropic client (lane concurrency), Discogs **gate** (global serialization) | Gate is the single choke point; nothing else imports `fetch` for discogs.com |
| Everything ↔ spine status | `domain/spine-state.transition()` | CAS update; illegal transitions throw |
| Everything ↔ filesystem | `storage/paths.ts` | Relative paths only; traversal check in `/api/files` |

## Suggested Build Order

Dependencies drive the order. Coarse granularity (per config) fits 5 phases.

1. **Foundation: storage, DB, settings, job queue skeleton.** Covers DATA_DIR resolution, Drizzle schema and migrations run at boot from `instrumentation.ts`, WAL pragmas, the `settings` table with env precedence, `/api/files`, the `jobs` table with enqueue/claim/recover, and an idle worker loop. *Everything depends on this. Verify the worker singleton survives `next dev` HMR here, before any paid calls exist.*
2. **Upload + dedup + vision + crops.** Covers the upload route, raw-byte sha256 dedup, EXIF normalize, `resizedSize` pre-resize, the single vision call with persist-then-parse, bbox mapping and crops, and a spine list showing crop | AI text | editable `user_*` fields. *Delivers the core value ("see what the AI read next to the spine") without any Discogs dependency. Needs deeper research on prompt/schema design, model tier choice and dense-shelf accuracy.*
3. **Discogs connect + search.** Covers the Discogs client with the auth-strategy seam (personal token first for fast iteration, then full OAuth 1.0a start/callback/identity), the gate, search jobs auto-enqueued after vision, candidates with local scoring and thumbnails, re-search on edit with `search_generation`. *Can start in parallel with Phase 2, since the search input is just text, but its UI integrates with Phase 2's spine list.*
4. **Confirm + import + full state machine.** Covers the transition table, confirm Server Action, `collection_add` jobs, idempotency guards, `imported`/`import_failed`, not-on-Discogs flag, dismiss, retry, status filters and badges. *Depends on 3 (candidates and OAuth tokens with write access).*
5. **Hardening and portability.** Covers rescan (new vision run, supersede rules), backup/export (`VACUUM INTO`), Discogs-lane pause, 401 reconnect banner, per-lane progress/ETA, crash-recovery verification for `importing` jobs, and binding to 127.0.0.1.

**Research flags:**
- Phase 2: needs deeper research on the vision prompt and schema, high-res versus standard tier for dense shelves, and whether sending the full photo plus 2–3 tiles *in the same single request* improves small-text accuracy without breaking the one-call rule. Coordinate math per tile would need offsets.
- Phase 3: needs verification of the search `user_data.in_collection` field, thumbnail hotlink behaviour, whether `oauth_callback` per request overrides the app's registered callback, and personal-token write access.
- Phases 1, 4, 5: standard patterns, unlikely to need research.

## Sources

- Claude Vision docs: image limits, tiers, token formula, HEIC not in the supported list. https://platform.claude.com/docs/en/build-with-claude/vision (official, fetched 2026-10-18)
- Claude "Coordinates and bounding boxes": coordinates are in post-resize space, `resizedSize` reference implementation, `transformations.oversized_image: "error"`, ask for pixel coordinates rather than normalized ones. https://platform.claude.com/docs/en/build-with-claude/vision-coordinates (official, fetched 2026-10-18)
- Next.js Instrumentation guide: `register()` called once per server instance, `NEXT_RUNTIME` gating. https://nextjs.org/docs/app/guides/instrumentation (official, lastUpdated 2026-08-06)
- Next.js Server Actions guide: sequential dispatch per client, 1MB default body limit. https://nextjs.org/docs/app/guides/server-actions and https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions (official, lastUpdated 2026-10-15 / 2026-08-26)
- Discogs API docs (via mirror; discogs.com/developers returns 403 to fetchers): OAuth endpoints, PLAINTEXT, User-Agent, `/oauth/identity`, personal token, folder 1, `instance_id`, image auth. https://www.discogs.com/developers (MEDIUM)
- Discogs rate-limit headers and moving window. https://apis.io/rate-limits/discogs/discogs-rate-limits/ and the Discogs developers page (MEDIUM)
- Duplicate instances allowed in collection. https://python3-discogs-client.readthedocs.io/en/latest/fetching_data.html (MEDIUM)
- `disconnect` npm README and registry metadata (v1.2.2, modified 2025-01-06). https://cdn.jsdelivr.net/npm/disconnect@1.2.2/README.md
- npm registry versions checked 2026-10-18: next 16.4.2, drizzle-orm 0.45.4, better-sqlite3 13.0.3, sharp 0.35.5, @anthropic-ai/sdk 0.135.0

---
*Architecture research for: local Next.js + SQLite spine-photo → Discogs importer*
*Researched: 2026-10-18*
