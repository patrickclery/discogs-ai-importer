---
phase: 04-import-review-queue
reviewed: 2026-10-22T11:42:33Z
depth: standard
files_reviewed: 90
files_reviewed_list:
  - drizzle/0003_import_review.sql
  - drizzle/meta/0003_snapshot.json
  - drizzle/meta/_journal.json
  - scripts/lib/import-flow.ts
  - scripts/report-discogs-import-live.ts
  - scripts/verify-discogs-import.ts
  - scripts/verify-review-queue.ts
  - src/app/api/discogs/folders/route.test.ts
  - src/app/api/discogs/folders/route.ts
  - src/app/api/spines/[id]/dismiss/route.ts
  - src/app/api/spines/[id]/import/another/route.test.ts
  - src/app/api/spines/[id]/import/another/route.ts
  - src/app/api/spines/[id]/import/link-existing/route.test.ts
  - src/app/api/spines/[id]/import/link-existing/route.ts
  - src/app/api/spines/[id]/import/route.test.ts
  - src/app/api/spines/[id]/import/route.ts
  - src/app/api/spines/[id]/not-on-discogs/route.test.ts
  - src/app/api/spines/[id]/not-on-discogs/route.ts
  - src/app/api/spines/[id]/retry/route.test.ts
  - src/app/api/spines/[id]/retry/route.ts
  - src/app/api/spines/retry-failed/route.test.ts
  - src/app/api/spines/retry-failed/route.ts
  - src/app/api/spines/route.ts
  - src/app/settings/actions.test.ts
  - src/app/settings/actions.ts
  - src/app/spines/loading.tsx
  - src/app/spines/page.tsx
  - src/components/add-to-collection-button.tsx
  - src/components/already-in-collection.tsx
  - src/components/candidate-list.tsx
  - src/components/candidate-row.tsx
  - src/components/collection-folder-field.tsx
  - src/components/confirmed-match.tsx
  - src/components/discogs-card.tsx
  - src/components/discogs-matches.tsx
  - src/components/dismiss-spine-button.tsx
  - src/components/duplicate-import-dialog.tsx
  - src/components/import-state-badge.tsx
  - src/components/import-ui-context.tsx
  - src/components/not-on-discogs-line.tsx
  - src/components/photo-section.test.ts
  - src/components/photo-section.tsx
  - src/components/retry-all-failed-button.tsx
  - src/components/review-status-filter.tsx
  - src/components/spine-action-menu.test.ts
  - src/components/spine-action-menu.tsx
  - src/components/spines-filter-bar.tsx
  - src/components/spines-view.tsx
  - src/components/status-indicator.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/lib/import-types.ts
  - src/lib/import-view.test.ts
  - src/lib/import-view.ts
  - src/lib/review-status.test.ts
  - src/lib/review-status.ts
  - src/lib/scan-types.ts
  - src/lib/spine-review.test.ts
  - src/lib/status-text.test.ts
  - src/lib/status-text.ts
  - src/lib/status-types.ts
  - src/server/db/schema.ts
  - src/server/discogs/client.test.ts
  - src/server/discogs/client.ts
  - src/server/discogs/collection.test.ts
  - src/server/discogs/collection.ts
  - src/server/discogs/enqueue.test.ts
  - src/server/discogs/enqueue.ts
  - src/server/discogs/folders.test.ts
  - src/server/discogs/folders.ts
  - src/server/discogs/status.test.ts
  - src/server/discogs/status.ts
  - src/server/imports/queries.test.ts
  - src/server/imports/queries.ts
  - src/server/imports/recovery.test.ts
  - src/server/imports/recovery.ts
  - src/server/imports/store.test.ts
  - src/server/imports/store.ts
  - src/server/jobs/handlers/add-to-collection.test.ts
  - src/server/jobs/handlers/add-to-collection.ts
  - src/server/jobs/handlers/index.ts
  - src/server/jobs/queue.ts
  - src/server/scan/merge.test.ts
  - src/server/scan/merge.ts
  - src/server/scan/not-on-discogs.test.ts
  - src/server/scan/not-on-discogs.ts
  - src/server/scan/orphans.test.ts
  - src/server/scan/orphans.ts
  - src/server/scan/queries.test.ts
  - src/server/scan/queries.ts
  - test/fixtures/fake-discogs.mjs
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-10-22T11:42:33Z
**Depth:** standard
**Files Reviewed:** 90
**Status:** issues_found

