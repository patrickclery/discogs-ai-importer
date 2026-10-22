---
phase: 04-import-review-queue
verified: 2026-10-22T11:49:53Z
status: human_needed
score: 129/135 must-haves verified (5/5 roadmap success criteria, 124/130 plan truths; 6 backstop truths need owner evidence)
covered_files:
  - ".planning/phases/04-import-review-queue/04-01-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-01-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-02-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-02-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-03-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-03-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-04-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-04-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-05-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-05-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-06-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-06-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-07-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-07-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-08-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-08-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-09-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-09-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-10-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-10-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-11-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-11-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-12-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-12-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-13-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-13-SUMMARY.md"
  - ".planning/phases/04-import-review-queue/04-14-PLAN.md"
  - ".planning/phases/04-import-review-queue/04-14-SUMMARY.md"
  - "drizzle/0003_import_review.sql"
  - "drizzle/meta/0003_snapshot.json"
  - "drizzle/meta/_journal.json"
  - "scripts/lib/import-flow.ts"
  - "scripts/report-discogs-import-live.ts"
  - "scripts/verify-discogs-import.ts"
  - "scripts/verify-review-queue.ts"
  - "src/app/api/discogs/folders/route.test.ts"
  - "src/app/api/discogs/folders/route.ts"
  - "src/app/api/spines/[id]/dismiss/route.ts"
  - "src/app/api/spines/[id]/import/another/route.test.ts"
  - "src/app/api/spines/[id]/import/another/route.ts"
  - "src/app/api/spines/[id]/import/link-existing/route.test.ts"
  - "src/app/api/spines/[id]/import/link-existing/route.ts"
  - "src/app/api/spines/[id]/import/route.test.ts"
  - "src/app/api/spines/[id]/import/route.ts"
  - "src/app/api/spines/[id]/not-on-discogs/route.test.ts"
  - "src/app/api/spines/[id]/not-on-discogs/route.ts"
  - "src/app/api/spines/[id]/retry/route.test.ts"
  - "src/app/api/spines/[id]/retry/route.ts"
  - "src/app/api/spines/retry-failed/route.test.ts"
  - "src/app/api/spines/retry-failed/route.ts"
  - "src/app/api/spines/route.ts"
  - "src/app/settings/actions.test.ts"
  - "src/app/settings/actions.ts"
  - "src/app/spines/loading.tsx"
  - "src/app/spines/page.tsx"
  - "src/components/add-to-collection-button.tsx"
  - "src/components/already-in-collection.tsx"
  - "src/components/candidate-list.tsx"
  - "src/components/candidate-row.tsx"
  - "src/components/collection-folder-field.tsx"
  - "src/components/confirmed-match.tsx"
  - "src/components/discogs-card.tsx"
  - "src/components/discogs-matches.tsx"
  - "src/components/dismiss-spine-button.tsx"
  - "src/components/duplicate-import-dialog.tsx"
  - "src/components/import-state-badge.tsx"
  - "src/components/import-ui-context.tsx"
  - "src/components/not-on-discogs-line.tsx"
  - "src/components/photo-section.test.ts"
  - "src/components/photo-section.tsx"
  - "src/components/retry-all-failed-button.tsx"
  - "src/components/review-status-filter.tsx"
  - "src/components/spine-action-menu.test.ts"
  - "src/components/spine-action-menu.tsx"
  - "src/components/spines-filter-bar.tsx"
  - "src/components/spines-view.tsx"
  - "src/components/status-indicator.tsx"
  - "src/components/ui/dropdown-menu.tsx"
  - "src/lib/import-types.ts"
  - "src/lib/import-view.test.ts"
  - "src/lib/import-view.ts"
  - "src/lib/review-status.test.ts"
  - "src/lib/review-status.ts"
  - "src/lib/scan-types.ts"
  - "src/lib/spine-review.test.ts"
  - "src/lib/status-text.test.ts"
  - "src/lib/status-text.ts"
  - "src/lib/status-types.ts"
  - "src/server/db/schema.ts"
  - "src/server/discogs/client.test.ts"
  - "src/server/discogs/client.ts"
  - "src/server/discogs/collection.test.ts"
  - "src/server/discogs/collection.ts"
  - "src/server/discogs/enqueue.test.ts"
  - "src/server/discogs/enqueue.ts"
  - "src/server/discogs/folders.test.ts"
  - "src/server/discogs/folders.ts"
  - "src/server/discogs/status.test.ts"
  - "src/server/discogs/status.ts"
  - "src/server/imports/queries.test.ts"
  - "src/server/imports/queries.ts"
  - "src/server/imports/recovery.test.ts"
  - "src/server/imports/recovery.ts"
  - "src/server/imports/store.test.ts"
  - "src/server/imports/store.ts"
  - "src/server/jobs/handlers/add-to-collection.test.ts"
  - "src/server/jobs/handlers/add-to-collection.ts"
  - "src/server/jobs/handlers/index.ts"
  - "src/server/jobs/queue.ts"
  - "src/server/scan/merge.test.ts"
  - "src/server/scan/merge.ts"
  - "src/server/scan/not-on-discogs.test.ts"
  - "src/server/scan/not-on-discogs.ts"
  - "src/server/scan/orphans.test.ts"
  - "src/server/scan/orphans.ts"
  - "src/server/scan/queries.test.ts"
  - "src/server/scan/queries.ts"
  - "test/fixtures/fake-discogs.mjs"
