# Phase 4: Import & Review Queue - Research

**Researched:** 2026-10-22
**Domain:** Non-idempotent Discogs collection write (exactly-once via intent + reconcile), durable SQLite job extension, derived review status and filter UI
**Confidence:** HIGH (codebase, Discogs docs, live read-only probe). MEDIUM on POST error shapes, which can't be probed without writing to the owner's account.

## Summary

Phase 4 adds the app's first write to the owner's Discogs account: one `POST /users/{u}/collection/folders/{folder_id}/releases/{release_id}`. The existing machinery covers most of it. The durable `jobs` table, the `discogs` lane (concurrency 1), the shared pacing gate, 429 deferral without spending an attempt, the WR-04 `ctx.isCurrent()` fence, boot recovery, the stranded-job reaper and `releaseDedupeKey()` all already exist and are tested. The new pieces are an `imports` table, an `add_to_collection` handler, a widened write gate in `client.ts`, a pure review-status function, a few routes, and UI on the card and the filter bar. No new npm packages are needed.

The core problem is that Discogs does not make the POST idempotent. Every POST creates a new `instance_id` [CITED: discogs.com/developers, archived 2025-12-26]. Exactly-once comes from three things. First, an intent row written before the POST. Second, a single `GET /users/{u}/collection/releases/{id}` at the start of every attempt, which serves as both the D-05 pre-check and the D-07 reconcile. Third, an adoption rule that does not depend on clocks alone. Store a snapshot of the instance ids that existed before the POST, and adopt any new instance that is not already recorded locally. The `date_added >= intent_at - margin` test then acts only as a secondary guard.

A live read-only probe of the owner's account (GET only, 2026-10-22) found four facts that change the plan:
1. The collection is empty: folders 0 and 1 both have count 0, and there are no custom folders.
2. Authenticated `/database/search` results carry `user_data: {in_wantlist: bool, in_collection: bool}`.
3. `GET collection/releases/{id}` for a release that does not exist returns **200 with an empty list, not 404**. So the D-09 "Release not found" case can only come from the POST.
4. Discogs now returns FastAPI-style **422** validation bodies. For example, release 0 returns 422 `{"detail":[...],"message":"See \"detail\" for validation errors."}`.

**Primary recommendation:** One `add_to_collection` handler runs the same algorithm on every attempt: GET instances, adopt or block, intent transaction, fence, POST, record. One `enqueueImport()` helper frees stale dedupe keys and re-enqueues. Retry reuses the same `imports` row, so the intent and snapshot carry over.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All decisions below were auto-selected (`--auto`) using the recommended option. Review them before planning if any look wrong.

#### Carried forward (not re-asked)
- No automatic match preselect. The owner always picks (Project decision, Phase 3).
- All Discogs HTTP goes through the in-house client and the durable `jobs` table on the `discogs` lane (concurrency 1, ~1.1 s pacing, 429 reschedules via `run_after` without counting as an attempt). Phase 3 D-05/D-06.
- The client is read-only by construction (`isAllowed` in `src/server/discogs/client.ts`). Phase 4 widens it by exactly the writes listed in D-06, nothing more.
- Candidates render in the spine card footer slot (Phase 2 D-11, Phase 3 D-12); the status slot shows the spine's state.
- Mutating routes are JSON-only behind the proxy Origin guard (`src/proxy.ts`). Paid or rate-limited work is always enqueued, never run inline in a route.
- Orphaned spines with a match or import are never dropped (Phase 2 D-16).

#### Confirming a candidate (IMP-01)
- **D-01:** Each candidate row gets an "Add to collection" button (label includes the folder, e.g. "Add to Uncategorized"). It is the only path to a collection write. Clicking it records the choice on the spine (`confirmed_release_id`, plus which candidate) and enqueues one `add_to_collection` job. The card status shows "Importing…" then "Imported". The other candidates collapse behind "Change match" until the import finishes.
- **D-02:** One confirmed release per spine. Before the import job starts, the owner can cancel or pick a different candidate. After an import succeeds, the match is locked in this phase (undo is deferred).

#### Collection folder (IMP-02)
- **D-03:** A "Collection folder" select on the Settings Discogs card, loaded from `GET /users/{username}/collection/folders`, excluding folder 0 ("All", read-only). It defaults to folder 1 "Uncategorized" and is stored in the `settings` table. There is no per-spine folder override. Each import records the folder id it used.

#### Duplicate warnings (IMP-03)
- **D-04:** Local check first, instantly and with no Discogs call: if the same `release_id` is already imported or importing from another spine, clicking Add opens an AlertDialog ("Already imported from {photo}, spine #{n}") with "Add another copy" and "Cancel". This also catches overlapping shelf photos.
- **D-05:** Remote check runs inside the `add_to_collection` job, before any POST: `GET /users/{username}/collection/releases/{release_id}`. If the release already has instances that this app didn't create, the job does not POST. The spine goes to an "Already in your collection" state with two actions: "Link existing copy" (records the existing `instance_id`, marks the spine imported, no write) and "Add another copy" (re-enqueues with `allow_duplicate`). This uses one extra read per import, which is acceptable at the pacing above.

#### Exactly-once import (IMP-04)
- **D-06:** The client allowlist adds exactly: `GET /users/{u}/collection/folders`, `GET /users/{u}/collection/releases/{id}`, and `POST /users/{u}/collection/folders/{folder_id}/releases/{release_id}` with a non-zero folder. No DELETE, no PUT.
- **D-07:** An `imports` row (spine, release_id, folder_id, status `pending|importing|imported|already_in_collection|failed`, `instance_id`, `intent_at`, error) is written before the POST, in the same transaction that claims the job. The POST is never retried blindly. On any start or retry where the row is `importing` without an `instance_id` (crash, timeout, 5xx), the job first re-reads `collection/releases/{release_id}` and adopts an instance whose `date_added` is at or after `intent_at` (minus a small clock-skew margin). It POSTs only if none is found.
- **D-08:** A unique constraint guarantees at most one non-failed import per spine. The job dedupe key is `import:{spine_id}:{release_id}`. Success stores `instance_id` and `folder_id` from the POST response.
- **D-09:** Failure classes: 429 reschedules (Phase 3 D-06). Network, timeout and 5xx go through the reconcile in D-07 on the next attempt (up to 3), then `failed`. 401/403 → `failed` with "Reconnect Discogs". 404 on the release → `failed` with "Release not found on Discogs".

#### Status model and filter (REV-03)
- **D-10:** One derived review status per spine, computed server-side in a pure function (unit-tested), precedence top-down:
  1. `imported` — import has an `instance_id` (including "Link existing copy")
  2. `not_on_discogs` — owner marked it
  3. `failed` — latest import failed, or latest search failed / auth_failed
  4. `matched` — a release is confirmed and the import is queued, importing, or waiting on the "Already in your collection" choice
  5. `not_found` — latest search finished with no results and no manual candidate
  6. `pending` — everything else (not searched, searching, or candidates waiting for a pick)
