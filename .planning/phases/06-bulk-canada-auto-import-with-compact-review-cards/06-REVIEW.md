---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
reviewed: 2026-10-25T00:00:00Z
depth: standard
files_reviewed: 64
files_reviewed_list:
  - drizzle/0004_bulk_import.sql
  - scripts/verify-bulk-import.ts
  - src/app/api/spines/[id]/retry/route.ts
  - src/app/api/spines/bulk-import/route.ts
  - src/app/api/spines/route.ts
  - src/app/settings/actions.ts
  - src/app/settings/page.demo.tsx
  - src/app/settings/page.tsx
  - src/app/spines/loading.tsx
  - src/app/spines/page.demo.tsx
  - src/app/spines/page.tsx
  - src/components/bulk-import-bar.tsx
  - src/components/bulk-import-dialog.tsx
  - src/components/bulk-status-line.tsx
  - src/components/card-layout-toggle.tsx
  - src/components/compact-spine-card.tsx
  - src/components/confirmed-match.tsx
  - src/components/country-badge.tsx
  - src/components/discogs-card.tsx
  - src/components/discogs-matches.tsx
  - src/components/expanded-cards.tsx
  - src/components/fallback-filter-toggle.tsx
  - src/components/import-state-badge.tsx
  - src/components/photo-section.tsx
  - src/components/preferred-country-field.tsx
  - src/components/spine-card.tsx
  - src/components/spine-selection.tsx
  - src/components/spines-filter-bar.tsx
  - src/components/spines-view.tsx
  - src/components/top-match-row.tsx
  - src/components/ui/checkbox.tsx
  - src/demo/ops/bulk.ts
  - src/demo/ops/imports.ts
  - src/demo/read-model.ts
  - src/demo/routes.ts
  - src/demo/routes/bulk.ts
  - src/demo/routes/read.ts
  - src/demo/seed.ts
  - src/demo/settings-actions.ts
  - src/demo/store.ts
  - src/lib/bulk-copy.ts
  - src/lib/bulk-eligibility.ts
  - src/lib/bulk-selection.ts
  - src/lib/bulk-types.ts
  - src/lib/bulk-view.ts
  - src/lib/discogs-types.ts
  - src/lib/pressing.ts
  - src/lib/review-status.ts
  - src/lib/scan-types.ts
  - src/server/bulk/picks.ts
  - src/server/bulk/queries.ts
  - src/server/bulk/recovery.ts
  - src/server/bulk/store.ts
  - src/server/db/schema.ts
  - src/server/discogs/queries.ts
  - src/server/discogs/status.ts
  - src/server/discogs/store.ts
  - src/server/discogs/versions.ts
  - src/server/imports/store.ts
  - src/server/jobs/handlers/index.ts
  - src/server/jobs/handlers/resolve-pressing.ts
  - src/server/scan/queries.ts
  - src/server/settings.ts
  - test/helpers/bulk-seed.ts
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-10-25
**Depth:** standard
**Files Reviewed:** 64
**Status:** issues_found

## Summary

I reviewed the diff since `2047c1d`: the bulk store, routes, the resolve_pressing handler, the pressing chooser, the read model, the compact-card UI and the settings country field. The demo layer got a lighter pass. The core is defensive: compare-and-set item transitions, IMMEDIATE transactions, release ids taken only from candidate rows or parsed versions, and a host-allowlisted thumb fetch. The defects are in the edges between the store, the worker and the read model:

- The run's folder is recorded but never used.
- A queued item whose job *succeeded* blocks every later run.
- The server and the UI disagree about what "a run is in progress" means.
- The header's failed count misses failed lookups.
- A malformed versions body is retried and reported as "Error".
- The confirm dialog's pick list changes while the dialog is open.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The run's snapshotted folder is never used, so items can go to a folder other than the one confirmed and reported

