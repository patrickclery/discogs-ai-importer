# Phase 6: Bulk Canada auto-import with compact review cards - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 38 (new + modified)
**Analogs found:** 36 / 38

All analog paths below are git-tracked source (verified with `git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/server/db/schema.ts` (+bulk_runs, bulk_items, CANDIDATE_SOURCES 'pressing') | model | CRUD | existing `imports` table + `imports_spine_open_idx` in same file | exact |
| `drizzle/0004_bulk_import.sql` (+meta) | migration | batch | `drizzle/0003_import_review.sql` | exact |
| `src/lib/bulk-types.ts` | model (client-safe types) | transform | `src/lib/import-types.ts` | exact |
| `src/lib/bulk-eligibility.ts` (+test) | utility | transform | `src/lib/review-status.ts` | role-match |
| `src/lib/pressing.ts` (+test) | utility | transform | `src/lib/review-status.ts` (pure helper) | role-match |
| `src/server/discogs/versions.ts` (+test) | service | request-response | `src/server/discogs/search.ts` (`ReleaseSchema`, `cap()`, `toCandidateFromRelease`) | exact |
| `src/server/jobs/handlers/resolve-pressing.ts` (+test) | service (job) | event-driven | `src/server/jobs/handlers/fetch-release.ts` | exact |
| `src/server/jobs/handlers/index.ts` | config | event-driven | itself (lines 13-57) | exact |
| `src/server/bulk/store.ts` (+test) | service | CRUD | `src/server/imports/store.ts` | exact |
| `src/server/bulk/queries.ts` (+test) | service (read model) | CRUD | `src/server/imports/queries.ts`, `src/server/scan/queries.ts` | exact |
| `src/server/imports/store.ts` (createImport/enqueueImport `runAfter`, retrySpine) | service | CRUD | itself (lines 199-334, 493-553) | exact |
| `src/server/imports/recovery.ts` or bulk/store `markInterruptedLookups` | service | batch | `markInterruptedImports` (recovery.ts:20-32) | exact |
| `src/server/discogs/queries.ts` (exclude `source='pressing'`) | service | CRUD | itself (lines 73-87) | exact |
| `src/server/discogs/status.ts` (IMPORTS_LEFT_SQL) | service | CRUD | itself (lines 38-41) | exact |
| `src/server/scan/queries.ts` (discogsActive, fallback filter, `bulk` on SpineDto) | service | CRUD | itself (lines 350-376) | exact |
| `src/lib/review-status.ts` (lookup input) | utility | transform | itself (34-56) | exact |
| `src/server/settings.ts` (preferred country get/set) | service | CRUD | `getVisionModel`/`setVisionModel` (62-75) | exact |
| `src/app/api/spines/bulk-import/route.ts` (+test) | route | request-response | `src/app/api/spines/[id]/import/route.ts` | exact |
| `src/app/api/spines/route.ts` (`?fallback=1`) | route | request-response | itself (`parseReviewParam`) | exact |
| `src/app/settings/actions.ts` (`savePreferredCountry`) | controller (server action) | request-response | `saveCollectionFolder` (142-163) | exact |
| `src/demo/settings-actions.ts` | controller (demo) | request-response | `saveCollectionFolder` (122-137) | exact |
| `src/demo/routes/bulk.ts` | route (demo) | request-response | `src/demo/routes/imports.ts` | exact |
| `src/demo/ops/bulk.ts` (+test) | service (demo) | event-driven (timestamp-derived) | `src/demo/ops/imports.ts` (`scheduleImport` ~115) | exact |
| `src/demo/routes.ts` | config | — | itself (lines 49-55 ROUTES) | exact |
| `src/demo/read-model.ts` | service (demo) | transform | itself | exact |
| `demo/fixtures/pressings.json` | fixture | — | `demo/fixtures/discogs.json` | role-match |
| `test/fixtures/discogs/master-versions-{canada,bogus}.json`, `test/fixtures/fake-discogs.mjs` | test fixture | — | existing files in `test/fixtures/discogs/` | exact |
| `src/components/ui/checkbox.tsx` | component | — | `shadcn add checkbox` (registry) | n/a |
| `src/components/compact-spine-card.tsx` | component | request-response | `src/components/spine-card.tsx` | role-match |
| `src/components/top-match-row.tsx` | component | — | `src/components/candidate-row.tsx` | role-match |
| `src/components/spine-select-checkbox.tsx` | component | — | disabled-button tooltip in `add-to-collection-button.tsx` | role-match |
| `src/components/bulk-import-bar.tsx` | component | request-response | `src/components/retry-all-failed-button.tsx` | role-match |
| `src/components/bulk-import-dialog.tsx` | component | request-response | `src/components/duplicate-import-dialog.tsx` | exact |
| `src/components/country-badge.tsx` | component | — | `src/components/import-state-badge.tsx` | exact |
| `src/components/card-layout-toggle.tsx`, `fallback-filter-toggle.tsx` | component + hook | URL state | `useReviewFilter` in `spines-filter-bar.tsx:35-41`, `review-status-filter.tsx` | exact |
| `src/components/preferred-country-field.tsx` | component (form) | request-response | `src/components/collection-folder-field.tsx` | exact |
| Modified: `spine-card.tsx`, `photo-section.tsx`, `import-state-badge.tsx`, `confirmed-match.tsx`, `discogs-matches.tsx`, `spines-filter-bar.tsx`, `spines-view.tsx`, `status-indicator.tsx`, `discogs-card.tsx`, `src/app/spines/loading.tsx`, `page.demo.tsx` twins | component | — | themselves | exact |
| `useSelection` hook | hook | client state | none | no analog |

## Pattern Assignments

### `src/server/jobs/handlers/resolve-pressing.ts` (job, event-driven)

**Analog:** `src/server/jobs/handlers/fetch-release.ts`

Imports (lines 1-14):
```ts
import 'server-only';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { getDiscogsAuth, isAuthInvalid } from '../../discogs/auth';
import { type DiscogsFetchDeps, discogsFetch } from '../../discogs/client';
import { discogsGate } from '../../discogs/gate';
import { type JobContext, JobDeferredError } from '../types';
```
Payload/deps/guards (lines 29-57): zod payload (`{ itemId }`), `Deps = { fetch?: DiscogsFetchDeps }`, `REASON_MAX = 160`, `NotCurrentError`, `message()`, `errName()` helpers. Entry shape (59-68):
```ts
export async function runFetchRelease(payload: unknown, ctx: JobContext, deps = {}) {
  const { searchId } = FetchReleasePayload.parse(payload);
  const db = getDb().$client;
  const search = getSearch(db, searchId);
  if (!search) throw new Error(`fetch_release: search ${searchId} not found`);
  if (search.status !== 'queued') return;
```
Copy the rest of the file for: paused gate / 429 -> `JobDeferredError`; `ctx.isCurrent()` before the request; switch on `err.name` (401 -> auth, 5xx/network -> record + rethrow, other 4xx -> rejected). Then call `createImport(db, { spineId, candidateId, runAfter: ctx.job.runAfter })` and map result (RESEARCH Pattern 4). Never `allowDuplicate`.

Test analog: `src/server/jobs/handlers/fetch-release.test.ts` (fake `deps.fetch` with `fetchImpl`, `gate`; `useTempDataDir`).

### `src/server/jobs/handlers/index.ts` (register)
Add next to `fetch_release` (lines 26-29):
```ts
resolve_pressing: { run: (payload, ctx) => runResolvePressing(payload, ctx), timeoutMs: 60_000 },
```
and append `() => markInterruptedLookups()` to `maintenance` (lines 49-57).

### `markInterruptedLookups` (batch UPDATE)
**Analog:** `src/server/imports/recovery.ts:20-32`
```ts
UPDATE imports SET status = 'failed',
  error_kind = COALESCE(error_kind, 'interrupted'), error = COALESCE(error, @reason), updated_at = @now
WHERE status IN ('pending','importing')
  AND job_id IN (SELECT id FROM jobs WHERE status IN ('failed','cancelled'))
```
Swap to `bulk_items` / `status = 'queued'`.

### `src/server/bulk/store.ts` (`startBulkRun`, `retryBulkItem`)
**Analog:** `enqueueImport`, `src/server/imports/store.ts:293-326`
```ts
const tx = db.transaction(() => {
  const holder = db.prepare('SELECT id, status FROM jobs WHERE dedupe_key = @dedupeKey').get({ dedupeKey });
  if (holder && (holder.status === 'queued' || holder.status === 'running')) job = { id: holder.id, created: false };
  else { if (holder) releaseDedupeKey(holder.id);
    job = enqueue({ lane: 'discogs', type: ADD_TO_COLLECTION_JOB_TYPE, payload: { importId }, dedupeKey }); }
  db.prepare('UPDATE imports SET job_id = @jobId, updated_at = @now WHERE id = @importId').run(...);
  return job;
});
return tx.immediate();
```
Use `type: 'resolve_pressing'`, `dedupeKey: pressing:${itemId}`, `runAfter: start + i`. For `createImport`/`enqueueImport`, add optional `runAfter` passed through to the single `enqueue` call (keep the one-enqueue-site guard in `store.test.ts:1027-1057` green). Retry: hook into `retrySpine` (store.ts:493-553) before the search fallback.

### Pressing candidate upsert
**Analog:** `addManualCandidate`, `src/server/discogs/store.ts:334-347`: `INSERT INTO discogs_candidates (...) VALUES (..., 'manual', ...) ON CONFLICT(spine_id, source, release_id) DO UPDATE SET ...`. Copy with source `'pressing'`, `search_id` = top candidate's `search_id`. Then add `AND c.source <> 'pressing'` to `CANDIDATES_SQL`/`SPINE_CANDIDATES_SQL` (`src/server/discogs/queries.ts:73-87`).

### `src/server/discogs/versions.ts`
**Analog:** `src/server/discogs/search.ts` (`ReleaseSchema`, `cap()`, per-entry safeParse, `toCandidateFromRelease`). Use the code example in RESEARCH "Versions path builder + schema" verbatim; `discogsFetch` query goes through `buildUrl` (client.ts:179-189). GET already allowed (client.ts:121-122).

### `src/app/api/spines/bulk-import/route.ts` (route, request-response)
**Analog:** `src/app/api/spines/[id]/import/route.ts`
- `fail()` helper + `readBody` (lines 25-59): JSON-only 415, invalid JSON 400, `z.prettifyError` 400. Copy as-is.
- `POST` preamble (61-84):
```ts
await connection();
const parsed = await readBody(req, Body);
if (!parsed.ok) return parsed.response;
if (!discogsReady()) {
  let signedIn = false;
  try { signedIn = getDiscogsAuth() !== null; } catch { signedIn = false; }
  return fail(409, 'not_connected', signedIn ? 'Reconnect Discogs in Settings first' : 'Connect Discogs in Settings first');
}
```
Then `409 bulk_running`, then `startBulkRun` → `201 { runId, started, skipped }`. Body: `z.strictObject({ items: z.array(z.strictObject({ spineId: z.string().min(1).max(40), candidateId: z.string().min(1).max(40) })).max(2000) })`.
Test analog: the existing route test next to `[id]/import/route.ts`.

### `src/app/settings/actions.ts` → `savePreferredCountry`
**Analog:** `saveCollectionFolder` (lines 142-163):
```ts
const parsed = FolderIdInput.safeParse(id);
if (!parsed.success) return { ok: false, formError: '...' };
try { setCollectionFolderId(parsed.data); }
catch (err) { const reason = (err instanceof Error ? err.message : String(err)).replace(/\.\s*$/, '').slice(0, 160);
  return { ok: false, formError: reason }; }
revalidatePath('/settings');
return { ok: true, name: ... };
```
Storage via `getSetting`/`setSetting` (`src/server/settings.ts:32-60`), modeled on `getVisionModel`/`setVisionModel` (62-75); canonicalize case (Pitfall 1). Demo twin: `src/demo/settings-actions.ts:122-137`; `settings-actions.test.ts:53` enforces drop-in.

### `src/demo/routes/bulk.ts` + `src/demo/ops/bulk.ts`
**Analog:** `src/demo/routes/imports.ts` (lines 1-40):
```ts
import { z } from 'zod';
import { discogsReady, findSpine, notConnectedMessage } from '../ops/review';
import type { DemoResponse, DemoRoute } from '../routes';
import { emit, getState, now } from '../store';
import { fail, readBody, reply } from './http';
function notConnected(): DemoResponse | null {
  const { account } = getState();
  if (discogsReady(account)) return null;
  return fail(409, 'not_connected', notConnectedMessage(account));
}
```
Export `routes: DemoRoute[]` and spread into `ROUTES` in `src/demo/routes.ts:49-55`. Ops: timestamp-derived like `scheduleImport` in `src/demo/ops/imports.ts`. Gate: `src/demo/routes-coverage.test.ts`.

### nuqs hooks (`useCardLayout`, `useFallbackFilter`)
**Analog:** `src/components/spines-filter-bar.tsx:35-45`
```ts
export function useReviewFilter() {
  const [raw, setRaw] = useQueryState('review');
  const review = raw === '1';
  const setReview = (on: boolean) => setRaw(on ? '1' : null);
  return [review, setReview] as const;
}
```
`view` uses `{ scroll: false }`; `fallback` uses `{ scroll: true }` like `usePhotoFilter`.

### `CompactSpineCard` / `SpineCard` `leading` slot
**Analog:** `src/components/spine-card.tsx:56-105`. Props pattern `badges?/statusSlot?/footer?: ReactNode`; header row:
```tsx
<Card data-spine-card={spine.id} className={cn('gap-4 rounded-xl p-4', orphaned && 'border-warning/60')}>
  <div className="flex items-center gap-2 text-xs">
    <span className="font-mono text-muted-foreground tabular-nums">#{number}</span>
    <WorstFieldBadge spine={spine} threshold={threshold} />
    {badges}
    {status ? <div className="ml-auto flex items-center gap-2">{status}</div> : null}
  </div>
  <SpineCrop crop={spine.crop} number={number} rawText={rawText} />
```
Add `leading?: ReactNode` rendered before `#n`. Compact card reuses header bits + `SpineCrop` with `p-4 gap-2`, `flex-wrap gap-y-1`. Orphan badge pattern (lines 83-88) is the template for `CountryBadge` (`Badge variant="outline"` + `TriangleAlert className="text-warning"`).

### Other components
- `BulkImportDialog`: copy AlertDialog structure, pending state and inline error from `src/components/duplicate-import-dialog.tsx`.
- `PreferredCountryField`: copy save-on-blur, spinner, FieldError and toast from `src/components/collection-folder-field.tsx` (export at line 72); place after it in `discogs-card.tsx`.
- `BulkImportBar` mutation: copy `useMutation` + invalidate `['spines']` + `app:status-refresh` dispatch from `src/components/retry-all-failed-button.tsx`.
- `ImportStateBadge` `resolving` phase: extend the switch in `src/components/import-state-badge.tsx:20+`.
- `TopMatchRow`: thumb + title/details from `src/components/candidate-row.tsx` (shrink to `size-12`).

## Shared Patterns

- **Errors to owner:** 160-char reasons, trailing period stripped (`actions.ts:155-158`, `fetch-release.ts` `REASON_MAX`). Apply to lookup failures, route errors, settings.
- **Not-connected 409 copy:** `[id]/import/route.ts:69-84`, demo `notConnected()` in `src/demo/routes/imports.ts`. Apply to the real and demo bulk routes.
- **Durable jobs:** `enqueue({ lane: 'discogs', type, payload, dedupeKey, runAfter })` inside `db.transaction(...).immediate()`, release finished dedupe keys with `releaseDedupeKey`. Apply to start, retry, and createImport runAfter.
- **Server-only guard:** first line `import 'server-only';` in every `src/server/**` module; `src/lib/**` stays client-safe.
- **Query invalidation:** never write into `['spines', …]`; invalidate + `window.dispatchEvent(new Event('app:status-refresh'))`.
- **Demo twin rule:** every new real route/action gets a demo twin in the same plan (`routes-coverage.test.ts`, `settings-actions.test.ts`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `useSelection` hook (selection pruned to shown + eligible) | hook | client state | No multi-select exists yet; follow UI-SPEC Selection section |
| `src/components/ui/checkbox.tsx` | component | — | Comes from `shadcn add checkbox`; swap any `font-semibold` for `font-medium` |

## Metadata

**Analog search scope:** `src/server/{jobs,imports,discogs,scan}`, `src/app/api/spines`, `src/app/settings`, `src/components`, `src/demo`
**Files scanned:** ~25
**Pattern extraction date:** 2026-10-24