- **D-11:** The /spines filter bar replaces the All / Needs review toggle with a status ToggleGroup: All · Pending · Matched · Imported · Not found · Not on Discogs · Failed, each with a count. It is stored in the URL as `?status=` (nuqs), and combines with `?photo=`. "Needs review" (low confidence) stays as a separate toggle, since it is about field confidence, not import state. Counts come from `GET /api/spines` and cover active and orphaned spines only (superseded and dismissed are excluded).
- **D-12:** The default view is All. Photo section headers show a small per-photo progress line ("12 / 40 imported").

#### Retry and Not on Discogs (REV-04, REV-05)
- **D-13:** A failed item shows its reason and one Retry button. For a failed search it re-enqueues the search with the current fields. For a failed import it re-enqueues `add_to_collection`, which reconciles before any POST (D-07). Neither re-uploads or re-scans the photo. When the Failed count is above 0, the filter bar shows "Retry all failed".
- **D-14:** "Mark not on Discogs" is in the card's action menu and is shown prominently on `not_found` spines. It sets a flag on the spine, hides the candidate list, and is reversible with "Unmark". It is not allowed on an imported spine.

### Claude's Discretion
- Exact table and column names (`imports` vs columns on `spines`) and the migration layout.
- The clock-skew margin and the exact reconcile matching rule, within D-07.
- Where the folder list is cached and when it refreshes.
- Visual details of the status ToggleGroup on narrow screens (scroll vs wrap), within the existing UI-SPEC tokens.
- Whether "Retry all failed" is one bulk route or a loop over per-spine routes.

### Deferred Ideas (OUT OF SCOPE)
- Undo import (DELETE the stored `instance_id`): FEATURES differentiator, needs a DELETE in the client.
- Bulk accept and keyboard-driven review.
- Per-spine folder override, and writing notes or shelf location to the Discogs instance.
- "Accept with unverified version" flag.
- Smarter candidate ranking (carried from Phase 3).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMP-01 | Explicit confirm before any collection add | Confirm route takes a `candidateId` (server resolves `release_id` from `discogs_candidates`), and the write gate allows POST only from the handler path. See Pattern 3 and the Security section |
| IMP-02 | Add to the chosen folder (default Uncategorized) | Folder response shape verified live: `{folders:[{id,name,count,resource_url}]}`. The owner currently has only folders 0 and 1. Setting stored via `setSetting`. See Pattern 6 |
| IMP-03 | Warn when already in the collection or already imported locally | Local check in the confirm route (D-04). Remote check from `GET collection/releases/{id}` instances minus locally recorded instance ids (D-05). Search `user_data.in_collection` is an optional hint. See Patterns 2 and 4 |
| IMP-04 | No duplicates from retries or crashes, instance id recorded | Intent row plus snapshot plus reconcile-first algorithm (Pattern 2), partial unique indexes (verified on better-sqlite3 13.0.3 / SQLite 3.53.4), dedupe-key handling (Pitfall 3), and normalizing the import row after recovery fails the job (Pitfall 4) |
| REV-03 | Status filter with counts | Pure `reviewStatusOf()` in `src/lib/` (Pattern 5), counts in `getSpines`, and a `?status=` nuqs hook alongside `useReviewFilter`/`usePhotoFilter` |
| REV-04 | Retry a failed item without re-uploading | Failed search → existing `enqueueExplicitSearch({kind:'again'})`. Failed import → `enqueueImport()` reusing the row (Pattern 2) |
| REV-05 | Mark "not on Discogs" | `spines.not_on_discogs` flag (boolean integer column), route refuses an imported spine, and the merge and re-attach rules keep the flag's spine (Pitfall 5) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Port **3001** only (`pnpm dev`/`serve` use `-p 3001`). Never use 3000.
- Next.js 16 App Router, TypeScript pinned at 6.0.3, SQLite via better-sqlite3 13 with Drizzle 0.45 / drizzle-kit 0.31. Stay on 0.45 and do not mix in the 1.0 rc.
- Discogs: 60 req/min authenticated, which must be queued. A descriptive User-Agent is required. Folder 0 is read-only, and folder 1 is Uncategorized.
- Portability: all state lives in `data/`. Migrations are committed under `drizzle/` and applied by `migrate()` at boot.
- Secrets live in `secrets.json`, which is gitignored and never logged or committed. The username lives there too (`discogsUsername`), and existing scripts deliberately never print it.
- Tests use recorded fixtures or `test/fixtures/fake-discogs.mjs` and **never hit live APIs**.
- Biome for lint and format. Vitest 5 for unit tests. Thin in-house Discogs client, with no `disconnect`, `oauth-1.0a` or similar packages.
- GSD workflow: edits go through GSD commands.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Confirm candidate / local dup check | API (route handler) | Database | Must be server-authoritative and transactional (IMMEDIATE). The browser only sends a `candidateId` |
| Remote dup check, POST, reconcile | Background job (`discogs` lane) | Database | Rate-limited, non-idempotent external write. It needs durable intent and crash recovery |
| Write allowlist | API client (`client.ts`) | — | One choke point for every Discogs request |
| Review status derivation + counts | API (pure fn in `src/lib`, called by `getSpines`) | Browser (renders) | One truth for the filter, the counts and the badges |
| Status filter state | Browser (nuqs URL state) | API (`?status=` param) | Survives reload and combines with `?photo=` |
| Folder list | API (route reads through the gate, cached in `settings`) | Browser (Select) | A single user-initiated read, like Test connection |
| Recovery of interrupted imports | Worker maintenance hook | Database | Same mechanism as `reconcileVisionRuns` |

## Standard Stack

No new runtime dependencies. Everything Phase 4 needs is already installed [VERIFIED: package.json in repo].

| Library | Version (installed) | Purpose in Phase 4 |
|---------|---------------------|--------------------|
| better-sqlite3 | 13.0.3 | `imports` table, partial unique indexes, IMMEDIATE transactions |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | Schema + `pnpm db:generate` → `drizzle/0003_*.sql` |
| zod | 4.6.7 | Strict route bodies; parsing the Discogs response schemas (`CollectionReleasesSchema`, `AddResponseSchema`, `FoldersSchema`) |
| nuqs | 2.10.1 | `?status=` filter |
| @tanstack/react-query | 5.104.2 | Polling while imports are active; mutations |
| radix-ui | 1.8.1 | AlertDialog (present). A DropdownMenu for the card action menu (D-14) comes from `shadcn add dropdown-menu`, which copies source that uses the already-installed `radix-ui`, so no new npm package |
| vitest | 5.0.5 | Unit tests |

**Installation:** none. Optional UI primitive: `npx shadcn@latest add dropdown-menu`. Check the diff: it should only add `src/components/ui/dropdown-menu.tsx`.

## Package Legitimacy Audit

No external packages are installed in this phase, so the gate does not apply. `dropdown-menu` is shadcn registry source built on the existing `radix-ui@1.8.1` dependency.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Discogs API Facts (the contract the handler codes against)

