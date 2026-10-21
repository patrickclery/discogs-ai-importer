# Phase 3: Discogs Match - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 38 (new + modified)
**Analogs found:** 34 / 38

All analog paths below are git-tracked (`git ls-files`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/server/discogs/oauth.ts` | utility | transform | (none; RESEARCH Code Examples) | none |
| `src/server/discogs/gate.ts` | utility (singleton) | event-driven | `src/server/jobs/worker.ts` (globalThis `g`, L74) | partial |
| `src/server/discogs/client.ts` | service | request-response | `src/server/claude/cli.ts` (external call + error classification) | role-match |
| `src/server/discogs/auth.ts` | service | file-I/O | `src/server/secrets.ts` | exact |
| `src/server/discogs/search.ts` / `inputs.ts` | service (pure) | transform | `src/server/scan/match.ts` | role-match |
| `src/server/discogs/store.ts` | store | CRUD | `src/server/scan/store.ts` | exact |
| `src/server/discogs/enqueue.ts` | service | batch | `src/server/jobs/queue.ts` `enqueue()` + `src/server/scan/reconcile.ts` | role-match |
| `src/server/discogs/thumbs.ts` | service | file-I/O | `writeAtomic` in `src/server/jobs/handlers/scan-photo.ts` L91-110 | role-match |
| `src/server/jobs/handlers/search-spine.ts`, `fetch-release.ts` | job handler | event-driven | `src/server/jobs/handlers/scan-photo.ts` | exact |
| `src/server/jobs/handlers/index.ts` (mod) | config | — | itself | exact |
| `src/server/jobs/queue.ts` (mod: `deferJob`) | store | CRUD | `failOrRetry` L180-222 | exact |
| `src/server/jobs/worker.ts` (mod: deferred branch, lane gate) | worker | event-driven | `processNext` L146-242, `runLane` L244-261 | exact |
| `src/server/db/schema.ts` (mod) + `drizzle/0002_discogs_match.sql` | model/migration | CRUD | `schema.ts` `jobs` table L14-37, `drizzle/0001_shelf_scan.sql` | exact |
| `src/server/storage/paths.ts` (mod: `discogs-thumbs`) | config | — | `SUBDIRS` L6-12 | exact |
| `src/server/scan/store.ts` (mod: enqueue inside `persistRunResult`) | store | CRUD | itself L132-241 | exact |
| `src/server/scan/queries.ts` (mod: discogs summary on SpineDto) | store | CRUD | itself L259 | exact |
| `src/lib/discogs-ref.ts`, `src/lib/discogs-types.ts` | utility (client-safe) | transform | `src/lib/spine-review.ts`, `src/lib/scan-types.ts` | role-match |
| `src/app/api/discogs/connect/route.ts`, `disconnect`, `test` | route | request-response | `src/app/api/spines/[id]/reattach/route.ts` (POST) | exact |
| `src/app/api/discogs/callback/route.ts` | route | request-response (GET redirect) | reattach GET | role-match |
| `src/app/api/discogs/thumb/[id]/route.ts` | route | streaming | `src/app/api/files/[...path]/route.ts` | exact |
| `src/app/api/discogs/searches/[id]/route.ts` | route | request-response | reattach GET | exact |
| `src/app/api/spines/[id]/search/route.ts`, `candidates/route.ts` | route | request-response | reattach GET+POST | exact |
| `src/app/api/files/[...path]/route.ts` (mod) | route | streaming | itself `ROOTS` L11 | exact |
| `src/app/api/status/route.ts` (mod) + `src/lib/status-types.ts` | route | request-response | itself | exact |
| `src/components/discogs-card.tsx` | component | request-response | `src/components/claude-cli-card.tsx` | exact |
| `test-discogs-button.tsx`, `connect-discogs-button.tsx` | component | request-response | `src/components/test-claude-button.tsx` | exact |
| `disconnect-discogs-button.tsx` | component | request-response | `src/components/dismiss-spine-button.tsx` (AlertDialog) | exact |
| `discogs-search-dialog.tsx` | component | polling | `src/components/reattach-dialog.tsx` | exact |
| `discogs-matches.tsx`, `candidate-list/row/thumb`, `search-state-badge.tsx` | component | polling | `reattach-dialog.tsx` `CandidateCrop`, `photo-status-badge.tsx` | role-match |
| `spine-card.tsx`, `spines-view.tsx`, `status-indicator.tsx` (mod) | component | polling | themselves | exact |
| `src/components/ui/collapsible.tsx` | ui | — | shadcn add | n/a |
| `test/fixtures/fake-discogs.mjs` | test fixture | request-response | `test/fixtures/fake-claude.mjs` | role-match |
| `scripts/verify-discogs.ts` | test script | batch | `scripts/verify-scan.ts` | exact |
| `*.test.ts` for new server modules | test | — | `src/server/jobs/handlers/scan-photo.test.ts`, `queue.test.ts` | exact |

## Pattern Assignments

### Routes: `src/app/api/discogs/*`, `src/app/api/spines/[id]/{search,candidates}/route.ts`
**Analog:** `src/app/api/spines/[id]/reattach/route.ts`

Header + strict body schema + not-found shape (L1-18):
```ts
import { connection } from 'next/server';
import { z } from 'zod';
const Body = z.strictObject({ targetSpineId: z.string().min(1) });
const NOT_FOUND = { error: 'not_found', message: 'This spine no longer exists.' };
```
GET with async params (L20-31):
```ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  ...
  return Response.json(body);
}
```
POST JSON-only guard (L33-60) — copy verbatim into every mutating route (connect, disconnect, test, search, candidates, paste-code):
```ts
const contentType = req.headers.get('content-type') ?? '';
if (!/^application\/json\s*(;|$)/i.test(contentType)) {
  return Response.json({ error: 'unsupported_type', message: 'Send application/json.' }, { status: 415 });
}
let raw: unknown;
try { raw = await req.json(); } catch {
  return Response.json({ error: 'invalid_body', message: 'The request body is not JSON.' }, { status: 400 });
}
const parsed = Body.safeParse(raw);
if (!parsed.success) {
  return Response.json({ error: 'invalid_body', message: z.prettifyError(parsed.error) }, { status: 400 });
}
```
Callback route: GET (proxy allows top-level GET), always `Response.redirect`/303 to fixed `/settings?discogs=…`. Build callback URL from `req.headers.get('host')` (proxy.ts L10/L39 already restricts host). Mutating routes: never enqueue duplicate work inline; enqueue via `enqueue()`.

### `src/app/api/discogs/thumb/[id]/route.ts` + `src/app/api/files/[...path]/route.ts` (mod)
**Analog:** `src/app/api/files/[...path]/route.ts` (76 lines)
- Add `'discogs-thumbs'` to `ROOTS` (L11): `const ROOTS = new Set(['crops', 'thumbs', 'vision']);`
- Reuse `notFound()` (L17-22, `X-Content-Type-Options: nosniff`) and `resolveData` import; stream with `Readable` as the files route does.
- Thumb URL comes from DB by candidate id only; host allowlist `i.discogs.com`.

### `src/server/discogs/thumbs.ts`
**Analog:** `writeAtomic` in `src/server/jobs/handlers/scan-photo.ts` L91-110:
```ts
const abs = resolveData(rel);
const tmpDir = resolveData(tmpDirRel);
await fs.mkdir(path.dirname(abs), { recursive: true });
await fs.mkdir(tmpDir, { recursive: true });
const tmp = path.join(tmpDir, `.${newId()}.tmp`);
try { await fs.writeFile(tmp, bytes, { flag: 'wx' }); await fs.rename(tmp, abs); }
catch (err) { await fs.rm(tmp, { force: true }); throw err; }
```
Extract it to a shared helper (or duplicate) — plan should decide. Sharp re-encode as in `src/server/images/resize.ts`. Add `'discogs-thumbs'` to `SUBDIRS` in `src/server/storage/paths.ts` L6-12.

### `src/server/discogs/auth.ts`
**Analog:** `src/server/secrets.ts`
- Reuse private `readFileMap` (L70-92) / `writeFileMap` (L94-119, temp+rename, mode 0600) — export them or put the OAuth get/save/clear functions inside secrets.ts.
- Sync read-modify-write pattern from `saveSecrets` (L156-171) / `clearSecret` (L173-180).
- Do NOT add token keys to `SECRET_KEYS` (L14-17): `listSecretStatus` (L135) maps all of them into the editable form.
- Pending-token Map on `globalThis` (see gate below).

### `src/server/discogs/gate.ts`
**Analog:** `src/server/jobs/worker.ts` L74 HMR-safe singleton:
```ts
const g = globalThis as unknown as { __appWorker?: ... };
```
Use `__discogsGate` / `__discogsPending` keys the same way.

### `src/server/jobs/handlers/search-spine.ts`, `fetch-release.ts`
**Analog:** `src/server/jobs/handlers/scan-photo.ts`
- `import 'server-only';`, relative `../../` imports, zod payload schema (L51-60):
```ts
export const ScanPhotoPayload = z.object({ photoId: z.string().min(1), runId: z.string().min(1), ... });
export type ScanPhotoPayload = z.infer<typeof ScanPhotoPayload>;
```
- `if (!ctx.isCurrent()) return;` before each external call (L408; WR-04 in `types.ts` L19-24).
- Pass `ctx.signal` into fetch via `AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)])`.

### `src/server/jobs/handlers/index.ts` (mod)
Current (21 lines):
```ts
export const handlers: Record<string, JobHandler> = {
  noop: { run: runNoop, timeoutMs: 120000 },
  scan_photo: { run: (payload, ctx) => runScanPhoto(payload, ctx), timeoutMs: 720_000 },
};
export const maintenance: Array<() => unknown> = [() => reconcileVisionRuns()];
```
Add `search_spine` (90_000), `fetch_release` (60_000), push `enqueueMissingSearches` into `maintenance`, export `laneGates`.

### `src/server/jobs/queue.ts` (mod: `deferJob`)
**Analog:** `failOrRetry` L180-222 — attempt-fenced IMMEDIATE transaction:
```ts
const run = db.transaction((): ... => {
  const row = db.prepare(`SELECT attempts, max_attempts FROM jobs WHERE id = ? AND status = 'running'`).get(id);
  if (!row || (attempt !== undefined && row.attempts !== attempt)) return 'stale';
  db.prepare(`UPDATE jobs SET ... WHERE id = @id`).run({ ... });
});
return run.immediate();
```
Single-quoted SQL literals (DQS=0, L49 comment), named `@params`. `enqueue()` (L52-91) returns `{id, created}`; `ON CONFLICT(dedupe_key) DO NOTHING` — explicit actions must use `search:<searchId>` keys.

### `src/server/jobs/worker.ts` (mod)
In `processNext` catch (L204-238), mirror the by-name check:
```ts
// Compare by name: HMR can leave two copies of the class alive.
const stopped = reason?.name === 'WorkerStoppedError';
...
await writeStatus(() => failOrRetry(job.id, err, opts.now, job.attempts));
```
Add `if ((err as Error)?.name === 'JobDeferredError') { await writeStatus(() => deferJob(...job.attempts)); return 'deferred'; }` before `failOrRetry`; extend return type. Error class shape: `WorkerStoppedError` L81-85 (`this.name = '...'`). In `runLane` (L244-261) check `laneGates[lane]?.()` before `processNext`, `sleep(min(wait,1000))`.

### `src/server/db/schema.ts` (mod) + migration
**Analog:** `jobs` table L14-37 (`sqliteTable`, `text(..., { enum })`, epoch-ms `integer` timestamps, `index(...)` in third arg). Generate `drizzle/0002_*.sql` with `pnpm db:generate`; never hand-write.

### `src/server/discogs/store.ts` + `src/server/scan/store.ts` (mod)
**Analog:** `persistRunResult` in `src/server/scan/store.ts` L125-241 — one `db.transaction(...)` returned via `tx.immediate()`. Enqueue auto searches inside that transaction before `status='done'`. Named params (merge.ts L13 note).

### `src/app/api/status/route.ts` (mod)
Current full file:
```ts
export async function GET() {
  await connection();
  const body: StatusResponse = { worker: getWorkerInfo(), jobs: countsByLaneStatus(), lease: readLease() };
  return Response.json(body);
}
```
Add `discogs: { connected, backlog, pausedUntil, failedSpines }` and extend `StatusResponse` in `src/lib/status-types.ts` L10-20.

### `src/components/test-discogs-button.tsx`, `connect-discogs-button.tsx`
**Analog:** `src/components/test-claude-button.tsx` (100 lines) — copy whole structure:
- `useTransition` + `useState<TestResult|null>`; reason truncation `.slice(0,160).replace(/[.\s]+$/, '')` (L30-33).
- Pending: `{pending ? <Spinner /> : <PlugZap aria-hidden="true" />}{pending ? 'Testing…' : 'Test Claude'}` (L46-53).
- Disabled-with-tooltip wrapper (L59-71): `<Tooltip><TooltipTrigger asChild><span tabIndex={0} className="inline-flex">{button}</span>` with the biome-ignore comment.
- Result region `role="status" aria-live="polite"` with `CircleCheck text-success` / `CircleX text-destructive` (L72-95).
Difference: call `fetch('/api/discogs/test', { method:'POST', headers:{'content-type':'application/json'}, body:'{}' })` instead of a server action.

### `src/components/discogs-card.tsx`
**Analog:** `src/components/claude-cli-card.tsx` (Card/CardHeader/CardTitle/badge layout), wrapping existing `DiscogsCredentials` + `secret-field.tsx`. Settings page `src/app/settings/page.tsx` swaps the card in place. Clear action in `src/app/settings/actions.ts` (uses `clearSecret`, `revalidatePath`) must also clear OAuth tokens.

### `src/components/discogs-search-dialog.tsx`
**Analog:** `src/components/reattach-dialog.tsx` (245 lines)
- Imports (L1-23): `useQuery, useQueryClient`, `toast` from sonner, `Dialog*`, `RadioGroup, RadioGroupItem`, `Skeleton`, `Spinner`, `failureReason, UNREACHABLE_REASON` from `@/lib/failure-reason`.
- Fetch helper pattern (L33-46):
```ts
class FetchError extends Error {}
async function fetchCandidates(spineId: string) {
  let res: Response;
  try { res = await fetch(`/api/spines/${encodeURIComponent(spineId)}/reattach`, { cache: 'no-store' }); }
  catch { throw new FetchError(UNREACHABLE_REASON); }
  if (!res.ok) throw new FetchError(await failureReason(res));
  return ...;
}
```
- Own query-key prefix (comment L27-28): use `['discogs-search', searchId]`, `refetchInterval: 1500` until terminal.
- Crop reference `CandidateCrop` (L52-72): `<img ... loading="lazy" decoding="async">` with biome-ignore `noImgElement`, and the `bg-muted` placeholder fallback — reuse for `CandidateThumb` (64px, `Disc3` icon).

### `src/components/disconnect-discogs-button.tsx`
**Analog:** `src/components/dismiss-spine-button.tsx` (AlertDialog with destructive confirm, inline error, pending copy).

### `src/components/spine-card.tsx` (mod)
L87-88: `const shownFooter = footer ?? (orphaned ? <OrphanFooter spine={spine} /> : null);` — export `OrphanFooter`, keep fallback; `SpineView` composes `<div className="flex flex-col gap-4">{orphaned && <OrphanFooter/>}<DiscogsMatches/></div>`. Status slot (L71-84) renders `{statusSlot}` last — `SearchStateBadge` goes there.

### `src/components/spines-view.tsx` / `status-indicator.tsx` (mod)
- `spines-view.tsx` L160-161 `refetchInterval: photosRefetchInterval(…)` — add 3000 ms while `discogsActive`; pure helper lives in `src/lib/photo-polling` (tested in `src/lib/photo-polling.test.ts`).
- `status-indicator.tsx` L257-260 failed sum — restrict to `anthropic`, add Discogs segment.

### `test/fixtures/fake-discogs.mjs` + `scripts/verify-discogs.ts`
**Analog:** `test/fixtures/fake-claude.mjs` header convention (L1-19: mode via env var, log presence-only of secrets, never contacts network). Fake-discogs is a `node:http` server with modes (ok, 429, 401, 5xx, empty); base URL via env override (e.g. `DISCOGS_API_BASE`, `DISCOGS_IMAGE_BASE`). Verify script copies `scripts/verify-scan.ts` + `scripts/lib/server.ts` / `scripts/lib/jobs.ts` helpers.

### Unit tests
**Analog:** `src/server/jobs/handlers/scan-photo.test.ts` L1-30: vitest, `useTempDataDir` from `test/helpers/temp-data-dir`, `getDb`, a hand-built `JobContext`. Queue/worker additions: extend `src/server/jobs/queue.test.ts` / `worker.test.ts`. Route tests: `src/app/api/spines/[id]/reattach/route.test.ts`.

## Shared Patterns

### Mutation guard (all POST routes)
Source: reattach route L33-60 (above) + `src/proxy.ts` Origin/sec-fetch-site guard. Apply to connect, disconnect, test, paste-code, search, candidates.

### Server-only modules
Every `src/server/**` file starts with `import 'server-only';` (tests stub via `test/stubs/server-only.ts`).

### Error copy
Client: `failureReason(res)` / `UNREACHABLE_REASON` from `src/lib/failure-reason.ts`; reasons truncated to 160 chars; errors inline, toasts only on success.

### SQL
Raw better-sqlite3 via `getDb().$client`; single-quoted literals, `@named` params, `transaction(...).immediate()` for writes.

### HMR singletons
`globalThis as unknown as {...}` (worker.ts L74) for gate, pending-token map, thumb in-flight map.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `src/server/discogs/oauth.ts` | utility | No OAuth code exists; use RESEARCH "PLAINTEXT OAuth header" |
| `src/server/discogs/gate.ts` (algorithm) | utility | No rate-limit pacing exists; only the singleton shape is copied |
| `src/lib/discogs-ref.ts` | utility | Use RESEARCH Pattern 7 |
| `src/components/ui/collapsible.tsx` | ui | `./node_modules/.bin/shadcn add collapsible`, then `font-semibold`→`font-medium` |

## Metadata

**Analog search scope:** `src/`, `scripts/`, `test/`, `drizzle/`
**Files scanned:** ~20 read, full tracked tree listed
**Pattern extraction date:** 2026-10-20