**File:** `src/server/imports/store.ts:292`, `src/app/api/spines/bulk-import/route.ts:93`, `src/server/bulk/queries.ts:209`
**Issue:** `startBulkRun` stores `bulk_runs.folder_id`, and the dialog title, progress line and finished toast all name that folder (`collectionFolderName(run.folder_id)`). But `createImport`, which runs inside each `resolve_pressing` job, reads `getCollectionFolderId()` again at lookup time. A large run can take tens of minutes at about 1 req/s. If the owner changes the collection folder in Settings during the run, the remaining spines go into the new folder. The toast still says "N added to {old folder}". The country is snapshotted correctly (`run.country`); the folder is not.
**Fix:** Pass the run's folder through to the import:
```ts
// imports/store.ts createImport input
folderId?: number;
...
folderId: input.folderId ?? getCollectionFolderId(),

// resolve-pressing.ts
const res = createImport(db, { spineId, candidateId, runAfter, folderId: run.folder_id });
```

### WR-02: A queued item whose job ended `succeeded` blocks every future bulk run

**File:** `src/server/bulk/recovery.ts:31`, `src/server/bulk/store.ts:301`
**Issue:** `markInterruptedLookups` only fails queued items whose job is `failed` or `cancelled`. `bulkItemPhaseOf` reads any queued item whose job is not queued/running as failed, so the card shows "interrupted". But `openBulkItemCount` still counts the item, and every `POST /api/spines/bulk-import` answers 409 `bulk_running` until the owner happens to retry that one spine.

`retryBulkItem` can produce exactly this state. When the item is already `failed` (written by `failBulkItem` on the auth or rejected path) but the worker has not yet marked the job finished, the holder is still `running`. The retry reuses it and flips the item back to `queued`. The handler then returns, the worker marks the job `succeeded`, and the item is stranded as `queued`.
**Fix:** Treat every finished job as abandoned, and do not reuse a running holder for an item that is no longer queued:
```sql
AND job_id IN (SELECT id FROM jobs WHERE status IN ('succeeded', 'failed', 'cancelled'))
```
```ts
// retryBulkItem
if (holder?.status === 'queued' || (holder?.status === 'running' && item.status === 'queued')) { reuse }
else if (holder?.status === 'running') return busy; // let it finish first
```

### WR-03: The server's "run in progress" rule disagrees with the UI's

**File:** `src/app/api/spines/bulk-import/route.ts:87`, `src/server/bulk/store.ts:117`, `src/lib/bulk-view.ts:77`
**Issue:**
- **Server:** busy only while any `bulk_items` row is `queued`, in any run.
- **UI:** `importDisabledReason` uses `run.running` from `summarizeRun`, which covers the **latest** run only and also waits for each resolved item's add job.

This causes two concrete problems:
1. **The server allows a new run before the previous one has finished.** Once the last lookup finishes but its adds are still waiting (for example from another tab or a direct request), a new run is accepted. `latestBulkRun` then switches to the new run, so the earlier run's finished toast never fires (`hasRunFinished` never sees it finish) and its result line disappears.
2. **The UI enables Import while the server refuses it.** A Retry import on an item from an *older* run makes it queued again. The bar shows no run in progress and Import is enabled, but Start answers 409 "Wait for the current bulk import to finish" with nothing visible running.

**Fix:** Use one definition in both places. For example, have the route refuse while `latestBulkRun(db)?.running` is true *or* any item is queued, and surface "a retried lookup is still running" in `importDisabledReason`. Alternatively, have `latestBulkRun` prefer a run that still has queued items.

### WR-04: The header's failed count leaves out failed bulk lookups

**File:** `src/server/discogs/status.ts:38-61`
**Issue:** `IMPORTS_LEFT_SQL` now counts `resolve_pressing` jobs, so "left" covers the whole bulk run (BULK-11). `IMPORTS_FAILED_SQL` still looks only at the latest `imports` row. Failed or abandoned lookups are left out, even though `reviewStatusOf` puts them in the Failed filter and "Retry all failed" retries them. When lookups fail, the header's "left" count drops by N but no failure appears. Conversely, a failed earlier import that a newer current lookup has superseded is still counted as failed.
**Fix:** Count the spine's current bulk item first, mirroring `reviewStatusOf`. Add a CTE over the latest `bulk_items` per spine that is newer than the latest import (or owns it), and count it when it is `failed`, or `queued` with a job that is no longer queued/running. Exclude those spines from the import-based count.

### WR-05: A malformed versions body is retried as transient and reported to the owner as "Error"