| Endpoint | Fact | Source |
|----------|------|--------|
| `GET /users/{u}/collection/folders` | 200 `{"folders":[{"id":0,"count":N,"name":"All","resource_url":...},{"id":1,...,"name":"Uncategorized"}]}`. Owner-only folders need owner auth. The owner's account today has only folders 0 and 1, both with count 0 | [VERIFIED: live probe 2026-10-22, keys `["id","name","count","resource_url"]`] |
| `GET /users/{u}/collection/releases/{release_id}` | 200 `{"pagination":{"page":1,"pages":1,"per_page":50,"items":0,"urls":{}},"releases":[]}` when not owned. **Also 200 empty for a release that does not exist** (999999999). Release 0 gives 422 | [VERIFIED: live probe] |
| same, owned | Each entry: `"instance_id": 148842233, "rating": 4, "basic_information": {...}, "folder_id": 688739, "date_added": "2015-11-30T10:54:13-08:00", "id": 7781525`. Paginated at 50 | [CITED: discogs.com/developers (Wayback 2025-12-26)]. Not live-verified because the collection is empty |
| `POST /users/{u}/collection/folders/{folder_id}/releases/{release_id}` | "The folder_id must be non-zero – you can use 1 for 'Uncategorized'." Response **201** `{"instance_id": 3, "resource_url": "https://api.discogs.com/users/example/collection/folders/1/release/1/instance/3"}` | [CITED: discogs.com/developers (Wayback)] |
| POST on a nonexistent release | Probably 404 (D-09). Could be 422 under the newer validation layer | [ASSUMED] |
| `GET /database/search` (OAuth) | Each result has `"user_data":{"in_wantlist":false,"in_collection":false}` | [VERIFIED: live probe] |
| Validation errors | FastAPI-style 422: `{"detail":[{"type":"greater_than_equal","loc":["path","release_id"],...}],"message":"See \"detail\" for validation errors."}`. `client.ts` already maps any other 4xx to `DiscogsRequestError` | [VERIFIED: live probe] |
| Rate limit | Authenticated `x-discogs-ratelimit-remaining` started at 60 | [VERIFIED: live probe] |
| Multiple copies | "each instance of a release in a folder has an instance ID" (multiple instances allowed) | [CITED: discogs.com/developers] |

Implications:
- `date_added` is ISO-8601 with an offset and **second resolution**. `Date.parse()` handles it. Compare in epoch ms against `intent_at` (also epoch ms, the repo convention).
- Because a nonexistent release reads as "not owned", the precheck can't detect a bad release id. D-09's 404 branch must be driven by the POST's 404 (or 422).
- `user_data.in_collection` is stale as soon as the app imports anything, and the candidate rows don't store it today (`parseSearchResponse` drops it). Do not rely on it for IMP-03. The in-job GET is authoritative. Optionally capture it into `discogs_candidates` as a display hint ("In your collection"). Not required.

## Architecture Patterns

### System Architecture Diagram

```
 Browser (/spines card)                        Route handlers (JSON-only, proxy Origin guard)
 ──────────────────────                        ─────────────────────────────────────────────
 [Add to Uncategorized] ──POST {candidateId, allowDuplicate?}──► /api/spines/{id}/import
                                                   │  IMMEDIATE tx:
                                                   │   spine active|orphaned? not imported? not_on_discogs=0?
                                                   │   resolve release_id from discogs_candidates(candidateId, spine)
                                                   │   local dup (other spine, same release, open import)? ──► 409 {duplicate:{photo,spine#}}
                                                   │   insert imports(status=pending, folder_id=setting)      (AlertDialog → resend allowDuplicate)
                                                   │   enqueueImport(): free terminal dedupe key, enqueue add_to_collection
                                                   ▼
                                          jobs (lane=discogs) ── worker claimNext ──► add_to_collection handler
                                                                                       │
          ┌──────────────── every attempt ─────────────────────────────────────────────┘
          ▼
   load import row ── imported/already_in_collection/cancelled? ──► return (idempotent)
          │
   auth / gate-paused checks (same as search_spine) ──► finish failed "Reconnect Discogs" | JobDeferredError
          │
   GET /users/{u}/collection/releases/{rid}  ──► instances[]
          │
   intent_at set? ──yes──► adoptable = instances − snapshot − locally-recorded, date_added ≥ intent_at − 120 s
          │                     └─ found ──► tx: imported, instance_id, folder_id, adopted=1 ──► done
          ▼
   foreign = instances − locally-recorded (and not adoptable)
   foreign ≠ ∅ and !allow_duplicate ──► tx: already_in_collection, existing_json ──► done (owner chooses)
          │
   tx IMMEDIATE: claim still current? → status=importing, intent_at=now, snapshot_json=instances, error=NULL
          │
   ctx.isCurrent()? ──no──► throw NotCurrent
          ▼
   POST /users/{u}/collection/folders/{fid}/releases/{rid}
          ├─ 201 ──► tx: imported, instance_id, folder_id ──► done
          ├─ 429 ──► JobDeferredError (row stays importing → next run reconciles first)
          ├─ 401/403 ──► failed "Reconnect Discogs"
          ├─ 404/422 ──► failed "Release not found on Discogs" / rejected
          └─ timeout/5xx/network/abort ──► record error, rethrow → worker backoff → next attempt reconciles
                                            (final attempt → failed; Retry reuses row → reconciles first)

 Worker maintenance hook (every lease tick): imports in pending|importing whose job is failed/cancelled
   ──► status=failed, error="interrupted" (so the card shows Retry)
```

### Recommended Project Structure (new and changed files)

```
src/server/db/schema.ts                    # + imports table, + spines.not_on_discogs
drizzle/0003_import_review.sql             # generated by `pnpm db:generate` (additive only)
src/lib/import-types.ts                    # IMPORT_STATUSES, REVIEW_STATUSES, DTOs (client-safe)
src/lib/review-status.ts (+ .test.ts)      # pure D-10 derivation
src/server/discogs/client.ts               # isAllowed() widened by one POST pattern
src/server/discogs/collection.ts (+test)   # zod schemas, pickAdoptable(), splitInstances() (pure)
src/server/imports/store.ts (+test)        # createImport, enqueueImport, cancelImport, linkExisting, markInterrupted
src/server/jobs/handlers/add-to-collection.ts (+test)
src/server/jobs/handlers/index.ts          # register handler + maintenance hook
src/server/jobs/queue.ts                   # + cancelQueuedJob(id)
src/server/scan/merge.ts, orphans.ts       # keep spines with imports/flags (Pitfall 5)
src/server/scan/queries.ts                 # review status, import DTO, per-status counts, ?status=
src/app/api/spines/[id]/import/route.ts            # POST confirm, DELETE cancel
src/app/api/spines/[id]/import/link-existing/route.ts
src/app/api/spines/[id]/not-on-discogs/route.ts    # POST {flag: boolean}
src/app/api/spines/[id]/retry/route.ts
src/app/api/spines/retry-failed/route.ts
src/app/api/discogs/folders/route.ts               # GET cached, POST {refresh:true}
src/components/review-status-filter.tsx, import-state-badge.tsx, ...
test/fixtures/fake-discogs.mjs             # + collection endpoints and control modes
scripts/verify-discogs-import.ts           # end-to-end incl. kill-mid-POST
```