covered_digest: "v3:sha256:8f41318101c59bf27da0de4a85c1edfd2d71e6550b24c98f4b99a504ac64f44f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Real Discogs account, first real import. Open the app on port 3001, go to the spines page, pick one CD you own whose top match is right, and click its 'Add to Uncategorized' button. Then open your collection on discogs.com and look in Uncategorized."
    expected: "The CD is there exactly once. Back in the app the card says Imported and names Uncategorized."
    why_human: "Automated checks only talk to a fake Discogs. Only your real account can show that Discogs accepts the add and dates it the way the app expects."
  - test: "Stop the app mid-import. Click Add on a second CD, and right away stop the app (Ctrl+C in its terminal). Start it again with the usual command, wait a few seconds, then check that CD on discogs.com. Finally run 'node scripts/report-discogs-import-live.ts' and read what it prints."
    expected: "The CD is in your collection exactly once and its card says Imported. The report prints counts only, with no warning lines (nothing posted twice, no copy held by two spines, nothing stuck)."
    why_human: "This is the real-world version of the 'kill it mid-import' test. It needs your real account and a real restart, which no automated check may do."
  - test: "Decide on code-review finding CR-01. Picture this: you click Add on the wrong match, and Discogs times out or errors. The card then shows Import failed. Change match is greyed out with 'Retry first. Discogs may already have added it.' Retry is the only button."
    expected: "You decide one of two things. (a) Fix it now: add a 'check only' way out that looks in your collection and frees the card when nothing was added. (b) Accept it for now, since it needs a wrong click plus a Discogs error, and the wrong CD can be removed by hand on discogs.com."
    why_human: "None of the five success criteria is broken. You did confirm that release, and no duplicate is made. But the only exit writes the release you wanted to drop. That trade-off is your call."
  - test: "Long folder name on the Add button. In Discogs, make a collection folder with a very long name (about 60 letters) and pick it in Settings > Collection folder. Open the spines page in a normal window, then shrink the window to phone width."
    expected: "The Add button shows the start of the folder name and then cuts off neatly. Hovering shows the full name. Nothing spills out of the card at either width."
    why_human: "How the page looks at phone width can only be checked by eye."
  - test: "Card buttons at phone width. With the window phone-narrow, look at one card in each of these states: Waiting to import, Already in your collection, Import failed."
    expected: "The buttons wrap onto a second line instead of running off the card. The small cover picture stays its normal size."
    why_human: "Visual layout check."
  - test: "Already-in-collection message with a long folder name. Add a CD you already own on Discogs, held in the long-named folder. Wait for the 'Already in your collection' message, then view it at phone width."
    expected: "The message ('You already have this release on Discogs: 1 copy in ...') wraps inside the card, and all of it is readable."
    why_human: "Visual layout check."
  - test: "Duplicate warning with a very long photo file name. Upload a shelf photo whose file name is very long (about 120 characters), then click Add on a CD that another spine already imported."
    expected: "A dialog says 'Already imported from {photo}, spine #...' and shows both spine pictures. The long title wraps, the captions stop after two lines, and hovering a caption shows the full name."
    why_human: "Visual layout check."
  - test: "Photo header at phone width. On the spines page, with the window phone-narrow, look at the line under a photo's name."
    expected: "'{i} / {n} imported' is always visible at the start of the line. The rest cuts off, and hovering shows the full line."
    why_human: "Visual layout check."
  - test: "Only an Add click adds anything. Use the app normally. Click on candidate rows, use the keyboard, and open Search Discogs and use its results."
    expected: "The only thing that adds a CD to your Discogs collection is clicking the 'Add to {folder}' button on a match inside a spine card. Search Discogs results have no Add button."
    why_human: "This is a 'must never happen' rule checked by judgment, not by a test. The code supports it (the Add button is used only in the card's match list), but you get the final say."