**File:** `src/server/discogs/versions.ts:79`, `src/server/jobs/handlers/resolve-pressing.ts:294-299`
**Issue:** `parseVersions` throws a plain `Error` when the envelope does not match. The handler's `default` branch records `errorKind: 'other'` with `error: errName(err) || 'Error'` and rethrows, so the worker retries a deterministic failure up to `max_attempts`, spending a paced Discogs request each time. The card then reads "Couldn't look up pressings: Error. Retry the import.", which tells the owner nothing.
**Fix:** Give the envelope failure its own error name and handle it like a refused answer, without retrying:
```ts
class DiscogsVersionsShapeError extends Error { name = 'DiscogsVersionsShapeError'; }
...
case 'DiscogsVersionsShapeError':
  if (!ctx.isCurrent()) throw err;
  fail('rejected', 'Discogs answered an unexpected versions list');
  return;
```
Alternatively, treat it as `versions = 'unusable'` (falls back to the top match, `fallback_unusable_master`).

### WR-06: The confirm dialog's pick list changes while it is open, and can reach zero

**File:** `src/components/bulk-import-bar.tsx:96,184`, `src/components/bulk-import-dialog.tsx:110`
**Issue:** `picked` is recomputed from the polled `data.spines` and the pruned selection on every render, and is passed straight to the open dialog. While the owner reads "Import 12 to …", a poll can make spines ineligible (for example a search finishes with no match, or a manual add from another tab). The title count then changes under them, and Start sends a different set than the one they confirmed (D-07, T-06-22: "one explicit confirm that names the count"). If every pick drops out, `bulkStartBody` sends `items: []`. `BULK_START_BODY.min(1)` rejects that with a 400, and the dialog shows the raw `z.prettifyError` text ("✖ Too small: expected array…").
**Fix:** Snapshot the picks when the dialog opens, and let the server's re-check report the skips:
```tsx
const [frozen, setFrozen] = useState<SpineDto[]>([]);
onClick={() => { setFrozen(picked); setOpen(true); }}
<BulkImportDialog spines={frozen} … />
```
Also disable Start when `spines.length === 0`.

## Info

### IN-01: Early `changed` skips write without the WR-04 currency check

**File:** `src/server/jobs/handlers/resolve-pressing.ts:195,208`
**Issue:** The handler header says "A run that stops being current writes nothing (WR-04)". The spine-state and missing-candidate skips call `skipBulkItem` without `ctx.isCurrent()`. The compare-and-set on `status = 'queued'` limits the damage, but a stale attempt can still finish an item that the current attempt owns.
**Fix:** Add `if (!ctx.isCurrent()) return;` before both skips.

### IN-02: The fallback line misstates a title-guard rejection

**File:** `src/lib/bulk-copy.ts:180-182`, `src/lib/pressing.ts:241-243`
**Issue:** When a preferred-country version exists but fails the D-21 title guard, the outcome is `fallback_unusable_master`. The card then says "No Canadian pressing listed for this release". One was listed but rejected as a likely mismatch.
**Fix:** Give the title-guard case its own outcome or line, for example "A Canadian pressing was listed but didn't match the title, used {country}".

### IN-03: A run with zero started items can still be written and become the "latest run"

**File:** `src/server/bulk/store.ts:119-170`
**Issue:** If every accepted pick is refused by the index or a foreign key, the run row still commits with `total = 0`. The route returns 201 with `started: 0`, and the bar's last-result line switches to "Last bulk import: 0 added", replacing the previous run's summary. This is unlikely after `eligiblePicks`, but nothing prevents it.
**Fix:** If `started === 0`, throw inside the transaction (roll back the run row) and answer `nothing_to_import`.

### IN-04: `summarizeRun` counts some items in two result buckets

**File:** `src/lib/bulk-view.ts:64-74`
**Issue:** A resolved fallback item is counted in `fallbacks` and then also in `failed` (when its import failed) or in `changed` (when its import row is gone). The toast can then read, for example, "3 used another country. 3 failed." for the same three spines, and the parts sum to more than `total`.
**Fix:** Count `fallbacks` only for items whose import reached `imported` or `already_in_collection`. Otherwise document that `fallbacks` overlaps the other buckets.

---

_Reviewed: 2026-10-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