### Pattern 1: Schema (Claude's discretion: recommended layout)

Put imports in a separate `imports` table, not in columns on `spines`. History is kept: a failed row stays and a new confirm adds a row.

```typescript
// src/server/db/schema.ts — follows existing conventions (text ULID ids, epoch-ms integers)
export const imports = sqliteTable('imports', {
  id: text('id').primaryKey(),
  spineId: text('spine_id').notNull().references(() => spines.id),
  candidateId: text('candidate_id'),             // which candidate was confirmed (D-01); no FK: candidates are replaced by re-search
  releaseId: integer('release_id').notNull(),    // the confirmed_release_id
  folderId: integer('folder_id').notNull(),      // folder used (D-03); ≥ 1
  status: text('status', { enum: IMPORT_STATUSES }).notNull().default('pending'),
  allowDuplicate: integer('allow_duplicate', { mode: 'boolean' }).notNull().default(false),
  instanceId: integer('instance_id'),
  adopted: integer('adopted', { mode: 'boolean' }).notNull().default(false),   // reconciled after an ambiguous POST
  linked: integer('linked', { mode: 'boolean' }).notNull().default(false),     // "Link existing copy"
  intentAt: integer('intent_at'),                // set just before a POST
  snapshotJson: text('snapshot_json'),           // instance ids seen right before the POST
  existingJson: text('existing_json'),           // foreign instances for already_in_collection [{instanceId, folderId, dateAdded}]
  postCount: integer('post_count').notNull().default(0),
  errorKind: text('error_kind'),
  error: text('error'),
  jobId: text('job_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  importedAt: integer('imported_at'),
}, (t) => [
  uniqueIndex('imports_spine_open_idx').on(t.spineId).where(sql`${t.status} <> 'failed'`),   // D-08
  uniqueIndex('imports_instance_idx').on(t.instanceId).where(sql`${t.instanceId} IS NOT NULL`), // one copy ↔ one spine
  index('imports_release_idx').on(t.releaseId),
]);
// spines: + notOnDiscogs: integer('not_on_discogs', { mode: 'boolean' }).notNull().default(false)
```

I checked locally that drizzle-kit 0.31.11 emits `CREATE UNIQUE INDEX ... WHERE "imports"."status" <> 'failed'`. On better-sqlite3 13.0.3 / SQLite 3.53.4, a second open import for the same spine and a duplicate instance id both raise `SQLITE_CONSTRAINT_UNIQUE`, while a failed row plus an open row is allowed [VERIFIED: scratch run this session]. Double-quoted *identifiers* are fine under the repo's DQS=0 build. Only double-quoted string literals are refused (`queue.ts:8`).

`IMPORT_STATUSES` = D-07's five values: `pending | importing | imported | already_in_collection | failed`. Cancel (D-02) **deletes** the `pending` row when `intent_at IS NULL`. Nothing reached Discogs, so there is nothing to audit, and this keeps D-07's enum unchanged.

Migration: edit `schema.ts`, run `pnpm db:generate` (or `mise exec -- pnpm db:generate`), and commit `drizzle/0003_*.sql` plus the `meta/` snapshot and journal. `runMigrations()` applies it at boot (`src/server/db/client.ts:31-38`). The migration is additive (CREATE TABLE plus ADD COLUMN with a default), so it is safe on the live `data/app.db` (241 search rows). Take a copy into `data/backups/` before the first run.

### Pattern 2: `add_to_collection` handler, the exactly-once algorithm

The handler skeleton mirrors `fetch-release.ts`: zod payload, `errName()` matching by name for HMR safety, the `NotCurrentError` fence, and the auth and gate checks. Payload: `{ importId }`.

```typescript
// Pure helpers in src/server/discogs/collection.ts (unit-test these exhaustively)
export const CollectionReleasesSchema = z.object({
  pagination: z.object({ pages: z.number(), items: z.number() }).passthrough(),
  releases: z.array(z.object({
    instance_id: z.number().int().positive(),
    folder_id: z.number().int().nonnegative(),
    date_added: z.string(),
    id: z.number().int(),
  }).passthrough()),
});
export const AddResponseSchema = z.object({ instance_id: z.number().int().positive() }).passthrough();

const SKEW_MS = 120_000; // date_added has 1 s resolution + server clock skew; snapshot is the primary rule

export function pickAdoptable(instances, opts: { intentAt: number; snapshot: Set<number>; recorded: Set<number> }) {
  return instances
    .filter(i => !opts.snapshot.has(i.instance_id) && !opts.recorded.has(i.instance_id))
    .filter(i => { const t = Date.parse(i.date_added); return Number.isFinite(t) && t >= opts.intentAt - SKEW_MS; })
    .sort((a, b) => a.instance_id - b.instance_id)[0] ?? null;   // oldest new instance = our first POST
}
```

Per-attempt order (see the diagram):
1. Read the row. If it is `imported` or `already_in_collection`, return. If it is missing, return (cancelled).
2. Check the spine is not superseded or dismissed. If it is, mark the import failed ("spine removed") and do not POST.
3. Check auth and the paused gate, as in `fetch-release.ts:110-122`.
4. `GET /users/${encodeURIComponent(username)}/collection/releases/${releaseId}` with `signal: ctx.signal`. Parse with the schema. `recorded` = every `instance_id` in `imports` (any spine).
5. If `intent_at != null && instance_id == null`, adopt via `pickAdoptable`. This applies to `importing` **and** to `failed` rows reopened by Retry.
6. `foreign = instances − recorded − adopted`. If it is non-empty and `!allowDuplicate`, set `already_in_collection` with `existing_json`, then return.
7. Run an `IMMEDIATE` transaction that re-checks `jobs.status='running' AND attempts=ctx.job.attempts` (the same predicate as `isClaimCurrent`). Inside it, set `status='importing', intent_at=Date.now(), snapshot_json=JSON(all instance ids), post_count=post_count+1`. This is the practical reading of D-07's "same transaction that claims the job". `claimNext()` is a generic one-statement claim in `queue.ts:93-107`, so the intent is written in the first transaction after the claim, fenced on that claim.
8. `if (!ctx.isCurrent()) throw new NotCurrentError()`, then the POST through `discogsFetch({ method:'POST', path, auth:'oauth', signal: ctx.signal })`.
9. On 201, parse `AddResponseSchema`. In one transaction set `imported, instance_id, folder_id, imported_at`. If the `instance_id` unique index fires, something is badly wrong. Mark the row failed and do not retry.

Error mapping (by `errName`), matching D-09:

