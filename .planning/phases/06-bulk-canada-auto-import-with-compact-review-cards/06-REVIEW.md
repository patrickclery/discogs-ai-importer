---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
reviewed: 2026-10-25T09:30:00Z
depth: standard
iteration: 2
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
  warning: 0
  info: 5
  total: 5
status: clean
---

# Phase 6: Code Review Report (iteration 2)

**Reviewed:** 2026-10-25
**Depth:** standard
**Files Reviewed:** 64
**Status:** clean (no Critical or Warning findings; 5 Info items remain)

## Summary

This pass re-reviewed the six fix commits (548019f..b9c5d21) against the call sites they touch. `npx tsc --noEmit` is clean, and the 10 affected test files pass (266 tests). All six warnings are fixed correctly, and none of the fixes introduces a regression:

- **WR-01:** The fix is correct. `createImport` writes `input.folderId ?? getCollectionFolderId()`, and `resolve_pressing` passes `run.folder_id`. The add handler reads `row.folder_id` (`add-to-collection.ts:417,492`), so the snapshot reaches the POST.
- **WR-02:** The fix is correct.
  - `markInterruptedLookups` now also fails queued items whose job `succeeded`. The hook runs on every lease tick (`handlers/index.ts:67`), not only at boot.
  - The change also covers a case the original finding missed. When the lease is lost, `isCurrent()` turns false and the handler returns early (`resolve-pressing.ts:221,307,310`). `complete()` can still mark that job succeeded, because the attempt number matches (`queue.ts:120`). This used to strand the item, and now it reads as interrupted.
  - `retryBulkItem` returns `null` for a running holder whose item already left `queued`, and `retrySpine` maps that to `busy`. `retry-failed` counts only `ok`, so the null is handled at every call site.
- **WR-03:** The fix is correct.
  - One `busy` flag (`running || openLookups > 0`) drives the start route, the Import button and the demo.
  - `queries.ts` now imports from `store.ts`. `store.ts` does not import `queries.ts`, so this adds no import cycle.
- **WR-04:** The fix is correct. The new `IMPORTS_FAILED_SQL` follows `reviewStatusOf` step by step:
  - instance id or imported wins;
  - then the current lookup;
  - then the import phase.

  Its currency test matches `isCurrentBulkItem` exactly, including the `created_at` tie rule. Its finding/failed split matches `bulkItemPhaseOf`, including the case where the job is missing.
- **WR-05:** The fix is correct. `DiscogsVersionsShapeError` reaches the `rejected` branch through `errName`, and the job is no longer retried. The card wording is slightly off (IN-05).
- **WR-06:** The fix is correct. The bar freezes `picked` into state on click, and the dialog disables Start when no pick has a top match.

The four Info items from iteration 1 are unchanged and are carried forward. One new Info item (IN-05) follows from the WR-05 fix.

## Narrative Findings (AI reviewer)

## Info

### IN-01: Early `changed` skips write without the currency check

**File:** `src/server/jobs/handlers/resolve-pressing.ts:195,208`
**Issue:** The file header says "A run that stops being current writes nothing (WR-04)". But the spine-state skip and the missing-candidate skip call `skipBulkItem` without checking `ctx.isCurrent()`. The compare-and-set on `status = 'queued'` limits the damage. Still, a stale attempt can finish an item that the current attempt owns.
**Fix:** Add `if (!ctx.isCurrent()) return;` before both skips.

### IN-02: The fallback line misstates a title-guard rejection

**File:** `src/lib/bulk-copy.ts:180-182`, `src/lib/pressing.ts:241-243`
**Issue:** Sometimes a version from the preferred country exists but fails the D-21 title guard. The outcome is then `fallback_unusable_master`, and the card says "No Canadian pressing listed for this release". In fact one was listed, and it was rejected as a likely mismatch.
**Fix:** Give the title-guard case its own outcome or line, for example "A Canadian pressing was listed but didn't match the title, used {country}".

### IN-03: A run with zero started items can still be written and become the "latest run"

**File:** `src/server/bulk/store.ts:119-170`
**Issue:** The index or a foreign key can refuse every accepted pick. The run row then still commits with `total = 0`, and the route answers 201 with `started: 0`. The bar's last-result line becomes "Last bulk import: 0 added" and replaces the previous run's summary.
**Fix:** If `started === 0`, throw inside the transaction so the run row rolls back, and answer `nothing_to_import`.

### IN-04: `summarizeRun` counts some items in two result buckets

**File:** `src/lib/bulk-view.ts:75-84`
**Issue:** A resolved fallback item is counted in `fallbacks`. It is then counted again in `failed` (when its import failed) or in `changed` (when its import row is gone). The toast can then read "3 used another country. 3 failed." for the same three spines.
**Fix:** Count `fallbacks` only for items whose import reached `imported` or `already_in_collection`.

### IN-05: A malformed versions body reads "Discogs refused the request" on the card

**File:** `src/server/jobs/handlers/resolve-pressing.ts:283-288`, `src/lib/bulk-copy.ts:209-210`
**Issue:** The WR-05 fix stores a `DiscogsVersionsShapeError` under `errorKind: 'rejected'`. `failureOf` exposes a reason only for kind `other`, so the card shows the generic rejected line: "Couldn't look up pressings: Discogs refused the request." Discogs did not refuse anything. It answered 200 with a body of an unexpected shape. The stored error text ("Discogs answered an unexpected versions list") never reaches the owner. The no-retry behavior is correct.
**Fix:** Record it as `errorKind: 'other'` without rethrowing. `failBulkItem` with kind `other` keeps the no-retry behavior and surfaces the stored reason. Alternatively, add a `malformed` lookup error kind with its own line.

---

_Reviewed: 2026-10-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
