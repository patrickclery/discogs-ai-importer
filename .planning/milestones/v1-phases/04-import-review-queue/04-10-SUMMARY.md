---
phase: 04-import-review-queue
plan: 10
subsystem: ui
tags: [discogs, imports, read-model, sqlite, react-context, verify]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 imports table, import-types contracts, folders getters, verify-discogs-import setup helpers and steps (a)-(c1)"
provides:
  - "src/lib/import-types.ts: REVIEW_STATUSES, REVIEW_STATUS_LABELS, ImportPhase, ImportFailure, ImportDto, DuplicateBody, importPhaseOf(), canChangeMatchOf(), canRetryOf()"
  - "src/server/imports/queries.ts: importsForSpines(db, spines), toImportDto(row, { jobStatus, candidateExists, hasThumb, folderName, nameOf? })"
  - "GET /api/spines: spine.import, spine.notOnDiscogs, discogs.folder { id, name }"
  - "ImportStateBadge in the card status slot (D-10 precedence)"
  - "ImportUiProvider / useImportUi, SPINE_ACTION_EVENT, announceSpineAction()"
  - "scripts/lib/import-flow.ts: shared Phase 4 verify helpers and ImportFakeState"
  - "verify-discogs-import step (c2)"
affects: [04-02, 04-03, 04-04, 04-05, 04-08, 04-11, 04-13]

actuals:
  tokens: 12000
  tasks: 2
  commits: 2
plan_head_before: e318adf563cbd7f6446330586682ed00949acc93
plan_head_after: 74c948a83b4cb57eb7d0fa1fc33500b56025354d

tech-stack:
  added: []
  patterns:
    - "Import read model: one ROW_NUMBER query per page over json_each(@ids), LEFT JOIN jobs for the job status, LEFT JOIN the candidate for existence and thumb"
    - "Read-model defence: a pending or importing import whose job failed, was cancelled or is missing reads failed (interrupted unless an error_kind is recorded)"
    - "Card-level React context for import UI state instead of prop drilling"

key-files:
  created:
    - src/server/imports/queries.ts
    - src/components/import-state-badge.tsx
    - src/components/import-ui-context.tsx
    - scripts/lib/import-flow.ts
  modified:
    - src/lib/import-types.ts
    - src/lib/scan-types.ts
    - src/server/scan/queries.ts
    - src/components/photo-section.tsx
    - src/components/spines-view.tsx
    - scripts/verify-discogs-import.ts
    - src/lib/spine-review.test.ts

key-decisions:
  - "ImportDto.candidateId is null (and hasThumb false) once the confirmed candidate row no longer exists, so the panel falls back to 'Release {id}' as UI-SPEC says"
  - "toImportDto takes an optional nameOf for the existing copy's folder name (default collectionFolderName); importsForSpines memoizes folder names per request"
  - "An unknown stored error_kind maps to other; failure.reason is set only for kind other, cut to 160 code points with capCodePoints"
  - "Every setup helper moved to scripts/lib/import-flow.ts, including withWritableDb, fakeLog, fakeState, candidatesOf and FAKE_USERNAME, so later verify scripts import one module"

patterns-established:
  - "Phase 4 verify scripts import startImportStack and friends from scripts/lib/import-flow.ts; new fake-state fields go on ImportFakeState there"
  - "Owner actions dispatch announceSpineAction(spineId, number) after success"

requirements-completed: [IMP-01, IMP-02, IMP-04]

coverage:
  - id: D1
    description: "GET /api/spines gives the imported spine import.phase imported, its instance id, folder 1 Uncategorized and notOnDiscogs false; every other spine has import null; discogs.folder is { 1, Uncategorized }"
    requirement: IMP-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The /spines card shows the Imported badge once a confirm lands"
    requirement: IMP-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c2) /spines HTML contains Imported"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each import names its own folder (folderName from its folder_id)"
    requirement: IMP-02
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(c2) import.folderName"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pure phase, can-change-match and can-retry rules, and toImportDto failure, candidate and existing parsing"
    verification: []
    human_judgment: true
    rationale: "Plan 04-11 pins these rules with a unit table; until then only the imported path is exercised end to end"
  - id: D5
    description: "Badge look for every import phase (Waiting, Importing, Already in your collection, Import failed, Not on Discogs) and the D-10 precedence"
    verification: []
    human_judgment: true
    rationale: "Visual states; no DOM test harness exists and only the imported state is reachable in the verify run"
  - id: D6
    description: "Verify helpers moved to scripts/lib/import-flow.ts with steps (a)-(c1) unchanged and passing; Phase 2 and 3 verify scripts still pass"
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts"
        status: pass
      - kind: e2e
        ref: "VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-search.ts"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "ImportUiProvider wraps the photo sections; useImportUi defaults to Uncategorized and not connected; announceSpineAction dispatches app:spine-action"
    verification:
      - kind: other
        ref: "corepack pnpm typecheck && corepack pnpm lint; verify-discogs-import (c2) renders /spines inside the provider"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 10: Import read model and status badge Summary