---

# Phase 4: Import & Review Queue Verification Report

**Phase Goal:** The user confirms the right release for each spine, and it lands in their Discogs collection exactly once. A status-driven list lets them work through the whole shelf to completion.
**Verified:** 2026-10-22T11:49:53Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Nothing reaches Discogs until the user confirms a specific candidate. After confirming, the release is in the chosen collection folder (Uncategorized by default) and the spine shows as imported | ✓ VERIFIED (fake Discogs); real account in Human Verification | `createImport` (store.ts:196) is the only place that creates an import. `enqueueImport` (store.ts:310) is the only `add_to_collection` enqueue site, confirmed by grep and by the passing test "only src/server/imports/store.ts enqueues the add_to_collection type, once". The release id comes from the candidate row, never from the request (store.ts:239-247, strict body route.ts:18). The write gate `isAllowed` (client.ts:121) allows only the add-to-folder POST for the stored user. `folder_id` comes from `getCollectionFolderId()`. I ran verify-discogs-import myself: steps (b), (c) and (c2) passed ("no import and no add yet"; "one read then one signed add POST to folder 1"; "/spines shows Imported") |
| 2 | Before confirming, the user is warned if the release is already in their Discogs collection or was already imported from another photo | ✓ VERIFIED | Local check: `duplicateOf` (store.ts:146) returns a 409 duplicate before anything is written. The `DuplicateImportDialog` is wired from add-to-collection-button.tsx. Remote check (D-05, by design inside the job, before any POST): handler step 3 (add-to-collection.ts:267-281) holds the import as `already_in_collection` with no POST, and the owner then picks Link existing or Add another copy. Verify steps (f), (g), (h) and (i) passed |
| 3 | Killing the app mid-import or retrying a failed import never creates a duplicate collection entry, and every imported spine records its Discogs instance ID | ✓ VERIFIED (fake Discogs; one edge case under WR-04) | Order is read, then the intent fenced on the claim, then the POST, then the record (add-to-collection.ts:209-349). Adopt-before-POST is `pickAdoptable`. I ran verify step (d), SIGKILL mid-POST then restart: "one 1031 copy, one add POST, adopted, post_count 1". Step (e), 502 after commit: "retried once, one 1041 copy, one add POST". Every path to `imported` sets `instance_id`. `imports_instance_idx` blocks recording a copy twice |
| 4 | User can filter the spine list by pending, matched, imported, not found, not on Discogs and failed, with a count for each status | ✓ VERIFIED | `reviewStatusOf` (review-status.ts:31) and `getSpines` (queries.ts:312-372) compute `byStatus` over every listed spine, ignoring the status and review filters. `/api/spines` parses `?status=` with `parseStatusParam`. `ReviewStatusFilter` is rendered in spines-filter-bar.tsx. Tests pass: "the six status counts sum to counts.all" and "ignore the status and review filters" |
| 5 | User can retry any failed item without re-uploading its photo, and can mark a spine "not on Discogs" | ✓ VERIFIED | `retrySpine` and `retryImport` (store.ts:410-497) reuse the same import row and keep the intent, or re-run a failed search with `enqueueExplicitSearch`. No upload or scan path is reached. Retry all failed is wired (retry-all-failed-button.tsx → /api/spines/retry-failed → retrySpine). Mark and unmark go spine-action-menu.tsx → /api/spines/{id}/not-on-discogs → not-on-discogs.ts. Store, route and not-on-discogs tests pass |