## Summary

I reviewed the Phase 4 import pipeline: the add_to_collection handler, the import store, the Discogs client write gate, the queue, the re-scan merge and orphan rules, the routes and the React UI. The main exactly-once path holds up when traced. The intent is always written before the POST, the POST is fenced on the claim, and every retry reads the collection before it posts. The worker lane runs one job at a time. The write gate only allows the add path for the stored username, and every error label redacts the username.

The defects sit at the edges of that path:

- **CR-01:** an owner who wants to abandon a failed import whose POST may have landed has only one way out, Retry, and Retry adds that release to Discogs.
- **Closed-import rules:** several rules treat "failed" as "closed" even when an intent was written: the re-scan merge, Dismiss, re-attach, Mark not on Discogs and Retry on a marked spine. Each one can hide or bypass a copy that may already be on Discogs.
- **Adopt rule:** a secondary time guard in the adopt rule adds false negatives. For an "Add another copy" import, a false negative becomes a duplicate POST.

## Critical Issues

### CR-01: Change match on a failed-with-intent import is reachable only through a Retry that POSTs the release the owner wants to drop

**File:** `src/lib/import-types.ts:194-199`, `src/server/imports/store.ts:237` (createImport `retry_first`), `src/server/imports/store.ts:369-393` (cancelImport), `src/lib/import-view.ts:184`
**Issue:** After an intent is written, a failure of kind `unavailable`, `interrupted`, `auth`, `other` or `removed` makes `canChangeMatchOf` return false. The card says "Retry first. Discogs may already have added it." `createImport` also refuses a new confirm with `retry_first`. The only action left is Retry (`retrySpine` -> `retryImport`). It reconciles, and when no adoptable copy is found it writes a new intent and **POSTs the same release**. Once that succeeds the import is `imported`, and `changeMatchState` hides Change match completely (`phase === 'imported'`).

Consider the owner who confirmed the wrong candidate and got a 502 or timeout that did not land. To change the match, they are forced to write the wrong release into their Discogs collection. Afterwards no in-app path removes it or changes the match. This is an unwanted write to the owner's account, which the confirm-only design (D-01, D-02) is meant to prevent.

The same lock happens after a 429 on the POST: `writeIntent` runs before `discogsFetch` defers, so an intent is recorded even though nothing was sent (`add-to-collection.ts:285-306`, `client.ts:228-231`).

**Fix:** Add a reconcile-only path that never POSTs. For example, `DELETE /api/spines/{id}/import` on a failed-with-intent row enqueues a `reconcile_import` job (or reuses the handler with a `mode: 'check'` payload). That job runs steps 1-2 only: adopt a copy if one landed, otherwise mark the row `failed` with `error_kind = 'rejected'`-equivalent "nothing reached Discogs", which `canChangeMatchOf` then allows. Also move the intent write after the gate/pause check, so a deferral that sent nothing records no intent:
```ts
// handler, before writeIntent
const gate = deps.fetch?.gate ?? discogsGate();
if (gate.pausedUntil() !== null) throw new JobDeferredError(gate.pausedUntil()!, 'Discogs rate limit pause');
```
Clear `intent_at` in the 429 branch only when the 429 came from the POST itself, because a 429 proves Discogs did not create the copy.

## Warnings

### WR-01: Re-scan merge, Dismiss and re-attach treat a failed import with a written intent as closed, which hides a copy that may be on Discogs