| Error | When | Action |
|-------|------|--------|
| `DiscogsRateLimitedError` | GET or POST | `throw new JobDeferredError(resumeAt)`. The row keeps whatever status it has. A 429'd POST leaves `importing`, so the next run reconciles first (one GET, harmless) |
| `DiscogsAuthError` (401) | any | Mark the import failed, `errorKind:'auth'`, "Reconnect Discogs". The client already called `markAuthInvalid()` (`client.ts:245-247`) |
| `DiscogsRequestError` status 403 | any | Same as 401. **Note:** `client.ts` maps 403 to `DiscogsRequestError`, not `DiscogsAuthError` (`client.ts:250-252`) |
| `DiscogsNotFoundError` / 422 | POST | Failed, "Release not found on Discogs" (404) or "Discogs rejected the add" (422). The POST was refused, but the intent is set, so Retry reconciles (harmless) |
| `DiscogsUnavailableError`, timeout, abort, unknown | GET or POST | Record `error` on the row (keep the status) and **rethrow**. `failOrRetry` backs off 2 s / 4 s, and the next attempt reconciles first (step 5) |
| final attempt exhausted | — | The worker marks the job failed. The maintenance hook (Pitfall 4) flips the row to `failed` |

Retry (REV-04) reuses the same row: flip `failed → pending`, keep `intent_at` and `snapshot_json`, then `enqueueImport`. So a POST that landed before a crash is adopted, not duplicated. Make "Add another copy" (D-05) set `allow_duplicate=1` on the same row and re-enqueue.

### Pattern 3: Write gate widening (D-06)

```typescript
// src/server/discogs/client.ts — current: GET anything, plus POST /oauth/access_token
const ADD_TO_FOLDER = /^\/users\/[^/]+\/collection\/folders\/[1-9]\d{0,9}\/releases\/[1-9]\d{0,11}$/;
function isAllowed(method: string, path: string): boolean {
  return method === 'GET'
    || (method === 'POST' && (path === ACCESS_TOKEN_PATH || ADD_TO_FOLDER.test(path)));
}
```

- The current `isAllowed` (`client.ts:106-108`, verbatim: `return method === 'GET' || (method === 'POST' && path === ACCESS_TOKEN_PATH);`) **already allows every GET**. So the two GETs in D-06 need no code change. The only real widening is the POST pattern. Folder 0 is refused by `[1-9]`.
- The username segment is `encodeURIComponent(username)` from `getDiscogsAuth()`. `buildUrl` already refuses `?` and `#` (`client.ts:154`). Tighten further by requiring the segment to equal the encoded stored username (pass it in, or check in the handler).
- Update the header comment ("Read-only by construction") and the `refused: read-only client` message. Add client tests: POST folder 0 refused, DELETE/PUT refused, a POST to another path refused, and a POST add allowed.
- A POST with an empty form body is what the client sends today (`Content-Type: application/x-www-form-urlencoded`, body `''`). Discogs accepts a body-less add per community clients [ASSUMED]. The first real import is the check.

### Pattern 4: Confirm route and local duplicate check (D-01, D-04)

`POST /api/spines/{id}/import` takes `z.strictObject({ candidateId: z.string().min(1).max(40), allowDuplicate: z.boolean().optional() })`. Do it all in one `db.transaction(...).immediate()`, following `enqueueExplicitSearch` in `enqueue.ts`:
- The spine is `active|orphaned` (404 or 409 otherwise), it is not `not_on_discogs` (409), and it has no open import (409 `already_confirmed`). The partial index is the backstop.
- `release_id` comes from `discogs_candidates WHERE id=@candidateId AND spine_id=@spineId`. **Never accept a release id from the browser.** That enforces IMP-01 and Pitfall 5 (master vs release), because candidates are release ids by construction.
- Local dup: `SELECT i.spine_id, p.original_name, d.idx FROM imports i ... WHERE i.release_id=@rid AND i.spine_id<>@spineId AND i.status IN ('pending','importing','imported','already_in_collection')`. If found and `!allowDuplicate`, return 409 `{ error:'duplicate', photo, spineNumber }`. The client shows the AlertDialog and resends with `allowDuplicate:true`.
- The folder is `getCollectionFolder()` (setting, default 1).
- Insert the row, call `enqueueImport`, set `job_id`.

A local "Add another copy" stays distinct from the remote "allow duplicate". The remote check filters out locally-recorded instances anyway, so a locally-confirmed second copy POSTs. Store the route's `allowDuplicate` on the row as well: if the owner already said "add another" for a local dup, an app-created instance is not foreign, so the remote check passes naturally.

Cancel / change match (D-02): `DELETE /api/spines/{id}/import` in an IMMEDIATE transaction. Allowed only when the open import is `pending` with `intent_at IS NULL` and its job is `queued`. Then `cancelQueuedJob(jobId)` (new: `UPDATE jobs SET status='cancelled', finished_at=@now, dedupe_key=NULL WHERE id=@id AND status='queued'`) and delete the row. If the job is running, or the row has an intent, return 409 "Import already started". Never cancel once a POST may have happened.

Link existing copy (D-05): an IMMEDIATE transaction, row `already_in_collection`. Pick the first entry from `existing_json` whose `instance_id` is not recorded. Set `imported, instance_id, folder_id (from the instance), linked=1`. No Discogs call. The `imports_instance_idx` index prevents two spines claiming one copy.

### Pattern 5: Pure review status (D-10)

```typescript
// src/lib/review-status.ts — client-safe, no server-only import
export const REVIEW_STATUSES = ['pending','matched','imported','not_found','not_on_discogs','failed'] as const;
export function reviewStatusOf(x: {
  importStatus: ImportStatus | null; importInstanceId: number | null; importJobStatus: JobStatus | null;
  notOnDiscogs: boolean; searchState: SearchState; candidateCount: number;
}): ReviewStatus {
  if (x.importInstanceId !== null) return 'imported';
  if (x.notOnDiscogs) return 'not_on_discogs';
  if (x.importStatus === 'failed' || x.searchState === 'failed') return 'failed';
  if (x.importStatus && x.importStatus !== 'failed') return 'matched';   // pending|importing|already_in_collection
  if (x.searchState === 'no_match' && x.candidateCount === 0) return 'not_found';
  return 'pending';
}
```

- `SearchState` already folds `auth_failed` and a failed or succeeded-without-result job into `'failed'`, and `no_match` / `not_found` into `'no_match'` (`src/server/discogs/queries.ts` `searchStateOf`). Reuse it and don't re-derive. `searchStateOf` already promotes stored candidates over `no_match`. Keep the `candidateCount === 0` guard anyway for manual candidates.
- "Latest import" means the newest `imports` row by `created_at, id` for the spine. A failed row followed by a new open row reads as matched.
- If an import row is `pending|importing` while its job is `failed|cancelled`, treat it as failed in the read model too. This is defensive in case the maintenance hook hasn't run yet.
- `getSpines` computes the status per listed spine (active plus orphaned, `queries.ts:276`). Counts cover the photo filter, ignoring the status and review filters, the same semantics as today's `counts`. Then filter by `?status=`. Extend `discogsActive` (polling) to cover import jobs that are queued or running. Add a per-photo `importedCount / spineCount` for D-12.
- Parse `?status=` against `REVIEW_STATUSES` and treat anything else as All (as `parseReviewParam` does).

