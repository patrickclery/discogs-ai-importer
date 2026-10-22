---
phase: 04-import-review-queue
plan: 01
subsystem: api
tags: [discogs, sqlite, drizzle, jobs, exactly-once, oauth]

requires:
  - phase: 03-discogs-match
    provides: discogsFetch client and gate, discogs lane jobs, discogs_candidates, fake Discogs server, verify harness
provides:
  - imports table (imports_spine_open_idx, imports_instance_idx, imports_release_idx) and spines.not_on_discogs (migration 0003)
  - discogsFetch write gate widened by exactly the add-to-folder POST for the stored user; redactUserPath() labels
  - src/lib/import-types.ts (IMPORT_STATUSES, IMPORT_ERROR_KINDS, ExistingInstance, ImportCandidateSnapshot)
  - src/server/discogs/folders.ts (getCollectionFolderId, getCachedFolders, collectionFolderName)
  - src/server/discogs/collection.ts (schemas, path builders, pickAdoptable, foreignInstances, toInstances)
  - src/server/imports/store.ts (createImport, enqueueImport, getImport, ADD_TO_COLLECTION_JOB_TYPE)
  - add_to_collection handler (read, adopt or hold, fenced intent, POST, record) registered at 90 s
  - POST /api/spines/{id}/import (candidateId only)
  - fake Discogs collection endpoints (folders, collection releases, add POST; state collection and posts)
  - scripts/verify-discogs-import.ts with setup helpers and steps (a), (b), (c), (c1)
affects: [04-02, 04-03, 04-06, 04-10, 04-11, 04-12]

actuals:
  tokens: 27700
  tasks: 2
  commits: 2
plan_head_before: 3dfc58ef32ec267e8b5b0cde679536653598e8c8
plan_head_after: e483e0ef82ff8026e876d2a10985069f1ca30cd9

tech-stack:
  added: []
  patterns:
    - "Reconcile-first external write: every attempt GETs the owner's copies, adopts a landed POST, holds on a foreign copy, then writes a claim-fenced intent before the one POST"
    - "Username-bearing Discogs paths are labelled /users/:u/ in every error message"
    - "Partial unique index as the race-proof backstop behind an IMMEDIATE-transaction check"

key-files:
  created:
    - drizzle/0003_import_review.sql
    - drizzle/meta/0003_snapshot.json
    - src/lib/import-types.ts
    - src/server/discogs/folders.ts
    - src/server/discogs/collection.ts
    - src/server/imports/store.ts
    - src/server/jobs/handlers/add-to-collection.ts
    - src/app/api/spines/[id]/import/route.ts
    - scripts/verify-discogs-import.ts
  modified:
    - src/server/db/schema.ts
    - drizzle/meta/_journal.json
    - src/server/discogs/client.ts
    - src/server/jobs/handlers/index.ts
    - test/fixtures/fake-discogs.mjs

key-decisions:
  - "The add POST is allowed only with auth 'oauth' and when the path's username segment equals encodeURIComponent(stored username); otherwise it is refused before fetch"
  - "enqueueImport opens its own IMMEDIATE transaction, which becomes a savepoint when called inside createImport's"
  - "Before Plan 04-02, every non-429 request error is recorded on the imports row (error_kind unavailable or other) and rethrown; terminal ends (removed, auth, already_in_collection) release the job's dedupe key"
  - "A unique-index violation when recording a POSTed instance id fails the import instead of retrying (a retry could POST again)"
  - "The fake Discogs answers 403 to a collection path naming another username, for GET and POST"

patterns-established:
  - "Import verify helpers (startImportStack with restart, connectAndScan, confirm, waitImport, importRow, withWritableDb) sit at the top of scripts/verify-discogs-import.ts, step-independent, for Plan 04-10 to move"

requirements-completed: [IMP-01, IMP-02, IMP-04]

coverage:
  - id: D1
    description: "Migration 0003 applies at boot: imports table with both partial unique indexes and spines.not_on_discogs; 4 migrations recorded"
    requirement: IMP-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(a)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Confirming one candidate adds exactly one copy of that release to folder 1 after one read of the owner's copies; the row records instance id, folder, intent and post_count 1"
    requirement: IMP-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each import records the folder from getCollectionFolderId() (default 1, Uncategorized)"
    requirement: IMP-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c) folder_id 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two confirms sent at once make one import; every other confirm (415, three 400 bodies, 404 no_candidate twice, 409 already_confirmed twice, 409 not_on_discogs) writes no row, job or add"
    requirement: IMP-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No stored job or import error contains the Discogs username; Phase 2 and 3 flows still pass"
    requirement: IMP-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c) leak check"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-search.ts"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 01: Confirm-to-collection tracer Summary