**File:** `src/server/scan/merge.ts:165-174`, `src/server/scan/orphans.ts:34` (CANDIDATE), `src/server/scan/orphans.ts:138-139` (OPEN_IMPORT)
**Issue:** `keepSpine`, the re-attach `CANDIDATE` filter and `dismissSpine` all ignore imports with `status = 'failed'`. A failed import with `intent_at IS NOT NULL` and a kind other than `not_found` or `rejected` may already have created a copy (D-07 is the reason `createImport` refuses with `retry_first`). A re-scan that does not match such a spine supersedes it. Re-attach can also supersede it as a target, and Dismiss is allowed. After that, `retrySpine` answers `nothing_to_retry`, `IMPORTS_FAILED_SQL` stops counting it, and the import that may have landed disappears from the UI with no reconcile path. The replacement spine can be confirmed again. The remote hold usually catches the duplicate, but once the owner picks "Add another copy" the result is two copies.
**Fix:** Define one SQL predicate for "an import that may have reached Discogs" and use it everywhere `status <> 'failed'` is used today:
```sql
EXISTS (SELECT 1 FROM imports i WHERE i.spine_id = @id AND (
  i.status <> 'failed'
  OR (i.intent_at IS NOT NULL AND COALESCE(i.error_kind,'') NOT IN ('not_found','rejected'))))
```

### WR-02: retrySpine retries an import on a spine the owner marked "not on Discogs"

**File:** `src/server/imports/store.ts:439-481`
**Issue:** The doc comment says a spine marked not on Discogs has nothing to retry, and `not-on-discogs.ts` says "A marked spine is never imported". The code checks `not_on_discogs` only after the import branch (line 481). A marked spine with a failed latest import, which `setNotOnDiscogs` allows, therefore goes through `retryImport` and is POSTed to Discogs. The UI hides Retry for marked spines, but `POST /api/spines/{id}/retry` is not guarded.
**Fix:** Return `nothing_to_retry` before the import branch: `if (spine.not_on_discogs === 1) return { status: 'nothing_to_retry' };` placed right after the state check, or decide explicitly that the mark must be cleared first.

### WR-03: Marking "not on Discogs" is allowed while a failed import may already be on Discogs

**File:** `src/server/scan/not-on-discogs.ts:58-61`, `src/components/spine-action-menu.tsx:37`
**Issue:** The mark is refused only for `imported` or open rows. A failed row with an intent passes. The marked line then replaces the failed panel (`discogs-matches.tsx:206`), which removes the only reconcile action (Retry), and `IMPORTS_FAILED_SQL` excludes marked spines. The card says "Not on Discogs" even though the app's own POST may have added it.
**Fix:** Refuse the mark (`import_open`) when the latest import is failed with `intent_at IS NOT NULL` and `error_kind NOT IN ('not_found','rejected')`, and mirror that rule in `canMarkNotOnDiscogs`.

### WR-04: The adopt rule's time guard produces false negatives, and for allow_duplicate imports that means a second POST

**File:** `src/server/discogs/collection.ts:328, 380-395`; `src/server/jobs/handlers/add-to-collection.ts:243-306`
**Issue:** `pickAdoptable` drops a new, unrecorded copy dated before `intentAt - 120 s`. `intentAt` comes from the local clock and `date_added` from the Discogs server, so a local clock running more than 2 minutes ahead hides the copy the previous POST created. With `allow_duplicate = 0` the copy falls into the foreign hold, which is safe but misleading. With `allow_duplicate = 1` ("Add another copy"), step 3 is skipped and step 4 **overwrites `snapshot_json` with a list that includes the landed copy**, then POSTs again. That creates a duplicate copy, and the first one can never be adopted. The snapshot rule already excludes every copy that existed before the intent, so the date filter only matters for copies past page 1.
**Fix:** Drop the date filter when the snapshot covers the whole answer (`pagination.pages === 1`). Never overwrite a non-null `snapshot_json` on a retry; union the new ids into it instead. Consider holding `already_in_collection` rather than POSTing when `allow_duplicate = 1` and an unrecorded copy appeared after a previous intent.

### WR-05: A local "Add another copy" is held as already_in_collection while the other spine's add is still unresolved

