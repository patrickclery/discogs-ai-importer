---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
fixed_at: 2026-10-25T09:10:00Z
review_path: .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-10-25T09:10:00Z
**Source review:** .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (Critical + Warning; Info IN-01..IN-04 out of scope)
- Fixed: 6
- Skipped: 0

**Verification:** Ran in the main checkout (`workflow.use_worktrees: false`, no worktree created). Final gates: `npx tsc --noEmit` clean; `npx vitest run` 120 files / 2184 tests passed. Biome check clean on every touched file.

## Fixed Issues

### WR-01: The run's snapshotted folder is never used

**Files modified:** `src/server/imports/store.ts`, `src/server/jobs/handlers/resolve-pressing.ts`, `src/server/jobs/handlers/resolve-pressing.test.ts`
**Commit:** 548019f
**Applied fix:** `createImport` takes an optional `folderId` (defaults to `getCollectionFolderId()`); `resolve_pressing` passes `run.folder_id`. Test: a run started with folder 7 writes its import to folder 7 while Settings still says 1.

### WR-02: A queued item whose job ended `succeeded` blocks every future bulk run

**Files modified:** `src/server/bulk/recovery.ts`, `src/server/bulk/store.ts`, `src/server/imports/store.ts`, plus tests in `src/server/bulk/recovery.test.ts`, `src/server/bulk/store.test.ts`, `src/server/imports/store.test.ts`
**Commit:** 147c568
**Applied fix:** `markInterruptedLookups` now also fails queued items whose job `succeeded`. `retryBulkItem` reuses a running holder only while the item is still queued; for an item that already left queued it returns `null`, and `retrySpine` answers `busy`. Status: fixed: requires human verification (state-machine logic).

### WR-03: The server's "run in progress" rule disagrees with the UI's

**Files modified:** `src/lib/bulk-types.ts`, `src/lib/bulk-view.ts`, `src/server/bulk/queries.ts`, `src/app/api/spines/bulk-import/route.ts`, `src/lib/bulk-copy.ts`, `src/components/bulk-import-bar.tsx`, `src/demo/read-model.ts`, `src/demo/ops/bulk.ts`, plus tests in `route.test.ts`, `bulk-view.test.ts`, `bulk-copy.test.ts`, `src/demo/ops/bulk.test.ts`
**Commit:** e5c5dc9
**Applied fix:** `BulkRunDto` gains `openLookups` (queued items in any run) and `busy` (`running || openLookups > 0`), computed in `summarizeRun`. The start route refuses on `latestBulkRun(db)?.busy` (keeping the `openBulkItemCount` backstop), the Import button reads the same flag ("Wait for the retried lookup to finish" when only an older run's lookup is open), and the demo uses the same rule. The demo test that expected a second run to start once lookups finished now waits until the first run's adds finish too. Status: fixed: requires human verification (a new run is now refused while the latest run's adds are still waiting).

### WR-04: The header's failed count leaves out failed bulk lookups

**Files modified:** `src/server/discogs/status.ts`, `src/server/discogs/status.test.ts`
**Commit:** 77e512c
**Applied fix:** `IMPORTS_FAILED_SQL` now follows `reviewStatusOf`. Imported spines never count. Otherwise the spine's current bulk item comes first: a failed or abandoned lookup counts, and a lookup still finding does not. Only after that does the latest-import rule apply. "Current" means the same as in `isCurrentBulkItem`. Demo needs no change (demo items never fail). Status: fixed: requires human verification (SQL logic).

### WR-05: A malformed versions body is retried as transient and reported as "Error"

**Files modified:** `src/server/discogs/versions.ts`, `src/server/discogs/versions.test.ts`, `src/server/jobs/handlers/resolve-pressing.ts`, `src/server/jobs/handlers/resolve-pressing.test.ts`
**Commit:** 487cbbb
**Applied fix:** New `DiscogsVersionsShapeError` ("Discogs answered an unexpected versions list"); the handler fails the item as `rejected` without rethrowing, so the worker does not retry it. The old "recorded as other and rethrown" test now asserts the new behavior.

### WR-06: The confirm dialog's pick list changes while it is open, and can reach zero

**Files modified:** `src/components/bulk-import-bar.tsx`, `src/components/bulk-import-dialog.tsx`, `src/components/bulk-import-dialog.test.ts`
**Commit:** b9c5d21
**Applied fix:** The bar snapshots `picked` into state when Import is clicked and passes that frozen list to the dialog. The dialog disables Start when `bulkStartBody(spines)` has no items. The dialog's disabled state has a test. The bar snapshot has no component test (node test environment), so it needs a manual UAT check: open the dialog during a poll and confirm the count holds.

---

_Fixed: 2026-10-25T09:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