**Each spine's import now shows up on `/spines`. `GET /api/spines` returns the latest import per spine: its phase, copy number, folder, candidate snapshot, failure, held copies, and whether it can be changed or retried. The card's status slot shows Imported, Waiting to import, Importing, Already in your collection, Import failed or Not on Discogs. Cards can read the folder label and connection state from a shared context, and the Phase 4 verify helpers now live in one module.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-22T09:26:00Z
- **Completed:** 2026-10-22T09:30:51Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Read-model contracts and pure rules in `src/lib/import-types.ts`. Plans 04-03, 04-04, 04-05 and 04-11 build on them.
- `importsForSpines()` reads each listed spine's latest import in one query. A pending or importing import whose job failed, was cancelled or is missing reads as failed with kind interrupted, unless a recorded error kind takes precedence.
- `getSpines` attaches `spine.import`, selects `notOnDiscogs`, and returns `discogs.folder`.
- `ImportStateBadge` replaces the search badge in the status slot. When there is no import and no mark, it falls back to the Phase 3 badge.
- `ImportUiProvider`, `useImportUi()` and `announceSpineAction()` give later plans one shared context and one owner-action event.
- `scripts/lib/import-flow.ts` holds every setup helper and `ImportFakeState`. The new verify step (c2) shows the import on `/api/spines` and on the `/spines` page.

## Task Commits

1. **Task 1: Tracer, import read model and Imported badge** - `683efc1` (feat)
2. **Task 2: Import UI context and owner-action event** - `74c948a` (feat)

## Files Created/Modified
- `src/lib/import-types.ts`: review statuses, ImportDto, DuplicateBody, phase and permission rules
- `src/server/imports/queries.ts`: latest import per spine, `toImportDto`
- `src/lib/scan-types.ts`: `SpineDto.import`, `SpineDto.notOnDiscogs`, `SpinesResponse.discogs.folder`
- `src/server/scan/queries.ts`: read-model wiring
- `src/components/import-state-badge.tsx`: status-slot badge
- `src/components/photo-section.tsx`: status slot uses `ImportStateBadge`
- `src/components/import-ui-context.tsx`: provider, hook, event
- `src/components/spines-view.tsx`: wraps the sections in the provider
- `scripts/lib/import-flow.ts`: shared verify helpers and `ImportFakeState`
- `scripts/verify-discogs-import.ts`: imports the helpers; step (c2)
- `src/lib/spine-review.test.ts`: the fixture gains the two new SpineDto fields

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

None. The plan was executed as written. The only extra edit was the SpineDto fixture in `spine-review.test.ts`, which the plan's "fix every fixture typecheck flags" step covers.

## Issues Encountered
None. Lint, typecheck and all 1007 unit tests pass.

## Verification
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: pass (66 files, 1007 tests)
- `node scripts/verify-discogs-import.ts`: steps (a), (b), (c), (c1) and (c2) print ok, then "verify-discogs-import OK" (built in `.next/verify`)
- The `ADD_TO_COLLECTION_JOB_TYPE` enqueue-site count is still 1
- `VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-search.ts` and `NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1 node scripts/verify-rescan.ts`: OK

## Known Stubs
None. `SpineDto.import` is null outside the /spines read model (`loadSpineDtos`), the same way `discogs` already works. That is by design.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-11 can pin `importPhaseOf`, `canChangeMatchOf`, `canRetryOf` and `toImportDto` with unit tables.
- Plans 04-02 and 04-05 can import `startImportStack` and the other helpers from `scripts/lib/import-flow.ts` and add fields to `ImportFakeState`.
- `discogsActive` does not yet cover queued or running import jobs. That polling rule belongs to a later plan, so a Waiting card refreshes only through the other polling triggers until then.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
