---
phase: 04-import-review-queue
plan: 04
subsystem: api
tags: [discogs, imports, duplicates, sqlite, exactly-once, verify]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 createImport, confirm route, imports_instance_idx; 04-02 already_in_collection hold with ascending existing_json and freed dedupe key, allow_duplicate honoured by the handler; 04-10 DuplicateBody, importPhaseOf; 04-12 latestImport, enqueueImport reuse, retry route shape"
provides:
  - "createImport({ spineId, candidateId, allowDuplicate }) local duplicate check (D-04): { status: 'duplicate', photo, spineNumber, cropUrl, done }"
  - "POST /api/spines/{id}/import accepts allowDuplicate; duplicate answers 409 with the DuplicateBody"
  - "linkExisting(db, spineId): ok { importId, instanceId } | not_found | not_held | no_existing"
  - "addAnotherCopy(db, spineId): ok { importId, jobId } | not_found | not_held"
  - "POST /api/spines/{id}/import/link-existing: 200 { importId, instanceId }, 404, 409 not_held, 409 no_existing (no sign-in needed)"
  - "POST /api/spines/{id}/import/another: 201 { importId }, 404, 409 not_connected, 409 not_held"
  - "verify-discogs-import steps (g) local duplicate over an overlapping photo, (h) link existing, (i) add another copy"
affects: [04-13, 04-14]

actuals:
  tokens: 14800
  tasks: 2
  commits: 4
plan_head_before: 5bed61c325eb99808f1374bfd8f4a4b8e91f43b3
plan_head_after: 2e6356b0bc154e0feca5bdc4e03e8e0642376ddb

tech-stack:
  added: []
  patterns:
    - "Owner decision on a held import: one IMMEDIATE transaction over latestImport, the status gate, then an update on the same row (never a new row)"
    - "Local cross-spine check by release id joined to spines/photos/detections, oldest holder first, run only after the per-spine checks pass"

key-files:
  created:
    - src/app/api/spines/[id]/import/link-existing/route.ts
    - src/app/api/spines/[id]/import/link-existing/route.test.ts
    - src/app/api/spines/[id]/import/another/route.ts
    - src/app/api/spines/[id]/import/another/route.test.ts
    - .planning/phases/04-import-review-queue/tdd-evidence/04-04-task1-red.json
    - .planning/phases/04-import-review-queue/tdd-evidence/04-04-task2-red.json
  modified:
    - src/server/imports/store.ts
    - src/server/imports/store.test.ts
    - src/app/api/spines/[id]/import/route.ts
    - scripts/verify-discogs-import.ts

key-decisions:
  - "The duplicate check runs after no_candidate, so the release id comes from the spine's own candidate row; a duplicate writes nothing"
  - "duplicate names the oldest holder (created_at, id); spineNumber is detection idx + 1 and cropUrl goes through fileUrl (the /api/files allowlist)"
  - "addAnotherCopy called again while its job is still queued (allow_duplicate 1, phase waiting) returns the same job; once running, or for any import the owner did not hold, it answers not_held"
  - "linkExisting answers not_found when the spine has no import (or does not exist); the another route checks the spine exists (404) before the sign-in (409 not_connected), like the retry route"
  - "An unreadable or empty existing_json links nothing (no_existing), never a guessed copy"

patterns-established:
  - "Verify steps that span two photos look spines up by photo id (spinesOnPhoto), because spineByCatno/spineByArtist pick the first match across every photo"

requirements-completed: [IMP-03, IMP-04]

coverage:
  - id: D1
    description: "A confirm for a release another listed spine (active or orphaned) holds pending, importing, imported or already_in_collection answers duplicate with that spine's photo, #n, crop URL and done, writes nothing, and needs no Discogs request; superseded/dismissed or failed holders do not count"
    requirement: IMP-03
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#createImport local duplicate (D-04, IMP-03)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Overlapping photo end to end: 409 duplicate (shelf-2.jpg, #1, done, crop served) writes nothing; resent with allowDuplicate it becomes a second copy with its own instance id, adopted 0, post_count 1, allow_duplicate 0, never held already_in_collection"
    requirement: IMP-04
    verification:
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts#(g)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Link existing copy records the first existing_json copy no import holds with its folder, linked 1, imported_at; all recorded or unreadable gives no_existing; any other phase not_held; no import not_found; no Discogs request"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#linkExisting (Link existing copy, D-05)"
        status: pass
      - kind: integration
        ref: "src/app/api/spines/[id]/import/link-existing/route.test.ts"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts#(h)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Add another copy sets allow_duplicate 1, pending and re-enqueues the same row; a second call while queued returns the same job; the next attempt adds exactly one copy; the route needs a working sign-in"
    requirement: IMP-03
    verification:
      - kind: unit
        ref: "src/server/imports/store.test.ts#addAnotherCopy (Add another copy, D-05 remote)"
        status: pass
      - kind: integration
        ref: "src/app/api/spines/[id]/import/another/route.test.ts"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts#(i)"
        status: pass
    human_judgment: false
  - id: D5
    description: "No regressions: typecheck, Biome, the full unit suite and verify steps (a) to (f)"
    verification:
      - kind: other
        ref: "NEXT_DIST_DIR=.next/verify corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test (1474 tests)"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify node scripts/verify-discogs-import.ts (steps a to i, verify-discogs-import OK)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 04: Duplicate warnings and the already-in-collection decision Summary