**Score:** 5/5 roadmap success criteria verified, and 124/130 plan truths verified. 0 truths are present-but-behavior-unverified. 6 backstop truths have `insufficient_spec` and need owner evidence: five visual checks plus the real-account check.

### Plan Truths (summary by plan)

| Plan | Truths | Verified | Not verified by code | Notes |
|------|--------|----------|-------------------|-------|
| 04-01 | 12 | 12 | – | Verify steps (a) to (c1) passed (schema, 4 migrations, the confirm refusals, racing confirms → one import) |
| 04-02 | 12 | 12 | – | Handler tests cover the 429, 401, 403, 404, 422, 5xx, timeout, crash and 201-without-instance cases. The adopt edge cases are in collection.test.ts |
| 04-03 | 15 | 13 | 2 backstop (visual) | Change match and Retry are wired to DELETE /import and POST /retry (confirmed-match.tsx:262-267) |
| 04-04 | 6 | 6 | – | Verify steps (g), (h) and (i) passed |
| 04-05 | 9 | 9 | – | review-status and queries tests pass |
| 04-06 | 12 | 12 | – | folders, actions and route tests pass. CollectionFolderField is rendered in discogs-card.tsx |
| 04-07 | 5 | 5 | – | merge.ts:170 and orphans.ts:34,138 guard non-failed imports. See WR-01 for failed-with-intent rows |
| 04-08 | 8 | 8 | – | not-on-discogs tests pass |
| 04-09 | 11 | 10 | 1 backstop (real account) | Retry all failed and the `/api/status` imports counts are wired |
| 04-10 | 6 | 6 | – | `markInterruptedImports` is wired in handlers/index.ts:50, and the read-model fallback is in `importPhaseOf` |
| 04-11 | 4 | 4 | – | client.test.ts covers the write gate and the username-redaction canary |
| 04-12 | 8 | 8 | – | store tests pass. The enqueue-site scan test passes |
| 04-13 | 10 | 8 | 2 backstop (visual) | Wired: DuplicateImportDialog and AlreadyInCollection → /import/link-existing and /import/another |
| 04-14 | 12 | 11 | 1 backstop (visual) | Two backstops have passing tests and count as verified: "discogsActive is true while an import job is queued or running" (with `spinesRefetchInterval`) and "ignore the status and review filters" |

### Prohibitions (must NOT)

