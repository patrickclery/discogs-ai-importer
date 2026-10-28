# Phase 6: Bulk Canada auto-import with compact review cards - Research

**Researched:** 2026-10-23
**Domain:** Discogs master versions lookup, SQLite job pipeline extension, bulk selection UI (Next 16 / React 19 / shadcn / nuqs), demo stubs
**Confidence:** HIGH (codebase read in full for every touched module; the versions endpoint was live-probed this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Canada resolution
- D-01: Resolve using the top match's (rank-1 candidate) `master_id`: `GET /masters/{id}/versions?country=Canada&format=CD`. One Discogs read per spine. The candidate rows already store `masterId` and `country`. The new endpoint must be added to the client allowlist (Phase 4 D-06 style, GET only).
- D-02: If the top match's `country` is already Canada, use it as is, with no extra call.
- D-03: Several Canadian versions: prefer a CD format, then the same label as the top match, then the earliest year.
- D-04: No `master_id`, or no Canadian version: import the top match anyway, and show "No Canadian pressing, used {country}" on the card. The fallback must be visible and recorded per spine.

#### Selection and bulk action
- D-05: A checkbox on each card, plus a sticky action bar with "Select all shown" (respects the current status filter) and a selected count.
- D-06: Eligible spines are active, have a top match, and are not imported, importing or `not_on_discogs`. Ineligible spines show a disabled checkbox with the reason.
- D-07: One confirm dialog, "Import N to {folder} as Canadian pressings", then Start.
- D-08: Resolution runs as a background job per spine (resolve Canada, then create an import and enqueue the existing `add_to_collection` job), through the rate-limited Discogs queue. No up-front preview step.
- D-09: Local duplicates (the release is already imported or importing from another spine, Phase 4 D-04): skip and flag "Already imported from spine #n". Never add another copy automatically. The remote "already in your collection" check (Phase 4 D-05) still runs per job, unchanged.

#### Compact card layout
- D-10: A collapsed card shows a checkbox, #n, status badge(s), the spine crop, then the top match directly below it (thumbnail, artist – title, year, country, catno).
- D-11: An "Edit" chevron expands the card in place to today's full card (fields, all matches, actions). Edit fields stay hidden until it is expanded.
- D-12: Responsive grid: 1 column on phones, 2 at sm, 3 at lg, 4 at xl.
- D-13: A Compact/Detailed toggle in the filter bar. Compact is the default, and the choice is kept in the URL (nuqs, like the status filter).

#### Country setting, feedback and demo
- D-14: A "Preferred country" setting on the Settings Discogs card, defaulting to "Canada", stored in the `settings` table. The bulk action label uses it.
- D-15: Each card shows a badge, "Canada" (the preferred country) or "Fallback: {country}", next to the import state. A "Fallback" filter lists the non-preferred ones, and a toast reports when the batch finishes.
- D-16: Low-confidence spines are selectable like any other, and select-all includes them. The worst-field badge stays visible on the compact card.
- D-17: The demo site (Phase 5) stubs the versions endpoint and the bulk flow with canned data so the demo shows bulk import end to end. Zero real `/api` or Discogs calls still holds.

### Claude's Discretion
- Job type naming, schema additions (for example the resolved release and fallback reason on the import or spine), the batch-tracking mechanism for the "batch finished" toast, and how the expanded card reuses the existing SpineCard and DiscogsMatches components.

### Deferred Ideas (OUT OF SCOPE)
- Shift-click range select
- Preview-before-import of the resolved releases
- Undo of a bulk import
</user_constraints>

<phase_requirements>
## Phase Requirements (proposed IDs, derived from D-01..D-17)

| ID | Description | Research Support |
|----|-------------|------------------|
| BULK-01 | Compact card: checkbox, #n, worst-field/edited/orphan badges, country + state badges, crop, top match (thumb, title, year · country · catno); responsive grid 1/2/3/4 columns (D-10, D-12, D-16) | Pattern 6; UI-SPEC Layout |
| BULK-02 | "Edit spine" expands a compact card in place into the full SpineCard (col-span-full), expanded state survives polls (D-11) | Pattern 6 |
| BULK-03 | Compact/Detailed toggle in the filter bar, `?view=detailed` via nuqs, Compact default (D-13) | Pattern 7 |
| BULK-04 | Per-card select checkbox with server-computed eligibility + reason; "Select all shown ({e})" tri-state respecting all filters; selected count; selection pruned to shown + eligible (D-05, D-06, D-16) | Pattern 5, Pitfall 9 |
| BULK-05 | Confirm dialog "Import N to {folder} as {demonym} pressings" then Start; server re-validates each pick and reports skipped-because-changed; one bulk run at a time (D-07) | Pattern 3 |
| BULK-06 | One background lookup job per spine on the discogs lane: preferred-country short-circuit (no request), else one `GET /masters/{id}/versions?country=&format=CD`, D-03 tie-break, then `createImport` + existing `add_to_collection` (D-01, D-02, D-03, D-08) | Patterns 1, 2, 4 |
| BULK-07 | Fallback is recorded per spine (no master / no version / no country) and shown as `Fallback: {country}` badge + line (D-04, D-15) | Pattern 2, schema |
| BULK-08 | Local duplicates are skipped and flagged "Already imported from spine #m" (other photo named); never auto-adds a copy; remote held-copy check unchanged (D-09) | Pattern 4 |
| BULK-09 | Preferred country setting on Settings (default Canada, settings table), used by the dialog, the lookup and the badges; demo twin (D-14) | Pitfall 1 |
| BULK-10 | Fallback filter (`?fallback=1`) with count, bulk progress/last-result line, batch-finished toast once per run (D-15) | Pattern 8 |
| BULK-11 | Lookup failure is stored, reads as Failed, retried by the card's Retry and by Retry all failed; an abandoned lookup job never leaves a spine "Finding pressing" forever; header "left" counts lookups | Pattern 9 |
| BULK-12 | Demo: stubbed bulk route, lookup outcomes from a canned fixture, timestamp-derived progress; zero real `/api` or Discogs calls; mock-coverage gate passes (D-17) | Pattern 10 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Port 3001 only (`pnpm dev`/`serve` pass `-p 3001`); never 3000 (Grafana). `pnpm` is not on PATH: use `./node_modules/.bin/<tool>` or `npx`.
- Discogs: 60 req/min authenticated, every request through the single throttled gate and the durable `jobs` table; descriptive User-Agent (already `DiscogsAIImporter/0.1 +https://github.com/patrickclery/discogs-ai-importer`, `src/server/discogs/config.ts:8-9`).
- Storage SQLite (better-sqlite3 13 + drizzle 0.45); migrations generated with drizzle-kit and committed under `drizzle/`; `migrate()` at boot.
- Portability: all state in the data folder; no external services.
- Secrets never committed; no secret in the settings table.
- Tests: Vitest; record fixtures, never hit live APIs in tests.
- TypeScript pinned 6.0.3; Biome for lint; no `font-semibold`/`font-bold` in app code (UI-SPEC).
- GSD workflow: changes go through `/gsd-execute-phase`.
- Owner memory: UAT steps in plain do/see language; phases 1-5 are done.

## Summary

The phase is mostly plumbing on top of a well-fenced Phase 4 pipeline. The cleanest design keeps `createImport`, `enqueueImport` and the `add_to_collection` handler unchanged in behaviour, and adds a **pre-import lookup stage**: a new `bulk_runs` / `bulk_items` pair of tables and one new discogs-lane job type (`resolve_pressing`). The job reads the spine's top-match candidate, short-circuits when its country already equals the preferred country (D-02) or it has no master (D-04), otherwise makes exactly one `GET /masters/{id}/versions` call (D-01), picks a version (D-03), stores the picked version as a hidden candidate row (new source `pressing`) so `createImport({spineId, candidateId})` works unmodified, and maps every `createImport` result onto the bulk item (ok / duplicate -> skipped, D-09 / changed -> skipped).

The live probe found two facts that change the plan. First, **the `country` filter is case-sensitive** (`country=canada` returns 0 items; `country=Canada` returns 17), so the setting must be stored in Discogs' exact spelling. Second, **a master id that does not exist still answers 200 with versions from the whole database** (`/masters/999999999/versions` returned 8,135,288 items; `/masters/999999999` answers 404). Without a guard, a deleted or merged master would import a random Canadian CD. The handler must reject implausible answers.

The client's write allowlist already lets every GET through (`isAllowed` returns true for GET), so "add to the allowlist" means adding a typed, validated path builder plus a test, not widening the gate. The rest (compact cards, selection, nuqs toggles, demo twin) follows patterns that already exist in `spines-filter-bar.tsx`, `src/demo/ops/imports.ts` and the mock-coverage gate.

**Primary recommendation:** Add `bulk_runs` + `bulk_items` and a `resolve_pressing` job. Store the chosen version as a `pressing` candidate and call the existing `createImport`. Guard the versions answer (exact-case country, an item-count cap, a title check). Interleave each spine's add job right after its lookup by passing `runAfter` through `createImport` to `enqueueImport`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Eligibility per spine (D-06) | API / Backend (read model `getSpines`) | Browser (renders reason) | Must match what the start route accepts; one pure function in `src/lib` used by both |
| Selection state, select-all, pruning | Browser | — | Client state only, never URL (UI-SPEC) |
| Layout + Fallback filter state | Browser (nuqs URL) | API (`?fallback=1` filter in `getSpines`) | Same pattern as `?status=`/`?review=` |
| Start bulk run (validate picks, create run + items + jobs) | API route `POST /api/spines/bulk-import` | Database | Paid/rate-limited work is always enqueued, never inline (Phase 4 rule) |
| Canada resolution (versions call, tie-break) | Background job (discogs lane) | Discogs client/gate | D-08; rate limit |
| Import creation + add POST | Existing `createImport` + `add_to_collection` | — | Phase 4 invariants D-04/D-05/D-07/D-08 |
| Batch progress / toast | API read model (`SpinesResponse.bulk`) | Browser (dedupe toast by run id) | Survives reloads; toast is a view of server state |
| Preferred country | Server action + settings table | Demo settings alias | Same as collection folder field |
| Demo | Browser (demo route table + store) | — | D-17, zero real requests |

## Standard Stack

No new npm packages. Everything uses what is installed (`package.json`, read this session):

| Library | Version (installed) | Purpose in Phase 6 |
|---------|---------|---------|
| next | 16.4.2 | New route handler `POST /api/spines/bulk-import`; server action `savePreferredCountry` |
| better-sqlite3 / drizzle-orm / drizzle-kit | 13.0.3 / 0.45.4 / 0.31.11 | New tables, migration `0004_*` |
| zod | 4.6.7 | Versions response schema, bulk body schema, preferred-country schema |
| nuqs | 2.10.1 | `?view=detailed`, `?fallback=1` |
| @tanstack/react-query | 5.104.2 | Polling, start mutation |
| radix-ui | 1.8.1 | Checkbox primitive (via `shadcn add checkbox`, which adds only `src/components/ui/checkbox.tsx`) |
| sonner | 2.0.8 | Batch-finished toast |
| vitest | 5.0.5 | Tests |

**Installation:**
```bash
./node_modules/.bin/shadcn add checkbox      # registry component, no npm dependency
./node_modules/.bin/drizzle-kit generate --name bulk_import
```
`drizzle-kit generate` supports `--name` [VERIFIED: `drizzle-kit generate --help` this session].

## Package Legitimacy Audit

No external packages are installed in this phase. `shadcn add checkbox` copies registry source that imports the already-installed `radix-ui@1.8.1` (UI-SPEC Component Inventory). The executor should check the diff adds only `src/components/ui/checkbox.tsx` and leaves `package.json` and the lockfile untouched.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Discogs `GET /masters/{id}/versions`: verified behaviour

The official docs page answered 403 this session (as in every earlier phase). All of this comes from **live unauthenticated probes on 2026-10-23** against master 13814 (Nirvana, Nevermind) [VERIFIED: live probe, api.discogs.com]:

| Aspect | Observed |
|--------|----------|
| Params that work | `country`, `format`, `label`, `released` (facets), `page`, `per_page`, `sort` (`released` verified), `sort_order` (`asc`/`desc` verified) |
| `per_page` cap | 100 (`per_page=1000` answered `per_page: 100`, `pages: 9`) |
| Default `per_page` | 50 |
| Case sensitivity | `country=canada&format=cd` gives `items: 0`, while `country=Canada&format=CD` gives `items: 17`. **Filters are exact-case.** |
| Unknown master | `/masters/999999999/versions` answers **200** with `items: 8135288` (the whole database). `/masters/999999999` answers 404 `{"message":"That master release does not exist or may have been deleted."}` |
| `format=CD` filter | Still returned entries with `major_formats` `["Box Set"]` (2) and `["Vinyl"]` (1) among 360 |
| `released` | `"1991"`-style 4-digit string, or `"0"` for unknown (124 of 360). `sort=released` puts `"0"` last in **both** asc and desc. |
| `status` | `"Accepted"` on all observed |
| Format facet | Includes `Unofficial Release` (291 of 887 versions of this master): bootlegs are versions too |
| Rate headers (unauth) | `x-discogs-ratelimit: 25` (authenticated is 60) |

Version entry shape (verbatim from the probe, one item):
```json
{
  "id": 12009956,
  "label": "DGC",
  "country": "Canada",
  "title": "Nevermind",
  "major_formats": ["CD"],
  "format": "Album",
  "catno": "DGCD-24425",
  "released": "1991",
  "status": "Accepted",
  "resource_url": "https://api.discogs.com/releases/12009956",
  "thumb": "https://i.discogs.com/pP51JHbYD8ICF8u47FKTVYSDilZkR2GhUqwTjBvq9qs/rs:fit/g:sm/q:40/h:150/w:150/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTEyMDA5/OTU2LTE1MzIwOTI5/NTQtNDkwNi5qcGVn.jpeg",
  "stats": { "community": { "in_wantlist": 599, "in_collection": 720 } }
}
```
Envelope keys: `pagination` (`page`, `pages`, `per_page`, `items`, `urls`), `filters` (`applied`, `available`), `filter_facets`, `versions`.

Things the entry does **not** carry, which the snapshot builder has to account for: no `master_id` (so the response cannot prove it belongs to the master), no artist, no labels array (`label` is one string), `format` is the **descriptions** string (`"Album, Reissue"`) rather than the format name, `catno` may be comma-joined (`"CDGCD 24425 *, CDGCD-24425"`), and `released` is a string.

Request to send (one call, D-01):
```
GET /masters/{masterId}/versions?country={preferred}&format=CD&per_page=100&page=1&sort=released&sort_order=asc
```
`sort=released asc` puts the earliest dated versions on page 1, so a master with more than 100 matching versions still offers its earliest. Only page 1 is read (D-01: one read).

## Architecture Patterns

### System Architecture Diagram

```
[Browser /spines]                                   [Worker, discogs lane, concurrency 1, ~1.1 s gate]
 select cards ──> BulkImportBar ──> BulkImportDialog
                                        │ POST /api/spines/bulk-import {items:[{spineId,candidateId}]}
                                        v
                      [route] discogsReady? one run at a time? ── no ──> 409
                                        │ yes, IMMEDIATE tx
                      for each item: eligible AND candidateId is still the top match?
                           │ no -> count as "changed"            │ yes
                           v                                      v
                      response {started k, skipped x}     INSERT bulk_items(queued) + enqueue resolve_pressing
                                                           (run_after = start + i, dedupe pressing:{itemId})
                                                                  │
                                                                  v
                                                [resolve_pressing job]
                                    spine vanished / not active ──> item skipped(changed)
                                    no sign-in ──> item failed(auth)       429 ──> JobDeferredError
                                    top.country == preferred (ci)? ──> chosen = top (outcome preferred, NO request)
                                    top.master_id null? ──> chosen = top (fallback no_master)
                                    else GET /masters/{id}/versions  ──> guard (items cap, exact country, title)
                                          pick (CD > same label > earliest year) or none -> fallback no_version
                                    chosen != top? -> upsert discogs_candidates(source 'pressing')
                                    createImport({spineId, candidateId: chosen, runAfter: job.runAfter})
                                      ok ──> item resolved(import_id) ──> existing add_to_collection job
                                      duplicate ──> item skipped(dup spine) (D-09, nothing written)
                                      already_confirmed / not_importable / not_on_discogs / retry_first / no_candidate
                                           ──> item skipped(changed)
                                                                  │
[Browser polls GET /api/spines (3 s while active)] <── read model joins latest bulk item + latest import per spine
   badges: Finding pressing / Canada / Fallback: X / skipped line / lookup failed + Retry
   bar: "Bulk import: d / n done"  ──run finishes──> toast once per run id
```

### Recommended Project Structure (new and changed files)

```
src/lib/
  bulk-types.ts          # BULK_ITEM_STATUSES, PRESSING_OUTCOMES, BulkItemDto, BulkRunDto, eligibility reasons (client-safe)
  bulk-eligibility.ts    # pure eligibilityOf(spine) -> {eligible, reason}; used by read model AND start route
  pressing.ts            # pure pickVersion(), isPreferredCountry(), pressingPhrase()/demonym table
src/server/discogs/
  versions.ts            # masterVersionsPath(), VersionsEnvelopeSchema, parseVersions(), snapshot builder
src/server/bulk/
  store.ts               # startBulkRun(), resolveItem() result mapping, retryBulkItem(), markInterruptedLookups()
  queries.ts             # bulkForSpines() (one query), latestRunSummary()
src/server/jobs/handlers/
  resolve-pressing.ts    # the job
src/app/api/spines/bulk-import/route.ts
src/demo/ops/bulk.ts, src/demo/routes/bulk.ts, demo/fixtures/pressings.json
drizzle/0004_bulk_import.sql (+ meta snapshot, journal)
```

### Pattern 1: Schema additions (Claude's discretion; recommended)

```ts
// src/server/db/schema.ts (additions). Enums are TS-only on SQLite: no CHECK
// constraints exist in drizzle/*.sql (grep CHECK returned nothing).
export const bulkRuns = sqliteTable('bulk_runs', {
  id: text('id').primaryKey(),
  folderId: integer('folder_id').notNull(),
  /** The preferred country at start, exact Discogs spelling (D-14). */
  country: text('country').notNull(),
  total: integer('total').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const bulkItems = sqliteTable('bulk_items', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => bulkRuns.id),
  spineId: text('spine_id').notNull().references(() => spines.id),
  /** The top match the owner saw (candidate id, validated at start). */
  candidateId: text('candidate_id').notNull(),
  status: text('status', { enum: BULK_ITEM_STATUSES }).notNull().default('queued'),
  // queued | resolved | skipped | failed
  outcome: text('outcome', { enum: PRESSING_OUTCOMES }),
  // preferred | fallback_no_version | fallback_no_master | fallback_no_country
  skipReason: text('skip_reason'),           // duplicate | changed
  dupSpineId: text('dup_spine_id'),          // D-09 line: "Already imported from spine #m"
  releaseId: integer('release_id'),          // the chosen release
  country: text('country'),                  // the chosen release's country (badge)
  importId: text('import_id'),
  errorKind: text('error_kind'),
  error: text('error'),
  jobId: text('job_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  // One open lookup per spine across runs (race-proof backstop like imports_spine_open_idx).
  uniqueIndex('bulk_items_spine_open_idx').on(t.spineId).where(sql`${t.status} = 'queued'`),
  index('bulk_items_run_idx').on(t.runId),
  index('bulk_items_import_idx').on(t.importId),
]);
```
Why separate tables and not a new import status: `IMPORT_STATUSES` drives `importPhaseOf`, `canChangeMatchOf`, `imports_spine_open_idx`, `markInterruptedImports`, `IMPORTS_FAILED_SQL` and the D-07 reconcile. A `resolving` import status would touch every one of them. The lookup happens **before** an import exists, so it belongs in its own table.

In-repo values this relies on (read this session):
- `IMPORT_STATUSES` [VERIFIED: src/lib/import-types.ts:13-19]: `'pending', 'importing', 'imported', 'already_in_collection', 'failed'`
- `CANDIDATE_SOURCES` [VERIFIED: src/lib/discogs-types.ts:260]: `export const CANDIDATE_SOURCES = ['auto', 'manual'] as const;`. Phase 6 adds `'pressing'`.
- `discogs_candidates.search_id` is `notNull().references(() => discogsSearches.id)` and the unique index is `(spine_id, source, release_id)` [VERIFIED: src/server/db/schema.ts:258-285].

### Pattern 2: Version pick (D-03) with guards

```ts
// src/lib/pressing.ts (pure, unit-tested)
export type VersionLite = { id: number; label: string | null; country: string | null;
  title: string | null; majorFormats: string[]; format: string | null; released: string | null };

/** Case-insensitive equality on trimmed values (D-02, UI-SPEC badge rule). */
export const sameCountry = (a: string | null, b: string) =>
  !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu, '');

export function pickVersion(
  versions: VersionLite[],
  top: { labels: string[]; title: string /* the release title, after "Artist - " */ },
  country: string,
): VersionLite | null {
  const labels = new Set(top.labels.map(norm));
  const want = norm(top.title);
  const year = (r: string | null) => (r && /^\d{4}/.test(r) && r.slice(0, 4) !== '0000' ? Number(r.slice(0, 4)) : Infinity);
  const pool = versions.filter((v) =>
    sameCountry(v.country, country) &&
    // title guard against an unknown master answering with the whole DB (Pitfall 2)
    (!want || (norm(v.title).includes(want) || want.includes(norm(v.title)))));
  const key = (v: VersionLite) => [
    v.majorFormats.includes('CD') ? 0 : 1,                       // D-03 1: a CD format
    /unofficial release/i.test(v.format ?? '') ? 1 : 0,           // [ASSUMED] official before bootleg
    labels.has(norm(v.label)) ? 0 : 1,                            // D-03 2: same label as top match
    year(v.released),                                             // D-03 3: earliest year; "0" last
    v.id,                                                         // stable
  ];
  return pool.sort((a, b) => cmp(key(a), key(b)))[0] ?? null;
}
```
Guards, applied in this order in `parseVersions` / the handler:
1. **Envelope + item schema** with zod, strings capped (same `cap()` style as `src/server/discogs/search.ts`). Drop invalid entries individually.
2. **Implausible count:** `pagination.items > 1000` means the master is unusable and leads to `fallback_no_master` with an internal reason. A real master's Canadian CD versions number in the tens (17 for Nevermind), while an unknown master returned 8.1M unfiltered.
3. **Exact country** re-checked per entry (defence in depth).
4. **Title containment** against the top match's release title (the part after the first `" - "` of the candidate `title`).

### Pattern 3: Start route `POST /api/spines/bulk-import`

- Body (strict zod, JSON only, same `readBody` as `src/app/api/spines/[id]/import/route.ts:31-59`): `{ items: [{ spineId: string(1..40), candidateId: string(1..40) }] }`, `.max(2000)`, deduped by spineId. The release id is never taken from the request (T-04-02).
- `discogsReady()` must be true (or 409 `not_connected`, with the Reconnect/Connect copy exactly as in the import route lines 69-84).
- One run at a time: 409 `bulk_running` while any `bulk_items.status = 'queued'` exists.
- One IMMEDIATE transaction: for each item, recompute `eligibilityOf` with the same pure function as the read model, and require that the candidateId is still `orderCandidates(...)[0]` for that spine. If either check fails, count the item as changed. Otherwise insert the item and `enqueue({ lane: 'discogs', type: 'resolve_pressing', payload: { itemId }, dedupeKey: \`pressing:${itemId}\`, runAfter: start + i })`. A `bulk_items_spine_open_idx` violation counts as changed.
- Respond `201 { runId, started: k, skipped: x }`. The UI shows the start-with-skips toast when `x > 0`.

Top match = first of `orderCandidates` (manual newest first, then catno match, then Discogs rank) [VERIFIED: src/server/discogs/queries.ts:310-321]. That is exactly what the card shows as "Top match", so "rank-1" in D-01 means this order, not `rank = 0`.

### Pattern 4: The `resolve_pressing` handler

Copy the skeleton of `src/server/jobs/handlers/fetch-release.ts` (pre-checks, `JobDeferredError` on a paused gate or 429, `ctx.isCurrent()` before the request, error-class switch by `err.name`). Register it in `handlers` [VERIFIED: src/server/jobs/handlers/index.ts:13-42] with `timeoutMs: 60_000`.

Then call `createImport` unchanged except for an optional `runAfter`:
```ts
// src/server/imports/store.ts: createImport input gains runAfter?: number,
// passed to enqueueImport(db, importId, { runAfter }) -> enqueue({... runAfter }).
// Still the ONE add_to_collection enqueue site (store.test.ts guard, lines 1027-1057).
const res = createImport(db, { spineId, candidateId: chosenId, runAfter: ctx.job.runAfter });
switch (res.status) {
  case 'ok':          resolve(item, { importId: res.importId, ... }); break;
  case 'duplicate':   skip(item, 'duplicate', dupSpineId); break;   // D-09: never allowDuplicate
  default:            skip(item, 'changed'); break;  // already_confirmed, not_importable, not_on_discogs,
                                                     // retry_first, no_candidate, not_found
}
```
- `createImport`'s candidate lookup does not filter on source (`SELECT ... FROM discogs_candidates WHERE id = @candidateId AND spine_id = @spineId`) [VERIFIED: src/server/imports/store.ts:242-250], so a `pressing` row is importable as-is and its `thumb_url` gives the confirmed panel its cover. The cover comes through `LATEST_IMPORTS_SQL`'s candidate join and `/api/discogs/thumb/{candidateId}`.
- The pressing row needs a `search_id` (NOT NULL FK). Use the top-match candidate's own `search_id`. The `ON CONFLICT(spine_id, source, release_id) DO UPDATE` upsert follows `addManualCandidate` (src/server/discogs/store.ts:334-347).
- Hide `pressing` rows from candidate lists. Add `AND c.source <> 'pressing'` to `CANDIDATES_SQL` and `SPINE_CANDIDATES_SQL` (src/server/discogs/queries.ts:73-87). Otherwise they would become the "Top match" and count in `candidateCount`. `replaceAutoCandidates` deletes `source = 'auto'` only, so pressing rows survive re-searches, which is what an import that references them needs.
- **Interleaving:** the claim order is `ORDER BY run_after, id` [VERIFIED: src/server/jobs/queue.ts:93-105]. Resolve jobs get `run_after = start + i`, and each add job inherits its resolve job's `run_after`. The lane then runs lookup 1, add 1, lookup 2, add 2 and so on, instead of every lookup first (about 5.5 min of "Finding pressing" for 300 spines before the first add).
- Snapshot of a chosen version that is not the top match: title `"{top.artist} - {version.title}"` (top.artist from the candidate row's `artist` column), year `toYear(released)` (`"0"` becomes null), country, labels `[version.label]`, catno, formats `[{ name: majorFormats[0] ?? 'CD', qty: null, descriptions: format.split(', '), text: null }]`, thumbUrl `version.thumb`, masterId = top's master id, stage `'release'`.

### Pattern 5: Eligibility (D-06, D-16), one pure function

`eligibilityOf(spine: SpineDto, openBulkItem)` gives `{ eligible: true } | { eligible: false, reason }`, with reasons in UI-SPEC copy order:
`orphaned` (state not active), `not_on_discogs`, `searching` (search queued/searching), `no_match` (no top candidate), `import_*` (any latest import: open, held, imported or failed, each with its own copy), `finding` (open bulk item), `skipped_duplicate` (latest bulk item skipped duplicate, newer than any import). Low confidence is never a reason. Add `bulk: { eligible, reason, item: BulkItemDto | null }` to `SpineDto` in `getSpines`.

Note: the UI-SPEC sentence "no import in any non-failed phase" conflicts with its own copy table, which marks "Import failed" ineligible. Follow the copy table: **any latest import makes the spine ineligible**. `createImport` would answer `already_confirmed` or `retry_first` for most such rows anyway.

### Pattern 6: Compact card reuse

`CompactSpineCard` renders the existing `SpineView`/`SpineCard` when expanded (UI-SPEC). Expanded ids live in a `Set<string>` keyed by spine id at `SpinesView` level, so polls do not reset it. `SpineCard` gains a `leading` slot before `#n`. The top-match row uses `CandidateDto` (`topCandidates[0]`) or the `ImportDto.candidate` snapshot.

### Pattern 7: nuqs hooks (copy existing)

```ts
// Same shape as useReviewFilter (src/components/spines-filter-bar.tsx:36-41)
export function useCardLayout() {
  const [raw, setRaw] = useQueryState('view', { scroll: false });
  const layout = raw === 'detailed' ? 'detailed' : 'compact';
  return [layout, (v: 'compact' | 'detailed') => setRaw(v === 'detailed' ? 'detailed' : null)] as const;
}
export function useFallbackFilter() {
  const [raw, setRaw] = useQueryState('fallback', { scroll: true });
  return [raw === '1', (on: boolean) => setRaw(on ? '1' : null)] as const;
}
```
`GET /api/spines` parses `fallback` exactly `'1'` (like `parseReviewParam`) and ANDs it in `getSpines`. The fallback count follows the existing count rule: it covers the photo filter and ignores the other filters.

### Pattern 8: Batch tracking and toast

`SpinesResponse.bulk: BulkRunDto | null` describes the latest run: `{ id, country, total, done, added, fallbacks, alreadyInCollection, skipped, failed, running }`, computed in one SQL aggregate over `bulk_items` LEFT JOIN `imports` + `jobs` (use `importPhaseOf` semantics). An item is done when it is skipped or failed, or when it is resolved and its import phase is `imported`, `already_in_collection` or `failed`. `running = done < total`. The client keeps a `useRef<Set<string>>` of run ids it saw running and toasts once when one of them turns finished. A reload during a run still toasts; a reload after the run does not, and the bar's last-result line covers that case. Nothing needs a `finished_at` write.

### Pattern 9: Failure, retry, crash safety

- **Read-model defence** (mirrors `importPhaseOf`): an item whose status is `queued` and whose job is `failed`, `cancelled` or missing reads as failed (`interrupted`).
- **Maintenance hook:** add `markInterruptedLookups()` to `maintenance` [VERIFIED: src/server/jobs/handlers/index.ts:49-57]. It is one UPDATE (queued items whose job failed or was cancelled become failed) and makes no request.
- **Error classes,** the same as fetch-release: 429 or a paused gate gives `JobDeferredError` and spends no attempt. 401 or no sign-in fails the item `auth` (UI: "rejected the connection"). A network error or 5xx is recorded and rethrown, so the worker retries (max 3). A 404 on the versions call should not happen, because unknown masters answer 200. If it does, treat it as `fallback_no_master` and continue to import (D-04). Any other 4xx fails the item `rejected`.
- **Review status:** extend `ReviewStatusInput` with `lookup: 'finding' | 'failed' | null`, counted only when the item is newer than the latest import. Precedence: `finding` maps to `matched` (UI-SPEC assumption), and lookup `failed` maps to `failed` just below `not_on_discogs`. `reviewStatusOf` is in `src/lib/review-status.ts:34-56` [VERIFIED].
- **Retry:** `retrySpine` (src/server/imports/store.ts:493-553) checks the latest bulk item **before** the search fallback. When the item failed and no import is newer, it resets it to queued and enqueues a new job (release the old dedupe key first, as `enqueueImport` does). The item keeps its run's country. "Retry all failed" then works with no change, because it loops `retrySpine` over the failed spines.
- **Header count:** `IMPORTS_LEFT_SQL` counts only `type = 'add_to_collection'` [VERIFIED: src/server/discogs/status.ts:38-41]. Change it to `type IN ('add_to_collection', 'resolve_pressing')`.
- **Polling:** `discogsActive` (src/server/scan/queries.ts:350-353, 376) is also true while any listed spine has an open lookup.

### Pattern 10: Demo (D-17)

- The demo derives state from timestamps instead of timers (`src/demo/store.ts` header: "every in-flight thing has a readyAt-style timestamp"). Follow that: `startBulk` gives item i `runningAt = t0 + i*STEP` and `resolvedAt` with a precomputed outcome, then reuses `scheduleImport` from `src/demo/ops/imports.ts:115` for the import. The UI-SPEC's "advance the run on timers" is satisfied by this lazy derivation.
- The recorded fixture has **no `masterId`** (candidate keys verified: `country, title, stage, labels, releaseId, catnoMatch, year, catno, formats`). Add a hand-written `demo/fixtures/pressings.json` keyed by shelf key: `{ outcome, release? }`. Re-recording against the owner's account is not needed. Rank-1 countries in the fixture: US 23, none 10, UK 8, Canada 4, others scattered, so the demo naturally shows `preferred` (the 4 Canada spines, no lookup), fallback, and resolved-to-Canada (from canned entries). Add one deliberate duplicate pair for D-09.
- Add `POST /api/spines/bulk-import` to a new `src/demo/routes/bulk.ts` and spread it into `ROUTES` (src/demo/routes.ts:49-55). The **mock-coverage gate** (`src/demo/routes-coverage.test.ts`) fails until every real route has a demo route.
- `savePreferredCountry` must be added to both `src/app/settings/actions.ts` and `src/demo/settings-actions.ts`; `src/demo/settings-actions.test.ts:53` asserts it is a drop-in.
- `src/demo/read-model.ts` `buildSpinesResponse` / `buildStatusResponse` must emit the new `bulk` fields with the same pure helpers from `src/lib`.

### Anti-Patterns to Avoid
- **A `resolving` import status:** this breaks the Phase 4 state machine. Keep the lookup in `bulk_items`.
- **Calling `discogsFetch` from the start route:** paid or rate-limited work is always enqueued.
- **Taking the release id or country from the request:** the browser sends `{spineId, candidateId}` only.
- **Passing `allowDuplicate: true` from the bulk path:** this violates D-09.
- **A second `add_to_collection` enqueue site:** route everything through `createImport`, or `store.test.ts` fails.
- **Writing into a `['spines', …]` query key directly:** invalidate and dispatch `app:status-refresh` instead (UI-SPEC, Phase 3 Pitfall 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting / 429 | A loop with sleeps in the route | `jobs` table + `discogsFetch` gate + `JobDeferredError` | Already paces at 1112 ms and pauses the lane on 429 |
| Exactly-once add | Anything new | `createImport` → `add_to_collection` | D-07 intent/reconcile already proven |
| Local duplicate check | A new query | `createImport` (it returns `duplicate`) | Same rule as manual Add (D-04) |
| Cover thumbnails | Fetching the version thumb directly | A `pressing` candidate row with its `thumb_url` + `/api/discogs/thumb/{id}` | SSRF allowlist, size caps, cache already in `thumbs.ts` |
| Checkbox / tri-state | A custom input | shadcn `checkbox` (`checked="indeterminate"`) | Radix a11y |
| Settings storage | A new table | `getSetting`/`setSetting` [VERIFIED: src/server/settings.ts:32-60] | JSON in the `settings` table, travels with the data folder |

## Common Pitfalls

### Pitfall 1: Case-sensitive country filter
**What goes wrong:** The owner types `canada`, every lookup returns 0 versions, and every spine imports as a fallback.
**Evidence:** `country=canada&format=cd` returned `items: 0` [VERIFIED: live probe].
**How to avoid:** In `setPreferredCountry`, trim the value and match it case-insensitively against a known list of Discogs country names (at least the UI-SPEC demonym table: Canada, US, UK, Germany, Japan, France, Europe, Australia, Netherlands, Italy, Mexico, Brazil), storing the canonical spelling. Store anything else as typed. Send the stored value verbatim. Compare countries case-insensitively in code (D-02, the badge).

### Pitfall 2: Unknown or merged master answers with the whole database
**What goes wrong:** A 200 response full of unrelated Canadian CDs; the tie-break picks one and adds the wrong album to the owner's collection.
**Evidence:** `/masters/999999999/versions` returned 200 with 8,135,288 items [VERIFIED: live probe].
**How to avoid:** Apply the item-count cap and the title-containment guard (Pattern 2). Add a test with a fixture of a bogus-master answer.

### Pitfall 3: `format=CD` is not "CD only"
Box sets and multi-format versions come back with `major_formats` like `["Box Set"]`. D-03's "prefer a CD format" has to check `majorFormats.includes('CD')`; the filter alone is not enough.

### Pitfall 4: `released: "0"`
`"0"` means an unknown year. Sort it last for "earliest year", and store `null` (via `toYear`) in the snapshot.

### Pitfall 5: The top match changed between selection and start
A re-search finishing during review replaces auto candidates. The start route re-validates `candidateId === top`; the job re-reads the candidate by id and skips the item as `changed` when it is gone.

### Pitfall 6: Two selected spines resolve to the same pressing
This is expected (overlapping shelf photos). The first `createImport` writes a `pending` import, and the second gets `duplicate` and becomes `skipped` with `dupSpineId`. Test that order is deterministic (claim order).

### Pitfall 7: Lookups starve the adds
Without `runAfter` interleaving, all N lookups run before any add (Pattern 4).

### Pitfall 8: A pressing candidate leaks into the candidate list
It would become the next "Top match" and could make the next bulk run skip the lookup. Exclude `source = 'pressing'` from the list SQL (Pattern 4).

### Pitfall 9: Selection drift
Prune the selection to ids that are shown and eligible after every data update (UI-SPEC). Otherwise the count shown and the request disagree.

### Pitfall 10: Demo coverage gate
Every new real route or action needs its demo twin in the same plan, or `routes-coverage.test.ts` and `settings-actions.test.ts` fail.

## Code Examples

### Versions path builder + schema (`src/server/discogs/versions.ts`)
```ts
// GET passes isAllowed already (src/server/discogs/client.ts:121-122:
//   "if (method === 'GET') return true;"), so D-01's "allowlist" is this typed builder + a test.
export function masterVersionsPath(masterId: number): string {
  if (!Number.isSafeInteger(masterId) || masterId < 1) throw new Error('invalid master id');
  return `/masters/${masterId}/versions`;
}
export const VERSIONS_QUERY = (country: string) => ({
  country, format: 'CD', per_page: 100, page: 1, sort: 'released', sort_order: 'asc',
});
export const VersionSchema = z.object({
  id: z.number().int().positive(),
  title: cap(500).nullish(), label: cap(200).nullish(), country: z.string().nullish(),
  major_formats: z.array(z.string()).nullish(), format: cap(500).nullish(),
  catno: cap(200).nullish(), released: z.string().nullish(), status: z.string().nullish(),
  thumb: z.string().nullish(),
});
export const VersionsEnvelopeSchema = z.object({
  pagination: z.object({ items: z.number().int().nonnegative() }).loose(),
  versions: z.array(z.unknown()),
});
export const MAX_PLAUSIBLE_VERSIONS = 1000;
```
`discogsFetch` builds the query through `URLSearchParams` (`buildUrl`, client.ts:179-189), which encodes values like `UK & Europe` safely.

### Test fixture (`test/fixtures/discogs/master-versions-canada.json`)
Trim the probe answer (`/masters/13814/versions?country=Canada&format=CD&per_page=100`) to 4-5 entries covering: two 1991 DGC versions, a `"0"` year, a different label (Geffen Records 2011), plus a separate `master-versions-bogus.json` with `pagination.items: 8135288` and unrelated titles. Add `/masters/{id}/versions` to `test/fixtures/fake-discogs.mjs` for `scripts/verify-discogs.ts`.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Phase 4: "no auto preselect, the owner always picks" | Phase 6: the owner bulk-confirms "top match → preferred pressing" with one dialog | The confirm dialog is the explicit owner action, so PROJECT's "human confirms" still holds per batch |
| `middleware.ts` | `proxy.ts` (Next 16), Origin guard already covers the new POST | No change needed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Versions whose `format` contains "Unofficial Release" should rank after official ones (before the label/year tie-breaks) | Pattern 2 | A bootleg Canadian CD could be imported; low cost to confirm with the owner |
| A2 | `pagination.items > 1000` is a safe "unusable master" cap | Pitfall 2 | A huge legit master loses its Canadian pick (falls back visibly) |
| A3 | The title-containment guard will not drop legit Canadian versions | Pattern 2 | Legit versions with different titles fall back visibly (no wrong import) |
| A4 | A pending lookup counts as Matched in the status filter | Pattern 9 | Only filter placement; UI-SPEC already notes it |
| A5 | Exact (case-insensitive) country equality; `"USA & Canada"`-style combined countries do not count as Canada | Pitfall 1 | Some North American pressings fall back; `country=USA+%26+Canada` returned 0 for Nevermind, so the case is rare |
| A6 | Only page 1 (100 entries, earliest first) of versions is considered | Discogs section | A same-label version beyond 100 is missed; practically never for one country |
| A7 | Version thumbnails are present when authenticated (they were present unauthenticated) | Pattern 4 | Cards show the Disc3 placeholder |

## Open Questions (RESOLVED)

1. **"Prefer a CD format" when `format=CD` already filters.** (RESOLVED)
   - What we know: the filter still lets Box Set and Vinyl `major_formats` through.
   - Recommendation: treat the D-03 first key as `major_formats` includes `CD`. No owner input needed.
   - RESOLVED: adopted. The CD key is `majorFormats.includes('CD')`. It ranks after official (D-18) and exact country (D-19), then same label, then earliest year (06-01 `choosePressing`).
2. **Should a failed import spine be selectable?** (RESOLVED)
   - What we know: the UI-SPEC text and its copy table disagree.
   - Recommendation: not selectable (copy table wins); Retry import is the path.
   - RESOLVED by post-research decision D-20, which overrides the recommendation: a spine whose import failed is selectable. A failed import whose intent was written goes through `retryImport` (the Phase 4 D-07 reconcile), never a blind POST (06-01 `eligibilityOf`, 06-02 `mustRetryFirst` path, outcome `retried_earlier`).
3. **Where to show the lookup's own Discogs error reason** (fixed copy vs stored reason). (RESOLVED)
   - Recommendation: use the same failure-kind mapping as imports (`unavailable`, `auth`, `other` with a 160-code-point reason).
   - RESOLVED: adopted and extended with `rejected` and `interrupted` (`LOOKUP_ERROR_KINDS`, 06-01). Only kind `other` carries a stored reason, capped at 160 code points (06-04 `BulkItemDto.failure`). The card copy comes from `lookupFailureLine` (06-08).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime/tests | ✓ | v24.22.0 | — |
| pnpm | scripts | ✗ | — | `./node_modules/.bin/*` or `npx` |
| vitest, drizzle-kit, shadcn, biome, tsc | build/test | ✓ | 5.0.5 / 0.31.11 / 4.22.1 / 2.5.15 / 6.0.3 | — |
| Network to ui.shadcn.com | `shadcn add checkbox` | ✓ (api.discogs.com reachable) | — | Hand-copy the registry checkbox source |
| Live Discogs account | Owner UAT only | owner's | — | Tests use fixtures |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5, `pool: 'forks'`, node env, `server-only` stubbed |
| Config file | `vitest.config.ts` (includes `src/**/*.test.ts`) |
| Quick run command | `./node_modules/.bin/vitest run <file>` |
| Full suite command | `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/biome check` |

Helpers to reuse: `test/helpers/temp-data-dir.ts` (`useTempDataDir`), `test/helpers/scan-runs.ts`, the `useTempSecrets` + `seedCandidate` pattern in `src/server/imports/store.test.ts`, and the `deps.fetch` injection (`fetchImpl`, `gate`) used in `add-to-collection.test.ts` / `fetch-release.test.ts`. No live HTTP.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BULK-06 | pickVersion: CD > official > label > earliest year, `"0"` last, title + country guards | unit | `vitest run src/lib/pressing.test.ts` | ❌ Wave 0 |
| BULK-06 | parseVersions: envelope, per-entry drop, items cap → unusable | unit | `vitest run src/server/discogs/versions.test.ts` | ❌ Wave 0 |
| BULK-06/07/08 | resolve_pressing: preferred short-circuit makes 0 requests; no master → fallback; versions → pressing candidate + import; duplicate → skipped; 429 defers; 401 fails auth; 5xx rethrows; not current writes nothing | integration (temp DB, fake fetch) | `vitest run src/server/jobs/handlers/resolve-pressing.test.ts` | ❌ Wave 0 |
| BULK-06 | add job interleaves: claimNext order is lookup1, add1, lookup2 | integration | same file | ❌ Wave 0 |
| BULK-06 | still exactly one add_to_collection enqueue site | static scan | `vitest run src/server/imports/store.test.ts` | ✅ |
| BULK-04/05 | eligibilityOf reasons; start route: strict body, 415/400/409 not_connected/bulk_running, changed picks skipped, open-item unique index | unit + route | `vitest run src/lib/bulk-eligibility.test.ts src/app/api/spines/bulk-import/route.test.ts` | ❌ Wave 0 |
| BULK-10 | run summary counts/done/running; fallback filter + count | integration | `vitest run src/server/bulk/queries.test.ts` | ❌ Wave 0 |
| BULK-11 | lookup failed → review status failed; retrySpine re-queues lookup; markInterruptedLookups; IMPORTS_LEFT counts lookups | unit + integration | `vitest run src/lib/review-status.test.ts src/server/bulk/store.test.ts src/server/discogs/status.test.ts` | ✅ (extend) / ❌ |
| BULK-09 | preferred country: default Canada, canonical case, empty refused | unit | `vitest run src/server/settings.test.ts src/app/settings/actions.test.ts` | ✅ (extend) |
| BULK-01/02/03 | compact card, expand survives poll, layout toggle | component logic (existing `*.test.ts` style: pure helpers + radix-open) + manual visual backstops | `vitest run src/components/*.test.ts` | ❌ Wave 0 for new helpers |
| BULK-12 | demo bulk flow outcomes; routes coverage; settings drop-in; zero real requests | unit | `vitest run src/demo` | ✅ (extend) |
| — | migration applies on a copy of a Phase 5 DB | integration | `runMigrations()` in temp data dir test | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the touched file's `vitest run <file>` + `tsc --noEmit`
- **Per wave merge:** full suite
- **Phase gate:** full suite + `biome check` green, then owner UAT on port 3001 (bulk-import 3-5 real spines; check discogs.com; kill the server mid-run and confirm no duplicates)

### Wave 0 Gaps
- [ ] `test/fixtures/discogs/master-versions-canada.json`, `master-versions-bogus.json`
- [ ] `src/lib/pressing.test.ts`, `src/lib/bulk-eligibility.test.ts`
- [ ] `src/server/discogs/versions.test.ts`
- [ ] `src/server/jobs/handlers/resolve-pressing.test.ts`
- [ ] `src/server/bulk/store.test.ts`, `src/server/bulk/queries.test.ts`
- [ ] `src/app/api/spines/bulk-import/route.test.ts`
- [ ] `/masters/{id}/versions` in `test/fixtures/fake-discogs.mjs`

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (single local user; Discogs OAuth unchanged) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Loopback bind + `src/proxy.ts` Origin guard on non-GET; JSON-only bodies force CORS preflight |
| V5 Input Validation | yes | zod strict body, `items.max(2000)`, id length caps; Discogs responses parsed per entry with code-point caps (T-03-15 style); preferred country `trim().min(1).max(40)` |
| V6 Cryptography | no | — |
| V12 Files/Resources (SSRF) | yes | Version thumb URLs only fetched via `ensureThumb` + `isAllowedImageUrl` (i.discogs.com host only) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Browser injects a release id to add | Tampering | Body carries candidate ids only; release comes from the spine's candidate row / Discogs answer (T-04-02) |
| Forged cross-site bulk POST adds hundreds of releases | Tampering / Elevation | Proxy Origin check + JSON content-type + confirm dialog |
| Wrong release added from a bogus versions answer | Tampering (integrity) | Items cap + title + exact-country guards (Pitfall 2) |
| Request flood / huge body | DoS | `max(2000)` items, one run at a time, all work queued and paced |
| Discogs strings rendered as HTML | Tampering (XSS) | React text only, verbatim (UI-SPEC Typography) |
| Error text leaks paths/usernames | Info disclosure | Reuse `redactUserPath`-labelled errors, 160-code-point reasons |

## Sources

### Primary (HIGH confidence)
- Live probes of `https://api.discogs.com/masters/13814/versions` (filters, sort, per_page cap, case sensitivity), `/masters/999999999/versions` and `/masters/999999999`, 2026-10-23
- Codebase read this session: `src/server/discogs/client.ts`, `src/server/db/schema.ts`, `drizzle/0003_import_review.sql`, `src/server/imports/{store,queries,recovery,sql}.ts`, `src/server/jobs/handlers/{index,add-to-collection,fetch-release}.ts`, `src/server/jobs/{queue,types}.ts`, `src/server/discogs/{store,search,queries,status,folders,gate,thumbs}.ts`, `src/server/scan/queries.ts`, `src/server/settings.ts`, `src/lib/{import-types,discogs-types,review-status}.ts`, `src/app/api/spines/{route.ts,[id]/import/route.ts,retry-failed/route.ts}`, `src/demo/{routes.ts,store.ts,ops/imports.ts,routes-coverage.test.ts}`, `demo/fixtures/discogs.json`, `vitest.config.ts`, `package.json`
- `drizzle-kit generate --help` (0.31.11)

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` (master vs release, 372 Nevermind CD releases, official docs 403)

### Tertiary (LOW confidence)
- None used for recommendations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new packages; installed versions read from package.json)
- Discogs versions behaviour: HIGH for observed facts (live probe); MEDIUM for the generalizations A2, A3 and A6
- Architecture: HIGH (every integration point read; invariants traced to code and tests)
- Pitfalls: HIGH (two of them proven by probe)

**Research date:** 2026-10-23
**Valid until:** 2026-11-22 (Discogs API behaviour is stable but undocumented; re-probe if the lookup misbehaves)