**The server now refuses a second copy without the owner's word. A confirm for a release that another spine already holds answers 409 duplicate with that spine's photo, number, crop and whether it is done. The confirm goes through only when resent with allowDuplicate. A held already-in-collection import can be linked to the existing copy with no Discogs write, or turned into exactly one more copy.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-22T10:27:56Z
- **Completed:** 2026-10-22T10:40:20Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- `createImport` runs the local duplicate check (D-04) inside its IMMEDIATE transaction, after the per-spine checks. It finds the oldest import of the same release on another active or orphaned spine with status pending, importing, imported or already_in_collection. `allowDuplicate` skips the check and leaves `imports.allow_duplicate` at 0 (A-04-17).
- The confirm route's strict body accepts `allowDuplicate`, and a duplicate answers 409 with the `DuplicateBody`.
- `linkExisting` binds the held spine to the first listed copy that no import records, using that copy's folder, with `linked = 1`. `imports_instance_idx` backs the one-copy-one-spine rule.
- `addAnotherCopy` reopens the same row with `allow_duplicate = 1` and enqueues it through `enqueueImport`. The add_to_collection enqueue-site scan still passes.
- Verify steps: (g) proves the overlapping-photo duplicate and the IMP-04 adjacency, where the second spine's copy is not held because the first spine's copy is the app's own. (h) links copy 4242 with zero collection requests. (i) adds a second 1033 copy with one POST.

## Task Commits

1. **Task 1 (tracer): a duplicate confirm is refused with both spines' details and goes through with allowDuplicate**
   - RED `8e09c07` (test)
   - GREEN `8094fda` (feat)
2. **Task 2: Link existing copy and Add another copy**
   - RED `7f5c127` (test)
   - GREEN `2e6356b` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | Evidence |
|------|-----|-------|----------|
| 1 | `8e09c07` | `8094fda` | `tdd-evidence/04-04-task1-red.json`: RED_EVIDENCE_OK. The target "allowDuplicate false still answers duplicate" failed with `ok` instead of `duplicate`, because createImport had no local check yet. createImport accepted `allowDuplicate` as a type-only stub, so the suite loaded, and every new failure was an assertion. |
| 2 | `7f5c127` | `2e6356b` | `tdd-evidence/04-04-task2-red.json`: RED_EVIDENCE_OK. The target "every listed copy already recorded gives no_existing and changes nothing" failed with `not_found` instead of `no_existing`, because the store stubs answered not_found. Both routes answered 501 from stubs. Every failure was an assertion. |

No REFACTOR commits were needed. The tracer gate ran in auto mode. After Task 1 GREEN, the full verify (steps a to g) and the typecheck, lint and test suite passed, and only then did Task 2 begin.

## Files Created/Modified
- `src/server/imports/store.ts`: `duplicateOf`, `DuplicateOf`, the createImport `duplicate` result, `linkExisting`, `existingCopies`, `addAnotherCopy`
- `src/app/api/spines/[id]/import/route.ts`: `allowDuplicate` and the 409 duplicate body
- `src/app/api/spines/[id]/import/link-existing/route.ts`, `.../another/route.ts`: the two decision routes
- `src/server/imports/store.test.ts` and the two route test files: tests
- `scripts/verify-discogs-import.ts`: `scanAnotherShelf`, `spinesOnPhoto`, `waitImportSeen`, `postDecision`, steps (g), (h) and (i)

## Decisions Made
See key-decisions in the frontmatter. The one with a visible effect: a second Add another copy click while the job is still queued returns the same job (201), matching Retry. A click after the job has started answers not_held.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verify spine lookups scoped to a photo**
- **Found during:** Task 1 (step g)
- **Issue:** `spineByCatno` and `spineByArtist` return the first matching active spine across every photo, ordered only by idx. With two tracer photos, "the second shelf's TR-200 spines" and "the first shelf's held 1002 spine" were ambiguous.
- **Fix:** Added a local `spinesOnPhoto(ctx, photoId, field, value)`. The main flow now keeps the photo ids from steps (b) and (g). Steps (a) to (f) are unchanged.
- **Files modified:** `scripts/verify-discogs-import.ts`
- **Committed in:** `8094fda`, `2e6356b`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** None on behavior.

## Issues Encountered
- The unit scenario's detections have no crop files, so the duplicate test sets the other detection's `crop_path` explicitly. Step (g) checks the real crop URL and fetches it (200).
- As in earlier plans, vitest's tap-flat report breaks on multi-line object diffs. Task 2's target assertion compares `.status` as a string.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-13 can build the duplicate dialog on the 409 `duplicate` body and resend with `allowDuplicate: true`. Its Already in your collection panel can call `POST /import/link-existing` (200 or 409 `not_held` / `no_existing`) and `POST /import/another` (201 or 409 `not_held` / `not_connected`).
- Plan 04-14's read-model tests can rely on linked rows (`status imported`, `linked 1`, `post_count 0`).

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