### Pattern 6: Folder setting (D-03)

- `GET /api/discogs/folders` returns the cached list from `settings` key `discogs_folders` (`{folders:[{id,name,count}], fetchedAt}`) plus the selected id. `POST /api/discogs/folders` with `{refresh:true}` runs one `discogsFetch` GET through the shared gate, inline. The precedent is `/api/discogs/test` (`src/app/api/discogs/test/route.ts`), a user-initiated one-shot read. It filters out `id === 0` and caches. Refresh when the Settings card opens if the cache is older than about 1 h or missing, plus a manual refresh. See Open Question 1 on the carry-forward "never inline" wording.
- `collection_folder_id` is a setting with schema `z.number().int().min(1)`, default 1. On save, check the id is in the cached list. The label "Add to {folderName}" reads the cached name and falls back to "Uncategorized" for id 1.
- Today the owner's account has only Uncategorized, so the Select shows one option. That is fine. Don't hide it.

### Anti-Patterns to Avoid
- **Retrying the POST through `failOrRetry` without reconcile.** The worker's generic retry is fine only because every attempt starts with the GET plus the adopt step.
- **Treating `date_added >= intent_at` as the only adopt rule.** Second resolution and clock skew make it fuzzy, and it could adopt a copy the owner added by hand on discogs.com. Use the snapshot plus the local-recorded exclusion as the primary rule.
- **Creating a new `imports` row on Retry.** That loses `intent_at` and `snapshot_json`, so a landed POST gets duplicated.
- **Accepting `releaseId` from the client** in the confirm route.
- **Running the POST in a route** (inline). Only the handler POSTs.
- **Logging the request path with the username.** Existing scripts deliberately never print the username. Error labels include `req.path` (`client.ts:179`), which will now contain the username. Strip it with a `/users/:u/...` label for these paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting / 429 | New throttle for the POST | Existing `discogsGate()` + `JobDeferredError` | One process-wide budget (Pitfall 7) |
| Retry and backoff | Custom retry loop in the handler | Worker `failOrRetry` (2 s/4 s, max 3) + reconcile-first | Crash-safe and already tested |
| Crash recovery | Startup scan of imports | Lease-tick `maintenance` hook (like `reconcileVisionRuns`) | Runs only on the lease holder, every tick |
| "One open import per spine" | App-level SELECT check only | Partial unique index (plus the check, for a friendly 409) | A race-proof backstop |
| Dedupe re-enqueue | New queue API | `releaseDedupeKey()` + `enqueue()` inside one IMMEDIATE transaction | The pattern already exists for search replays |
| OAuth / HTTP | `@lionralfs/discogs-client` | `discogsFetch` | Its own backoff would fight the gate |
| URL filter state | useState + manual URL sync | nuqs `useQueryState('status')` | Matches `useReviewFilter` |

## Runtime State Inventory

Not a rename or refactor phase. The live state that matters is the **live database** (`data/app.db`, roughly 230 spines and 241 searches). The 0003 migration is additive, so take a backup copy first. The **owner's Discogs collection** is currently empty (folders 0 and 1, count 0) [VERIFIED: live probe]. So the first real import is the first instance ever created. That makes the hand verification (CONTEXT specifics) easy to read on discogs.com.

## Common Pitfalls

### Pitfall 1: Ambiguous POST, duplicated by the worker's retry
**What goes wrong:** A timeout or 5xx after Discogs already created the instance, then `failOrRetry` runs the handler again, which POSTs again.
**How to avoid:** Every attempt starts with GET plus adopt whenever `intent_at` is set (Pattern 2, step 5). Unit-test with a stub fetch: POST times out → second run sees the new instance → adopts, `post_count === 1`.
**Warning signs:** `post_count > 1` with `adopted = 0` on any row. A collection count above the imported count.

### Pitfall 2: The precheck can't see a bad release id
**What goes wrong:** You expect `GET collection/releases/{bad}` to 404. It returns 200 empty [VERIFIED: live probe].
**How to avoid:** Map 404/422 on the **POST** to "Release not found on Discogs".

### Pitfall 3: The dedupe key blocks Retry and "Add another copy"
**What goes wrong:** `enqueue` does `ON CONFLICT(dedupe_key) DO NOTHING` and returns the old job id (`queue.ts:67-89`). The `dedupe_key` is unique across all statuses, so a failed or succeeded job with `import:{spine}:{release}` makes Retry a silent no-op.
**How to avoid:** `enqueueImport(db, importId)` in one IMMEDIATE transaction. If a job with the key is `queued|running`, return it (already in flight). Otherwise `releaseDedupeKey()` it, then `enqueue({ lane:'discogs', type:'add_to_collection', payload:{importId}, dedupeKey:`import:${spineId}:${releaseId}` })`, then set `imports.job_id`. The handler should also release its key when it ends `already_in_collection`, as `search-spine.ts` does for `not_connected`.

### Pitfall 4: Recovery fails the job, but the import row stays `importing`
**What goes wrong:** If the process is killed on attempt 3, `recoverRunningJobs` marks the job `failed` ("interrupted after final attempt", `queue.ts:286-292`). Nothing touches `imports`, so the card shows "Importing…" forever.
**How to avoid:** Add a `maintenance` hook in `handlers/index.ts`: `UPDATE imports SET status='failed', error_kind='interrupted', error='The import was interrupted. Retry checks Discogs first.' WHERE status IN ('pending','importing') AND job_id IN (SELECT id FROM jobs WHERE status IN ('failed','cancelled'))`. It is cheap and has no network calls. Also handle a missing job row defensively in the read model.

### Pitfall 5: A re-scan or re-attach silently retires an imported spine
**What goes wrong:** `mergeRunIntoSpines` retires an unmatched old spine as `superseded` when it has **no field edits** (`merge.ts:188-196`). `orphans.ts` re-attach supersedes a target that has no edits (`CANDIDATE` SQL, `orphans.ts:23-29`). A spine with an import, an open import or the `not_on_discogs` flag would vanish from the list. Its visible replacement looks un-imported, the owner confirms again, and the remote check treats the first copy as app-created (recorded), so **it POSTs a duplicate**.
**How to avoid:** Extend the `hasEdits` retire rule to "edited OR has any non-failed import OR not_on_discogs" → `orphaned`. Exclude spines with imports or the flag from re-attach targets. Block Dismiss for a spine with a non-failed import. Add merge tests for each case. This fulfils the carried-forward "Orphaned spines with a match or import are never dropped".

### Pitfall 6: The username leaks into error text
**What goes wrong:** `label = \`Discogs ${method} ${req.path}\`` (`client.ts:179`) ends up in `jobs.last_error`, `imports.error` and API responses, and those paths now contain the username.
**How to avoid:** Redact `/users/<u>/` to `/users/:u/` in the label. Add a test with a canary username.

