# Phase 2: Shelf Scan - Pattern Map

**Mapped:** 2026-10-19
**Files analyzed:** 46 (new + modified)
**Analogs found:** 38 / 46

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/server/db/schema.ts` (+photos, vision_runs, spine_detections, spines, spine_fields) | model | CRUD | itself (`jobs` table, L4-27) | exact |
| `drizzle/0001_*.sql` + meta | migration | batch | `drizzle/0000_init.sql` (drizzle-kit generate) | exact |
| `src/server/jobs/queue.ts` (add `maxAttempts` to `enqueue`) | service | CRUD | itself L50-81 | exact |
| `src/server/jobs/handlers/index.ts` (register `scan_photo`) | config | — | itself | exact |
| `src/server/jobs/handlers/scan-photo.ts` | service (job handler) | event-driven / file-I/O | `src/server/jobs/handlers/noop.ts` | exact |
| `src/server/claude/cli.ts` (extend `buildClaudeArgs`: jsonSchema, effort, maxTurns) | utility | request-response | itself L267-310, `testClaude` L383+ | exact |
| `src/server/vision/run.ts` | service | request-response (subprocess) | `testClaude()` in `src/server/claude/cli.ts` L383-440 + private `run()` L154-162 | exact |
| `src/server/vision/schema.ts` | model (Zod) | transform | `ResultSchema` in cli.ts L330; `NoopPayload` in noop.ts L8-12 | role-match |
| `src/server/vision/prompt.ts` | utility | transform | `TEST_PROMPT` const in cli.ts L262 | partial |
| `src/server/vision/parse.ts` | utility | transform | `testClaude` classification chain (cli.ts L397-430) | role-match |
| `src/server/vision/density.ts` | utility (pure) | transform | none | no analog |
| `src/server/images/{detect,normalize,resize,crop}.ts` | utility | file-I/O / transform | none (sharp new); file writes follow noop.ts L61-65 | partial |
| `src/server/scan/{ingest,merge,match,levenshtein}.ts` | service / pure utility | CRUD / transform | `src/server/jobs/queue.ts` (raw `sql().prepare` + transactions) | role-match |
| `src/server/settings.ts` (+confidence_threshold, density N/W, effort) | config/service | CRUD | itself `getVisionModel`/`setVisionModel` L56-65 | exact |
| `src/server/storage/paths.ts` (maybe helpers) | utility | file-I/O | itself `resolveData` L44-52 | exact |
| `next.config.ts` (`experimental.proxyClientMaxBodySize: '64mb'`) | config | — | itself | exact |
| `src/app/api/photos/route.ts` (POST upload, GET list) | route | request-response / file-I/O | `src/app/api/dev/jobs/route.ts` | exact |
| `src/app/api/photos/[id]/rescan/route.ts` | route | request-response | `src/app/api/dev/jobs/route.ts` POST | exact |
| `src/app/api/spines/route.ts` (GET) | route | request-response | `src/app/api/dev/jobs/route.ts` GET; `src/app/api/status/route.ts` | exact |
| `src/app/api/spines/[id]/fields/route.ts` (PATCH) | route | CRUD | `src/app/api/dev/jobs/route.ts` POST (content-type + Zod) | exact |
| `src/app/api/spines/[id]/{reattach,dismiss}/route.ts` | route | CRUD | same | exact |
| `src/app/api/files/[...path]/route.ts` | route | streaming / file-I/O | `resolveData` in paths.ts; no streaming route exists | partial |
| `src/app/providers.tsx` | provider | — | `src/components/theme-provider.tsx` + `src/app/layout.tsx` L32-37 | role-match |
| `src/app/layout.tsx` (wrap in Providers) | config | — | itself | exact |
| `src/app/upload/page.tsx`, `src/app/spines/page.tsx` | page (RSC) | request-response | `src/app/upload/page.tsx` (current placeholder), `src/app/settings/page.tsx` | exact |
| `src/app/{upload,spines}/loading.tsx` | page | — | `src/app/settings/loading.tsx` | exact |
| `src/components/dropzone.tsx`, `upload-tip.tsx` | component | event-driven | `src/components/dev-job-trigger.tsx` (client fetch + status refresh) | role-match |
| `src/components/photo-status-{list,row,badge}.tsx` | component | polling | `src/components/status-indicator.tsx` | role-match |
| `src/components/density-badge.tsx`, `worst-field-badge.tsx` | component | — | `status-indicator.tsx` L161-176 (Tooltip on button) | role-match |
| `src/components/rescan-button.tsx`, `dismiss-spine-button.tsx` | component | request-response | `src/components/test-claude-button.tsx` / `dev-job-trigger.tsx` | role-match |
| `src/components/spines-filter-bar.tsx` | component | — | `src/components/model-select.tsx` (Select) | role-match |
| `src/components/photo-section.tsx`, `spine-card.tsx`, `spine-crop.tsx` | component | — | `src/components/claude-cli-card.tsx` (Card) | role-match |
| `src/components/spine-field.tsx` | component | CRUD (optimistic) | `src/components/model-select.tsx` (save-on-change, inline FieldError) | role-match |
| `src/components/reattach-dialog.tsx` | component | request-response | none (Dialog/RadioGroup new) | partial |
| `src/components/ui/{textarea,toggle-group,toggle,dialog,radio-group}.tsx` | component | — | `shadcn add` generated | n/a |
| `scripts/spike-vision.ts` | utility (script) | batch | `scripts/verify-claude-cli.ts` | exact |
| `*.test.ts` (route, handler, images, vision, scan) | test | — | `src/app/api/dev/jobs/route.test.ts`, `src/server/jobs/queue.test.ts`, `src/server/claude/cli.test.ts` | exact |
| `test/fixtures/vision/*.json` | fixture | — | `test/fixtures/fake-claude.mjs` | partial |
| `.gitignore` (`fixtures/spike/`) | config | — | itself | exact |

## Pattern Assignments

### `src/server/db/schema.ts` (model)
**Analog:** itself, L1-27. Copy column conventions: text ULID PK, `text(..., { enum: [...] })` for states, epoch-ms `integer` timestamps, snake_case column names, index in the 3rd arg, `$inferSelect` type export (L45).
```ts
export const jobs = sqliteTable('jobs', {
    id: text('id').primaryKey(),
    lane: text('lane', { enum: ['anthropic', 'discogs'] }).notNull(),
    status: text('status', { enum: ['queued','running','succeeded','failed','cancelled'] }).notNull().default('queued'),
    dedupeKey: text('dedupe_key').unique(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('jobs_claim_idx').on(t.lane, t.status, t.runAfter)],
);
export type JobRow = typeof jobs.$inferSelect;
```
New tables: `photos.sha256` `.unique()`; `vision_runs` `uniqueIndex(photo_id, run_no)`; `spine_fields` composite PK `primaryKey({ columns: [t.spineId, t.field] })`. Then `drizzle-kit generate` -> `drizzle/0001_*.sql` (migrations run at boot).

### `src/server/jobs/queue.ts` (add `maxAttempts`)
**Analog:** itself L50-81 (`enqueue`). Raw SQL via `getDb().$client.prepare(...)`, `ON CONFLICT(dedupe_key) DO NOTHING`, return `{ id, created }`. Add an optional `maxAttempts` to the input type and `max_attempts` to the INSERT column list; scan jobs pass `1`.

### `src/server/jobs/handlers/scan-photo.ts` (job handler)
**Analog:** `src/server/jobs/handlers/noop.ts`
- Imports (L1-6): `import 'server-only'`, `node:fs/promises`, `node:path`, `zod`, `../../storage/paths`, `type { JobContext } from '../types'`.
- Payload Zod schema exported (L8-12), parsed first line of handler (L53).
- Signature (L49-52): `export async function runScanPhoto(payload: unknown, ctx: JobContext): Promise<void>`.
- File write (L62-64): `resolveData(rel)` -> `fs.mkdir(dirname, {recursive:true})` -> write. Use tmp+rename for content-addressed files.
- Contract (`src/server/jobs/types.ts` L16-41): call `ctx.isCurrent()` right before the spawn; pass `ctx.signal` to `runProcess`. Deviation: per RESEARCH Pitfall 3, never throw after the spawn — catch, write `vision_runs.status='error'`, return.
- Register in `handlers/index.ts`: `scan_photo: { run: runScanPhoto, timeoutMs: 600_000 },` next to `noop: { run: runNoop, timeoutMs: 120000 }` (L6).

### `src/server/claude/cli.ts` (extend) + `src/server/vision/run.ts`
**Analog:** `buildClaudeArgs` (cli.ts L267-310) and `testClaude` (L383-440).
- Extend `ClaudeCallArgs` with `jsonSchema?: string; effort?: 'low'|'medium'|'high'|'xhigh'|'max'; maxTurns?: number` and append `--json-schema`, `--effort`, `--max-turns` after the readDirs block (L303-308 keeps `--tools Read --allowedTools Read --add-dir`). Keep the `MODEL_ID` regex check (L264).
- Spawn like the private `run()` (L154-162) but with `signal: ctx.signal`, `maxBuffer: 8_000_000`:
```ts
return runProcess({ command: claudeBin(), args, env: buildClaudeEnv(), cwd: claudeWorkDir(), timeoutMs });
```
- Classification chain to copy (L397-430): `spawnError` -> `timedOut` -> `ResultSchema.safeParse(parseJson(stdout))` -> `is_error` -> exitCode -> missing payload. Vision adds: write raw stdout first, `subtype !== 'success'`, missing `structured_output`, Zod fail of `VisionResult`. Map each to UI-SPEC error-reason copy.
- `RunResult` shape: `src/server/proc/run.ts` L9-17.

### `src/server/vision/schema.ts`
**Analog:** `ResultSchema` (cli.ts L330) for CLI envelope; extend it with `subtype`, `structured_output`, `usage`, `total_cost_usd`, `duration_ms`. Body per RESEARCH "Vision schema sketch"; emit with `z.toJSONSchema(VisionResult, { target: 'draft-07' })` and strip numeric bounds.

### `src/server/settings.ts` (new settings)
**Analog:** itself L18-65. Pattern per setting: Zod schema + `const KEY = '...'` + getter with default via `getSetting(KEY, Schema) ?? DEFAULT` + setter that `Schema.parse`s.
```ts
export function getVisionModel(): VisionModelId {
  return getSetting(VISION_MODEL_KEY, VisionModelSchema) ?? DEFAULT_VISION_MODEL;
}
```
Add `confidence_threshold` (0.6), `density_max_spines` (N), `density_min_short_side_px` (W), `vision_effort` ('medium').

### `src/app/api/photos/route.ts`, `rescan`, `spines`, `spines/[id]/fields` (routes)
**Analog:** `src/app/api/dev/jobs/route.ts`
- `await connection();` first line of every handler (L66, L86).
- Content-type gate (L90-96) — copy for PATCH/rescan JSON bodies; the upload POST instead checks magic bytes + `content-length === byteLength`.
- Body parsing + Zod (L97-109):
```ts
let raw: unknown;
try { raw = await req.json(); } catch { return Response.json({ error: 'invalid JSON body' }, { status: 400 }); }
const parsed = Body.safeParse(raw ?? {});
if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
```
- Enqueue + status (L118-119): `Response.json(result, { status: result.created ? 201 : 200 })` — maps to upload 201 vs duplicate 200.
- GET maps rows to a flat JSON DTO (L69-82).
- CSRF/Origin guard is inherited from `src/proxy.ts`; nothing to add.

### `src/app/api/files/[...path]/route.ts` (streaming)
**Analog (partial):** `resolveData` (paths.ts L44-52) for the path check; route shell from dev/jobs route. Streaming body (`Readable.toWeb(fs.createReadStream)`) and headers per RESEARCH Pattern 8 — no in-repo example.

### `src/app/providers.tsx` + `layout.tsx`
**Analog:** `src/app/layout.tsx` L32-37. Insert `<Providers>` inside `<TooltipProvider>` around `<AppHeader/>`/`<main>`; pattern for a `'use client'` wrapper is `src/components/theme-provider.tsx`.

### `src/app/upload/page.tsx`, `src/app/spines/page.tsx`
**Analog:** current `src/app/upload/page.tsx` L1-43: async RSC, `await connection()`, `isClaudeReady(await getClaudeCliStatus({ maxAgeMs: 60_000 }))`, `Empty*` components with `EmptyMedia variant="icon"` + `size-5` icon, `<Button asChild><Link href="/settings">Open Settings</Link></Button>`. Reuse that readiness check for the CLI-not-ready Alert.
Loading files: copy `src/app/settings/loading.tsx`.

### Polling components (`photo-status-list`, section data)
**Analog:** `src/components/status-indicator.tsx`. Copy: `'use client'`, `cn` import, `STATUS_REFRESH_EVENT = 'app:status-refresh'` (L20; dispatch after upload/rescan), mono number helper (L36-38):
```tsx
function Num({ value }: { value: number }) { return <span className="font-mono tabular-nums">{value}</span>; }
```
Tooltip-on-button trigger (L161-176) for density/truncation/low-confidence badges. Replace the setTimeout loop with TanStack `useQuery` + `refetchInterval` function (RESEARCH Pattern 7).

### `src/components/spine-field.tsx`, `spines-filter-bar.tsx`
**Analog:** `src/components/model-select.tsx` L1-40+: local `current` state, `error` state, `useTransition`, save on change, `toast` from `sonner`, `Field/FieldLabel/FieldError` imports, `Select*` imports. SpineField swaps the server action for a `useMutation` PATCH and keeps the draft on error (no rollback, per UI-SPEC).

### `rescan-button.tsx`, `dismiss-spine-button.tsx`, `dropzone.tsx`
**Analog:** `src/components/test-claude-button.tsx` / `src/components/dev-job-trigger.tsx` (client fetch to an API route, pending state, status-refresh event). Dialog via existing `@/components/ui/alert-dialog`.

### `scripts/spike-vision.ts`
**Analog:** `scripts/verify-claude-cli.ts` (+ `scripts/lib/*`) — owner-run tsx script using the same CLI helpers.

### Tests
- Route tests: `src/app/api/dev/jobs/route.test.ts` L1-40 — `vi.mock('next/server', ... connection: async () => {})`, `useTempDataDir()` from `test/helpers/temp-data-dir.ts`, build `new Request('http://127.0.0.1:3000/...', {...})`, call exported `POST` directly.
- Queue/handler tests: `src/server/jobs/queue.test.ts` (fixed `T0` timestamps, `failOrRetry`/`recoverRunningJobs` assertions — extend for `maxAttempts: 1`).
- CLI tests: `src/server/claude/cli.test.ts` + `test/fixtures/fake-claude.mjs` (fake binary; never the live CLI). Recorded vision outputs go under `test/fixtures/vision/`.
- Vitest include is `src/**/*.test.ts`.

## Shared Patterns

### Server-only + IDs + time
**Source:** `src/server/jobs/handlers/noop.ts` L1, `src/server/ids.ts`
**Apply to:** all `src/server/**` files. `import 'server-only';` first; `newId()` (monotonic ULID) for every PK; `Date.now()` epoch-ms timestamps.

### Path safety
**Source:** `src/server/storage/paths.ts` L44-52 (`resolveData`), L6-12 (`SUBDIRS`)
**Apply to:** scan handler, images, file route. DB stores relative paths only; every absolute path goes through `resolveData`.

### Route handler skeleton / validation
**Source:** `src/app/api/dev/jobs/route.ts` L85-119
**Apply to:** all new API routes. `connection()`, content-type gate, `safeParse` + `z.prettifyError` 400s.

### Job exactly-once
**Source:** `src/server/jobs/queue.ts` `enqueue` (dedupe), `src/server/jobs/types.ts` L16-25 (`isCurrent`)
**Apply to:** upload route, rescan route, scan handler. Dedupe key `scan:<photoId>:<runNo>`, `maxAttempts: 1`.

### Subprocess
**Source:** `src/server/claude/cli.ts` L154-162 + `src/server/proc/run.ts` L19-28
**Apply to:** vision run. Always `buildClaudeEnv()` + `claudeWorkDir()` + `signal`.

### Client status refresh
**Source:** `src/components/status-indicator.tsx` L20
**Apply to:** upload, rescan, dismiss, reattach success paths: `window.dispatchEvent(new Event(STATUS_REFRESH_EVENT))`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/server/images/*.ts` | utility | file-I/O | sharp/heic-decode not used yet; use RESEARCH Pattern 3/5 + `resizedSize` code |
| `src/server/vision/density.ts` | utility | transform | pure math; RESEARCH Pitfall 5 |
| `src/server/scan/match.ts`, `levenshtein.ts` | utility | transform | RESEARCH Pattern 6 |
| `src/server/scan/merge.ts` | service | CRUD (transaction) | No multi-table transaction yet; use `db.transaction(...).immediate()` per RESEARCH Pattern 2 |
| `src/app/api/files/[...path]/route.ts` (stream body) | route | streaming | RESEARCH Pattern 8 |
| `src/app/providers.tsx` (QueryClient/Nuqs) | provider | — | No TanStack/nuqs yet |
| `src/components/dropzone.tsx` (react-dropzone internals) | component | event-driven | UI-SPEC /upload section |
| `src/components/reattach-dialog.tsx` | component | request-response | Dialog/RadioGroup not installed yet |

## Metadata

**Analog search scope:** `src/`, `scripts/`, `test/`, `drizzle/`, root config (all git-tracked)
**Files scanned:** ~25
**Pattern extraction date:** 2026-10-19