**File:** `src/server/imports/store.ts:183-195` (createImport doc), `src/server/jobs/handlers/add-to-collection.ts:266-281`
**Issue:** The local duplicate path relies on "the other spine's copy is recorded, so the handler does not hold this one". If spine A's POST landed but its answer was lost (502 or timeout), A waits on backoff while spine B's job runs first (`claimNext` orders by `run_after`). B sees A's copy as foreign, has `allow_duplicate = 0`, and is held. Then A adopts the copy. The owner, who already confirmed "Add another copy" in the dialog, is asked again. "Link existing copy" then fails with "That copy is already linked to another spine."
**Fix:** When `createImport` is called with `allowDuplicate`, record that decision on the row (for example a separate `local_duplicate` flag). In the handler, count the instance ids of other open imports of the same release that have an intent as "recorded" for the foreign check, or defer B while another import of the same release is `importing`.

### WR-06: A spine with a held or waiting import and an older failed search reads "Failed", and Retry all failed cannot clear it

**File:** `src/lib/review-status.ts:36`, `src/app/api/spines/retry-failed/route.ts:57-58`, `src/server/imports/store.ts:453-479`
**Issue:** `reviewStatusOf` returns `failed` when `searchState === 'failed'`, even with an open import. Take an `already_in_collection` import: retry-all calls `retrySpine`, which takes the import branch and returns `nothing_to_retry`. The card shows only the import panel (the NoticeLine hides the search failure when an import exists), so the spine stays under the red "Failed" count with no failure shown and no action that clears it.
**Fix:** In `reviewStatusOf`, only treat `searchState === 'failed'` as failed when `importPhase === null`, or have `retrySpine` fall through to the search retry when the import is held.

## Info

### IN-01: post_count and intent_at are written when no POST is sent

**File:** `src/server/jobs/handlers/add-to-collection.ts:285-327`
**Issue:** A deferral on a paused gate, or a throw from `addToFolderPath` (folder_id < 1, empty username), happens after `writeIntent`. `post_count` then overstates the POSTs sent, and the intent blocks Change match (see CR-01).
**Fix:** Build the path and check the gate before `writeIntent`.

### IN-02: A 403 does not mark the sign-in invalid

**File:** `src/server/discogs/client.ts:271-278`; `add-to-collection.ts:177-180`
**Issue:** The handler maps a 403 to `auth` ("Reconnect Discogs"), but `markAuthInvalid()` runs only on a 401. Every queued import still spends a read and fails one by one, and the routes keep reporting connected.
**Fix:** Call `markAuthInvalid()` on a 403 when `req.auth === 'oauth'`, or make the handler do it on the `auth` mapping.

### IN-03: A secrets-file error in the pre-checks becomes a retry, then "interrupted"

**File:** `src/server/jobs/handlers/add-to-collection.ts:198-202`
**Issue:** `getDiscogsAuth()` can throw (SecretsFileError) outside any try block. The worker retries 3 times and the row ends `interrupted` ("when the app stopped"), which is the wrong copy.
**Fix:** Wrap the auth pre-check and `fail('auth', ...)` on a throw.

### IN-04: Store functions take a `db` but write through the global connection

**File:** `src/server/imports/store.ts:309-316`, `src/server/jobs/queue.ts:48-50`
**Issue:** `enqueueImport`, `cancelImport` and `retryImport` open a transaction on the `db` they are given, but `enqueue`, `releaseDedupeKey`, `cancelQueuedJob` and `getCollectionFolderId` use `getDb()`. They are atomic only because both are the same singleton in production. A test or script passing another handle silently loses atomicity.
**Fix:** Thread `db` through the queue helpers, or drop the parameter.

### IN-05: Silent fallbacks in the folder list and Retry all failed

**File:** `src/server/discogs/folders.ts:25`, `src/components/retry-all-failed-button.tsx:482-486`
**Issue:** A folder whose name is longer than 200 characters is dropped from the cache, so a saved choice of it falls back to Uncategorized with only the generic "isn't on Discogs any more" warning. Retry all failed gives no feedback when `retried = 0` and `skipped = 0` (every spine was busy or had nothing to retry).
**Fix:** Truncate long names instead of dropping the folder, and show a muted "Nothing to retry right now" line when both counts are 0.

---

_Reviewed: 2026-10-22T11:42:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
