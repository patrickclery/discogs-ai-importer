---
phase: 04-import-review-queue
fixed_at: 2026-10-22T14:55:00Z
review_path: .planning/phases/04-import-review-queue/04-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 4: Code Review Fix Report

**Fixed at:** 2026-10-22T14:55:00Z
**Source review:** .planning/phases/04-import-review-queue/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, WR-01 to WR-06; Info out of scope)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Change match on a failed-with-intent import is reachable only through a Retry that POSTs the release the owner wants to drop

**Files modified:** `src/server/jobs/handlers/add-to-collection.ts`, `src/server/jobs/handlers/index.ts`, `src/server/imports/store.ts`, `src/server/imports/queries.ts`, `src/lib/import-types.ts`, `src/lib/import-view.ts`, `src/components/confirmed-match.tsx`, `src/app/api/spines/[id]/import/route.ts`, plus tests
**Commit:** 7c6fa53
**Status:** fixed: requires human verification
**Applied fix:**
- **New check job:** a new `check_import` job type runs the handler in `check` mode. It does steps 0-2 only and never POSTs:
  - It adopts a copy that landed.
  - It deletes the import when a one-page read proves nothing landed, which completes Change match.
  - Otherwise it fails `other` with `CHECK_UNSURE_REASON`.
- **DELETE route:** `cancelImport` now answers `checking` for a failed import whose intent was written. The DELETE route returns 202 `{ checking: true }`.
- **Card:** Change match stays clickable on a failed import. The card shows a "Checking your Discogs collection…" line through a new `ImportDto.checking` flag.
- **Intent timing:**
  - The intent is now written after a second gate-pause check, and after the add path is built.
  - A 429 (or the client's pre-send deferral) on the add restores the previous `intent_at`, `snapshot_json`, status and `post_count`.
- **Refused reads:** a refused read (404 or 4xx) of an import that already has an intent now fails `other` instead of `rejected`. This stops it from wrongly opening Change match.
- **Tests:**
  - Check path: nothing landed, a copy landed, more than one page, read 404, read 429, stale job.
  - Intent: a pause after the read writes no intent, and a 429 restores the intent.
  - Route: DELETE answers 202.
  - Read model: the `checking` flag.

### WR-01: Re-scan merge, Dismiss and re-attach treat a failed import with a written intent as closed, which hides a copy that may be on Discogs

**Files modified:** `src/server/imports/sql.ts` (new), `src/server/scan/merge.ts`, `src/server/scan/orphans.ts`, `src/lib/import-types.ts`, `src/components/dismiss-spine-button.tsx`, plus tests
**Commit:** 68d9707
**Status:** fixed
**Applied fix:**
- **Shared predicate:** added `importMayBeOnDiscogsSql(alias)`, which is true for anything not failed, or for a failed import with an intent and an error kind other than not_found or rejected.
- **Where it is used:** it replaces `status <> 'failed'` in the merge `keepSpine`, the re-attach `CANDIDATE` filter and the Dismiss `OPEN_IMPORT` check.
- **Client side:** the client mirror `importMayBeOnDiscogs(dto)` drives the Dismiss button.

### WR-02: retrySpine retries an import on a spine the owner marked "not on Discogs"

**Files modified:** `src/server/imports/store.ts`, `src/server/imports/store.test.ts`
**Commit:** ced3a50
**Status:** fixed
**Applied fix:** the `not_on_discogs` check now runs before the import branch, so a marked spine answers `nothing_to_retry` and nothing is enqueued.

### WR-03: Marking "not on Discogs" is allowed while a failed import may already be on Discogs

**Files modified:** `src/server/scan/not-on-discogs.ts`, `src/components/spine-action-menu.tsx`, plus tests
**Commit:** 3571ae5
**Status:** fixed
**Applied fix:** `setNotOnDiscogs` answers `import_open` when the latest import matches `importMayBeOnDiscogsSql`. `canMarkNotOnDiscogs` mirrors this through `importMayBeOnDiscogs`.

### WR-04: The adopt rule's time guard produces false negatives, and for allow_duplicate imports that means a second POST

**Files modified:** `src/server/discogs/collection.ts`, `src/server/jobs/handlers/add-to-collection.ts`, `src/server/imports/store.ts`, plus tests
**Commit:** 28af24a
**Status:** fixed: requires human verification
**Applied fix:**
- **Date filter:** `pickAdoptable` takes `complete` (pages <= 1) and skips the date filter when the read saw every copy.
- **Snapshot on retry:** a retry unions the current copies into the existing snapshot instead of overwriting it.
- **allow_duplicate:** an import with `allow_duplicate` now holds `already_in_collection`, instead of POSTing, when an unplaced copy may come from an earlier POST.
- **Add another copy:** it adds the held copies to the snapshot, so the next attempt neither re-holds nor adopts them.

### WR-05: A local "Add another copy" is held as already_in_collection while the other spine's add is still unresolved

**Files modified:** `src/server/jobs/handlers/add-to-collection.ts`, `src/server/imports/store.ts` (doc), plus tests
**Commit:** 251283d
**Status:** fixed: requires human verification
**Applied fix:**
- **Deferral:** an add with no intent of its own now defers, with no request, while another import of the same release has an intent, no instance, and a queued or running job. It runs again at that job's `run_after` + 1 s, and at least 5 s later.
- **No mutual wait:** an import with an intent never waits, so two imports cannot wait on each other.
- **No new flag:** I added no `local_duplicate` flag. The deferral alone closes the race.

### WR-06: A spine with a held or waiting import and an older failed search reads "Failed", and Retry all failed cannot clear it

**Files modified:** `src/lib/review-status.ts`, `src/lib/review-status.test.ts`, `src/app/api/spines/retry-failed/route.ts` (comment), `src/app/api/spines/retry-failed/route.test.ts` (comment)
**Commit:** fe043d0
**Status:** fixed: requires human verification
**Applied fix:**
- **Status rule:** `reviewStatusOf` treats `searchState === 'failed'` as failed only when `importPhase === null`. A held, waiting or importing import with an old failed search now reads `matched`.
- **Design decision:** this revises the earlier decision A-04-09. That decision was planned with the two-line swap, but the owner should confirm it.

## Verification

All gates ran in the **main checkout**, because `workflow.use_worktrees` is false and no worktree was created.

| Check | Result |
|-------|--------|
| `npx vitest run` (full suite) | 83 files, 1593 tests passed. The known load flakes did not trigger. |
| `node scripts/verify-discogs-import.ts` (`NEXT_DIST_DIR=.next/verify`, fake Discogs) | OK, steps a to i |
| `node scripts/verify-review-queue.ts` (`VERIFY_SKIP_BUILD=1`, same dist dir) | OK, steps a to f |
| `npx biome check` | Clean |
| `npx tsc --noEmit` | Clean |
| `tsconfig.json` after the build | Unchanged |

- **Production app:** no request went to port 3001, and the default `.next` was not rebuilt.
- **Real Discogs:** no write went to the real Discogs API. All requests used the stub `fetchImpl` or `test/fixtures/fake-discogs.mjs`.

## Notes

- **pnpm:** `pnpm` is not on PATH in this shell, so I ran the equivalent `npx` commands.
- **Commits:** commits were made with `git commit`, staging only the changed source and test files. No excluded file was staged.
- **Line numbers:** the line numbers the review cites for `collection.ts` (328, 380-395) did not match the 130-line file. The logic was the same, so I adapted the fix to the current code.
- **IN-01 overlap:** CR-01 also covers part of IN-01. The add path is built and the gate is checked before the intent, so no intent is written when no POST can be sent.

---

_Fixed: 2026-10-22T14:55:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