**One confirmed candidate becomes one add_to_collection job that reads the owner's copies, writes a claim-fenced intent and sends the app's single Discogs write (the add-to-folder POST), recording the instance id. Migration 0003 adds the imports table with partial unique indexes.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-22T09:06:43Z
- **Completed:** 2026-10-22T09:14:27Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Migration 0003, which only adds things: an `imports` table with `imports_spine_open_idx` (one non-failed import per spine), `imports_instance_idx` and `imports_release_idx`, plus `spines.not_on_discogs`. The live `data/app.db` was backed up read-only to `data/backups/app-before-0003.db` first.
- The write gate in `discogsFetch` now allows one more request: POST to `/users/{stored user}/collection/folders/{>=1}/releases/{>=1}`, signed with the stored sign-in. Every other non-GET request is refused before fetch, and error labels write the username as `:u`.
- The `add_to_collection` handler runs the reconcile-first algorithm. Each attempt reads the owner's copies, then either adopts a POST that already landed or holds when a copy exists that no import created. Only after that does it write an IMMEDIATE intent fenced on the job claim, send the POST and record the instance.
- `POST /api/spines/{id}/import` accepts only `{ candidateId }` and resolves the release id from that spine's own candidate row. It answers 201, 404 (`not_found`/`no_candidate`) or 409 (`not_connected`/`not_importable`/`not_on_discogs`/`already_confirmed`).
- The fake Discogs server now has a collection: a folder list, a list of copies per release (with a 422 for release 0), and the add POST (403 for another user, 422 for folder 0, 404 for out-of-range ids). Its state reports `collection` and `posts`.
- `scripts/verify-discogs-import.ts` covers steps (a), (b), (c) and (c1) end to end.

## Task Commits

1. **Task 1: Tracer: a confirm adds exactly one copy and records its copy number** - `8aacb92` (feat)
2. **Task 2: Confirm refusals, and two confirms sent at once make one import** - `e483e0e` (test)

## Files Created/Modified
- `src/server/db/schema.ts`: imports table, ImportRow, spines.notOnDiscogs
- `drizzle/0003_import_review.sql`, `drizzle/meta/*`: generated migration
- `src/lib/import-types.ts`: client-safe status, error-kind and snapshot contracts
- `src/server/discogs/client.ts`: add-to-folder allowlist, `redactUserPath()`, new refusal text
- `src/server/discogs/folders.ts`: folder setting getters (default 1, fallback for a vanished folder)
- `src/server/discogs/collection.ts`: collection schemas, path builders, adopt and foreign rules
- `src/server/imports/store.ts`: createImport / enqueueImport / getImport
- `src/server/jobs/handlers/add-to-collection.ts`, `index.ts`: handler and its registration (90 s)
- `src/app/api/spines/[id]/import/route.ts`: confirm route
- `test/fixtures/fake-discogs.mjs`: fake collection
- `scripts/verify-discogs-import.ts`: setup helpers and steps (a) to (c1)

## Decisions Made
See key-decisions in the frontmatter. In short, the add POST is allowed only for the stored user and only with oauth auth. Request errors other than a 429 are recorded and rethrown until Plan 04-02 adds the D-09 classes. A duplicate instance id at record time fails the import rather than retrying.

## Deviations from Plan

None. The plan was executed as written. One note on Task 2's "a confirm of its second candidate": TR-201 has only one candidate in the fake, so step (c1) uses another spine's listed candidate for that check. The already_confirmed check runs first, so the 409 is the same either way.

## Issues Encountered
- The acceptance grep `collection/folders` in client.ts found only the regex, which is written with escaped slashes. I added the literal path to the regex's doc comment before committing Task 1.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-02 can add the D-09 failure classes, the interrupted maintenance hook and the crash, timeout and 5xx proofs on top of `runAddToCollection` and `startImportStack().restart()`.
- Plan 04-10 can move the setup helpers into `scripts/lib/import-flow.ts` unchanged.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