### Pitfall 7: Lease loss or abort mid-POST
**What goes wrong:** A `WorkerStoppedError` abort leaves the job `running`. Recovery requeues it. That is fine **only** because the intent is already set.
**How to avoid:** Write the intent before the `isCurrent()` check and the POST, never after. A verify step kills the server while the fake server holds the POST response (see Validation).

### Pitfall 8: Two tabs or a double-click on "Add"
**How to avoid:** The IMMEDIATE transaction plus the partial unique index. The second request gets 409 `already_confirmed`. Disable the button while the mutation is pending.

## Code Examples

Fake Discogs additions (`test/fixtures/fake-discogs.mjs`), following its existing control style (`POST /__control`):

```js
// In-memory collection: Map<releaseId, [{instance_id, folder_id, date_added}]>, nextInstance counter.
// GET  /users/{u}/collection/folders            -> { folders:[{id:0,name:'All',count,resource_url},{id:1,name:'Uncategorized',...}, ...custom] }
// GET  /users/{u}/collection/releases/{id}      -> { pagination:{page:1,pages:1,per_page:50,items:n,urls:{}}, releases:[...] } (200 empty if none; 422 for id 0)
// POST /users/{u}/collection/folders/{f}/releases/{id}
//      f==0 -> 422 ; id > 899999999 -> 404 ; else push instance, 201 { instance_id, resource_url }
//      date_added: new Date().toISOString().replace(/\.\d{3}Z$/, '-00:00')-style seconds-resolution with offset
// /__control: { collection?: {[releaseId]: instances[]}, postMode?: 'ok'|'hang-after-commit'|'502-after-commit'|'timeout-before-commit', }
//      'hang-after-commit': record the instance, then never answer (client times out at 20 s) -> exercises reconcile + kill test
// Log every POST so the verify script can assert exactly one POST per import.
```

Handler unit tests use `fetchImpl` stubs plus the fake-clock gate, exactly like `fetch-release.test.ts` (`useTempDataDir()`, `saveDiscogsAuth` with canary values, `claimNext` to get a real `JobContext`).

## State of the Art

| Old approach | Current approach | Impact |
|--------------|------------------|--------|
| Client "read-only by construction" (GET plus one OAuth POST) | Plus one regex-gated collection POST | Update comments and tests. The `refused` message changes |
| Discogs 4xx bodies `{"message": "..."}` | Validation errors are FastAPI-style `{"detail":[...],"message":...}` with 422 | Never surface Discogs bodies. Keep the status-only messages |
| Search results normalized without `user_data` | `user_data.in_collection` is available | Optional hint only |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | A POST for a nonexistent release returns 404 (it might be 422) | API Facts, Pattern 2 | Low: both map to a terminal failure with a clear reason. Map both |
| A2 | A POST with an empty form body is accepted (201) | Pattern 3 | Medium: the first real import fails with 4xx. Fallback: send `Content-Type: application/json` with no body, or omit the body. Hand verification catches it |
| A3 | A 429 on the POST means the instance was not created | Pattern 2 | Low: reconcile-first makes it harmless either way |
| A4 | Owned-instance shape (`instance_id`, `folder_id`, `date_added` with offset, second resolution) still matches the archived docs | API Facts | Medium: parse defensively (zod `.passthrough()`, `Date.parse` NaN guard → treat as not adoptable by date, but still adoptable by snapshot). Verify on the first real import |
| A5 | 201 body `{instance_id, resource_url}` (docs) | API Facts | Medium: if `instance_id` is missing, fall back to reconcile (GET + adopt) instead of failing |
| A6 | Collection pagination (50 per page) never matters (one release, ≤50 copies) | Pattern 2 | Negligible. If `pages > 1`, fetch the extra pages or treat it as foreign |

## Open Questions (RESOLVED)

1. **Folder list: inline through the gate, or a job?** — RESOLVED: inline.
   - What we know: the carry-forward says "Paid or rate-limited work is always enqueued, never run inline in a route". Yet `/api/discogs/test` already does one inline gated GET.
   - Recommendation: inline, following the Test-connection precedent. It is a single owner-initiated read, cached, with a pass-through on 429. If the plan checker objects, use a `fetch_folders` job and poll.
   - Resolution: Plan 04-06 reads the folder list with one inline gated GET in `POST /api/discogs/folders` (`{ refresh: true }`), only when Settings opens with no cached list or one older than 1 hour, or on "Reload folders"; the result is cached under `discogs_folders` in the settings table, and a paused gate answers `{ ok: false, kind: 'busy' }` instead of waiting (planner assumption A-04-13).
2. **Should `already_in_collection` count as "matched" or "failed" in the filter?** — RESOLVED: matched.
   - D-10 says matched (it waits on the owner's choice). Keep that, but give it a distinct badge ("Already in your collection") so it is findable.
   - Resolution: Plan 04-05's `reviewStatusOf` maps an `already_in_collection` import to `matched` (D-10 order); Plan 04-10's `ImportStateBadge` shows the distinct "Already in your collection" badge (TriangleAlert, text-warning), and Plan 04-13's panel offers Link existing copy and Add another copy (Plan 04-04's routes).
3. **Should "Retry all failed" also re-enqueue failed searches with `auth_failed` while still disconnected?** — RESOLVED: no; skip everything while disconnected.
   - Recommendation: one bulk route that loops over failed spines with the same per-spine functions. Skip searches (and imports) while `!discogsReady()` and return `{retried, skipped}`.
   - Resolution: Plan 04-09's `POST /api/spines/retry-failed` loops over the failed spines in list order with Plan 04-12's per-spine `retrySpine` (import first, else search); while `!discogsReady()` it enqueues nothing and answers `{ retried: 0, skipped: n }`, and the filter bar shows "Nothing to retry until Discogs is connected." (planner assumption A-04-21).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime | ✓ | v24.22.0 | — |