| Plan | Statement (short) | Tier | Disposition |
|------|-------------------|------|-------------|
| 04-01 | No add unless the owner confirmed through POST /import | test | Enforced: the enqueue-site scan test passes, and only store.ts enqueues the job |
| 04-01 | No real Discogs from tests or verify scripts | test | Enforced: the verify scripts use the fake server with a temp SECRETS_FILE/DATA_DIR on a random port. Unit tests use stub fetch |
| 04-02 | No re-POST without reading the collection and adopting first | test | Enforced: handler tests ("after an add that timed out ... adopts the copy without a second POST") and verify steps (d) and (e) |
| 04-02 | No silent link to a copy the owner added by hand | test | Enforced: `pickAdoptable` uses the snapshot and the time guard, and a held copy goes to the owner. Step (f) |
| 04-03 | No add control other than the card's Add button | judgment | Flagged (non-authoritative verdict: holds). `AddToCollectionButton` is rendered only in candidate-list.tsx. Unverified prohibition, human review recommended (see Human Verification) |
| 04-04 | No second copy unless the owner chose "Add another copy" | test | Enforced for the local and remote checks (steps g and i). WR-04 is the clock-skew exception |
| 04-08 | Not on Discogs never deletes or hides the disc | test | Enforced by not-on-discogs tests |
| 04-09 | Retry all failed never adds anything the owner didn't confirm | test | Enforced by the retry-failed route test |
| 04-11 | No DELETE, PUT or PATCH, and no other POST | test | Enforced: `isAllowed` plus the client.test.ts stub-fetch tests |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/server/imports/store.ts` | ✓ VERIFIED | Real transactions (IMMEDIATE), no stubs. Called from 5 routes |
| `src/server/jobs/handlers/add-to-collection.ts` | ✓ VERIFIED | Registered in handlers/index.ts:32 |
| `src/server/discogs/client.ts` (write gate) | ✓ VERIFIED | `isAllowed` widened by the one anchored add path only |
| `src/server/discogs/collection.ts` | ✓ VERIFIED | Pure adopt and foreign rules, used by the handler |
| `src/server/imports/recovery.ts` | ✓ VERIFIED | Wired as the maintenance hook |
| `src/lib/review-status.ts`, `src/server/scan/queries.ts` | ✓ VERIFIED | Feed `/api/spines`, which feeds spines-view |
| Routes: import (POST/DELETE), retry, retry-failed, not-on-discogs, link-existing, another, folders | ✓ VERIFIED | Each one is called from a component |
| UI: ReviewStatusFilter, RetryAllFailedButton, SpineActionMenu, NotOnDiscogsLine, AddToCollectionButton, ConfirmedMatch, AlreadyInCollection, DuplicateImportDialog, ImportStateBadge, CollectionFolderField | ✓ VERIFIED (wired) | Every one is rendered by a parent component |
| `drizzle/0003_import_review.sql` | ✓ VERIFIED | Verify step (a) found 4 migrations and both unique indexes |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| add-to-collection-button.tsx | POST /api/spines/{id}/import | fetch with `{candidateId}` | WIRED |
| confirmed-match.tsx | DELETE /import, POST /retry | fetch | WIRED |
| already-in-collection.tsx | /import/link-existing, /import/another | fetch | WIRED |
| spine-action-menu.tsx | /not-on-discogs | fetch | WIRED |
| retry-all-failed-button.tsx | /api/spines/retry-failed → retrySpine | fetch | WIRED |
| import route | createImport → enqueueImport → jobs | IMMEDIATE tx | WIRED |
| worker | runAddToCollection | handlers/index.ts | WIRED |
| handler | discogsFetch POST add-to-folder | isAllowed gate | WIRED |
| spines-view | /api/spines → reviewStatus/byStatus | TanStack Query, polled through `spinesRefetchInterval` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Status filter counts | `counts.byStatus` | `getSpines` SQL over spines, imports and searches | Yes | ✓ FLOWING |
| Card import panel/badge | `spine.import` | `imports` row + job status → `toImportDto` | Yes | ✓ FLOWING |
| Add button folder label | `discogs.folder` | settings table, through `getCollectionFolderId` | Yes | ✓ FLOWING |
| Header status | `discogs.imports {left, failed}` | jobs and imports SQL (status.ts:40) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 4 core unit files (handler, store, client, collection, review-status, import-view, queries, merge, orphans, recovery, not-on-discogs, import, retry and retry-failed routes) | `pnpm exec vitest run <14 files>` | 14 files, 348 tests passed | ✓ PASS |
| End to end against the fake Discogs: confirm, refusals, kill mid-POST, 502 after commit, already held, duplicate, link, another copy | `VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-import.ts` | Steps (a) to (i) all passed (isolated temp dir, random port, `.next/verify`) | ✓ PASS |
| Full suite and verify-review-queue | Orchestrator run this session | 1543 tests green. verify-review-queue OK | ✓ PASS (not re-run) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist, and no plan declares one. Not applicable.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| IMP-01 | 04-01, 03, 10, 12 | Explicit confirm before any add | ✓ SATISFIED | SC1 evidence. Single enqueue site |
| IMP-02 | 04-01, 06, 10, 11 | Chosen folder, default Uncategorized | ✓ SATISFIED | `getCollectionFolderId`, folder select, step (c) folder 1 |
| IMP-03 | 04-02, 04, 13 | Warn on already-in-collection or already-imported | ✓ SATISFIED | SC2 evidence |
| IMP-04 | 04-01, 02, 04, 07, 09, 10, 11 | Never duplicated; instance ID recorded | ✓ SATISFIED (see WR-04) | SC3 evidence |
| REV-03 | 04-05, 14 | Filter by 6 statuses with counts | ✓ SATISFIED | SC4 evidence |
| REV-04 | 04-03, 09, 12 | Retry failed without re-upload | ✓ SATISFIED | SC5 evidence |
| REV-05 | 04-07, 08 | Mark "not on Discogs" | ✓ SATISFIED | SC5 evidence |

No requirements are orphaned. All 7 IDs mapped to Phase 4 in REQUIREMENTS.md are claimed by plans.

### Anti-Patterns Found

The scan of 90 changed files found no TBD, FIXME, XXX, TODO, HACK or placeholder markers.

Open code-review findings (04-REVIEW.md), weighed against the success criteria:

| Finding | Severity here | Defeats a success criterion? | Reasoning |
|---------|---------------|------------------------------|-----------|
| CR-01: a failed-with-intent import can only exit through Retry, which POSTs | ⚠️ Warning, owner decision | No | The owner did confirm that candidate (SC1 and IMP-01 hold), and the reconcile-first retry makes no duplicate (SC3 holds). It is a gap in the recovery path: after a wrong click plus an ambiguous Discogs error, the owner cannot switch to the right release without adding the wrong one first. Escalated in Human Verification |
| WR-04: the adopt time guard plus a snapshot overwrite can re-POST for allow_duplicate imports when the local clock runs more than 2 minutes ahead of Discogs | ⚠️ Warning | Narrow edge of SC3 | Needs all three: "Add another copy", a lost answer after the POST landed, and more than 2 minutes of clock skew. The default path (allow_duplicate 0) holds the copy instead (safe). The real-account check also tests the date assumptions |
| WR-01: re-scan, Dismiss and re-attach treat failed-with-intent as closed | ⚠️ Warning | No | A copy that may have landed can drop out of the UI. A later confirm of the replacement spine is held as already-in-collection, so there is no silent duplicate |
| WR-02: an API retry on a marked spine with a failed import POSTs | ⚠️ Warning | No | The UI hides Retry for marked spines. Retry all failed excludes them (the status is not_on_discogs). Only a direct API call reaches it |
| WR-03: Mark not on Discogs is allowed on a failed-with-intent import | ⚠️ Warning | No | Mislabels a copy that may have landed. Reversible |
| WR-05: local "Add another copy" can be held again while the other spine's add is unresolved | ⚠️ Warning | No | The owner is asked twice. No duplicate |
| WR-06: an open import plus an older failed search reads Failed | ⚠️ Warning | No | Deliberate rule A-04-09. Clears once the import resolves |
| IN-01 to IN-05 | ℹ️ Info | No | — |

### Human Verification Required

1. **Real account, first import.** Click "Add to Uncategorized" on one CD you own. Expected: it appears once in Uncategorized on discogs.com, and the card says Imported.
2. **Stop the app mid-import.** Click Add on a second CD, stop the app right away, then start it again. Expected: that CD is on discogs.com exactly once, and `node scripts/report-discogs-import-live.ts` prints no warning lines.
3. **Decide on CR-01.** Fix it now with a "check only" exit for failed adds, or accept it for this phase.
4. **Long folder name on the Add button** at normal and phone width. Expected: it cuts off neatly and hovering shows the full name.
5. **Card buttons at phone width** in the Waiting, Already-in-collection and Import-failed states. Expected: the buttons wrap, and the cover keeps its size.
6. **Already-in-collection message** with a long folder name at phone width. Expected: it wraps and stays readable.
7. **Duplicate warning** with a very long photo file name. Expected: the title wraps, the captions stop at two lines, and hovering shows the full name.
8. **Photo header at phone width.** Expected: "{i} / {n} imported" stays visible.
9. **Only Add adds.** Row clicks, the keyboard and the Search Discogs results never add anything.

### Gaps Summary

No truth failed, and all five roadmap success criteria hold in code. Tests and two isolated end-to-end runs back them, including a real SIGKILL mid-POST and a 502 after commit. All seven requirement IDs are satisfied. The phase is held at human_needed for two reasons:

- **The owner's real-account check** (A-04-22). It is the only proof against the real Discogs, and five visual checks need human eyes.
- **An owner decision on CR-01.** It does not break a stated criterion, but it is an unwanted-write trap in a rare recovery path.

WR-01 to WR-06 are recovery-edge weaknesses around "failed after the intent was written". One root cause covers WR-01 and WR-03: there is no shared "may have reached Discogs" predicate. Fixing CR-01, WR-01 and WR-03 together is the natural follow-up.

---

_Verified: 2026-10-22T11:49:53Z_
_Verifier: Claude (gsd-verifier)_