| pnpm | scripts | ✗ on non-interactive PATH (mise shim) | 12.14.0 pinned | `mise exec -- pnpm …` or `npx vitest run`, `npx drizzle-kit generate` |
| better-sqlite3 native | DB | ✓ | 13.0.3 (SQLite 3.53.4) | — |
| Discogs live account | hand verification | ✓ connected, collection empty | — | fake-discogs for every automated check |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (`pool: 'forks'`, node env, `server-only` stubbed) |
| Config file | `vitest.config.ts` (includes `src/**/*.test.ts`) |
| Quick run command | `npx vitest run src/server/jobs/handlers/add-to-collection.test.ts` (any single file, under 3 s) |
| Full suite command | `npx vitest run` (64 files, 963 tests, about 11 s, measured this session) |
| Integration | `node scripts/verify-discogs-import.ts` (new, modeled on `verify-discogs-search.ts`; starts a built app against `fake-discogs.mjs` with a temp DATA_DIR) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IMP-01 | No POST without a confirm; confirm resolves the release from the candidate; a client release id is rejected; the gate refuses other writes | unit | `npx vitest run src/server/discogs/client.test.ts src/app/api/spines/[id]/import/route.test.ts` | client ✅ / route ❌ W0 |
| IMP-02 | POST goes to the setting folder (default 1); folder 0 is refused; the folder list excludes 0 | unit | `npx vitest run src/server/jobs/handlers/add-to-collection.test.ts src/app/api/discogs/folders/route.test.ts` | ❌ W0 |
| IMP-03 | Local dup → 409 with photo and spine number; remote foreign instance → `already_in_collection`, no POST; Link existing; Add another copy POSTs | unit | `npx vitest run src/server/imports/store.test.ts src/server/jobs/handlers/add-to-collection.test.ts` | ❌ W0 |
| IMP-04 | Timeout/5xx after commit → next attempt adopts, `post_count=1`; crash with intent → adopt; final-attempt recovery → row failed → Retry adopts; partial unique indexes; dedupe re-enqueue | unit + integration | `npx vitest run src/server/discogs/collection.test.ts src/server/jobs/handlers/add-to-collection.test.ts` and `node scripts/verify-discogs-import.ts` (kill while the fake server holds the POST → restart → exactly one instance in the fake collection, `instance_id` stored) | ❌ W0 |
| REV-03 | D-10 precedence table; counts per status; `?status=` filter; invalid param → All | unit | `npx vitest run src/lib/review-status.test.ts src/server/scan/queries.test.ts` | ❌ W0 |
| REV-04 | Retry failed search → new again-search; retry failed import → same row, reconcile first; retry-all skips when disconnected | unit | `npx vitest run src/app/api/spines/[id]/retry/route.test.ts` | ❌ W0 |
| REV-05 | Mark/unmark; refused on an imported spine; hides candidates; survives re-scan merge (Pitfall 5) | unit | `npx vitest run src/app/api/spines/[id]/not-on-discogs/route.test.ts src/server/scan/merge.test.ts` | merge ✅ / route ❌ W0 |
| (manual) | First real import on the owner's account appears in Uncategorized; kill mid-import on the real account → no duplicate | manual UAT | — (port 3001) | — |

### Sampling Rate
- **Per task commit:** the touched test files (`npx vitest run <files>`) plus `npx tsc --noEmit` for schema/type changes.
- **Per wave merge:** `npx vitest run` plus `npx biome check`.
- **Phase gate:** full suite green, plus `node scripts/verify-discogs-import.ts` green, before `/gsd-verify-work`. Then the manual real-account check.

### Wave 0 Gaps
- [ ] `test/fixtures/fake-discogs.mjs`: collection folders, collection/releases, POST add, and `postMode` control (`hang-after-commit`, `502-after-commit`), plus a POST log
- [ ] `test/fixtures/discogs/collection-releases-owned.json`, `collection-releases-empty.json` (the empty one copied verbatim from the live probe), `add-201.json`, `folders.json`
- [ ] `src/server/discogs/collection.test.ts`: `pickAdoptable` table (snapshot, recorded, skew boundary, NaN date, multiple candidates)
- [ ] `src/lib/review-status.test.ts`: all six statuses and the precedence collisions
- [ ] `scripts/verify-discogs-import.ts`: end to end, including a kill/restart step

## Security Domain

`security_enforcement: true`, ASVS L1. This is the first phase that changes the owner's external account, so CSRF and the write gate are the high-impact controls.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (single local user; Discogs OAuth already in place) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `src/proxy.ts` loopback Host plus exact-Origin check on mutations. Write allowlist in `client.ts` (regex, non-zero folder) |
| V5 Input Validation | yes | zod `strictObject` bodies. `candidateId` → server-side release lookup. Folder id `int ≥ 1` and present in the cached list. Discogs responses parsed with zod |
| V7 Error Handling/Logging | yes | Status-only error labels with the username redacted (Pitfall 6). Never echo Discogs bodies or secrets |
| V13 API | yes | JSON-only mutating routes (forces a CORS preflight). 409 for state conflicts |
| V6 Cryptography | no (PLAINTEXT OAuth over HTTPS, unchanged) | — |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|-----------|
| Cross-site request triggers a collection add | Tampering | Proxy Origin guard, JSON content type, the confirm needs a valid `candidateId` for that spine |
| Path injection into the Discogs URL (username/folder/release) | Tampering | Integer validation, `encodeURIComponent(username)`, `buildUrl` refuses `?#`, allowlist regex |
| Duplicate writes (double-click, replay, crash) | Tampering / DoS on data integrity | Partial unique indexes, IMMEDIATE transactions, intent plus reconcile |
| Username or token leakage in errors or logs | Information disclosure | Label redaction, canary tests (the existing pattern uses `CANARY*` secrets) |
| Widened client used for other writes later | Elevation | Regex allowlist plus a unit test that DELETE/PUT and other POST paths are refused |

## Sources

### Primary (HIGH confidence)
- Codebase, read this session: `src/server/discogs/client.ts` (lines 106-108 `isAllowed`, 179 label, 245-253 error mapping), `src/server/jobs/{queue,worker,types}.ts`, `handlers/{index,fetch-release,search-spine}.ts`, `src/server/discogs/{enqueue,auth,config,oauth}.ts`, `src/server/db/{schema,client}.ts`, `src/server/scan/{queries,merge,orphans}.ts`, `src/lib/{discogs-types,scan-types}.ts`, `src/components/spines-filter-bar.tsx`, `drizzle/*`, `vitest.config.ts`, `test/fixtures/fake-discogs.mjs`
- Live read-only Discogs probe (GET only, owner's OAuth, 6 requests, 2026-10-22): folders shape, empty collection, search `user_data`, 200-empty for unowned or nonexistent releases, 422 validation body
- Scratch verification: drizzle-kit 0.31.11 partial unique index SQL, and enforcement on better-sqlite3 13.0.3 / SQLite 3.53.4

### Secondary (MEDIUM confidence)
- Discogs API docs via Wayback snapshot 2025-12-26 of https://www.discogs.com/developers (the live page returns 403 to non-browser clients): Collection, Get Folders, Items By Release, Add To Collection Folder (201 body), Delete Instance
- `.planning/research/PITFALLS.md` Pitfall 6/7, recovery table, verification checklist

### Tertiary (LOW confidence)
- POST error codes for nonexistent releases, and body-less POST acceptance (A1, A2)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. No new dependencies; versions read from package.json.
- Architecture: HIGH. Built directly on existing, tested queue, worker and gate code.
- Discogs contract: MEDIUM-HIGH. GET shapes verified live. POST shape cited from docs and confirmed on the first real import.
- Pitfalls: HIGH. Pitfalls 3, 4 and 5 were found by reading the actual queue, recovery and merge code.

**Research date:** 2026-10-22
**Valid until:** 2026-11-21 (stable). Re-check the Discogs POST behavior on the first real import.
