---
phase: 04-import-review-queue
plan: 11
subsystem: testing
tags: [vitest, discogs, write-gate, read-model, tdd]

requires:
  - phase: 04-01
    provides: "discogsFetch write gate (single anchored add-to-folder pattern, username and oauth checks) and redactUserPath"
  - phase: 04-10
    provides: "importPhaseOf, canChangeMatchOf, canRetryOf and toImportDto"
provides:
  - "Stub-fetch gate table: only the add-to-folder POST (folder >= 1, stored username, oauth) and the token exchange leave the app; every other write is refused before fetch"
  - "CANARYUSER redaction canary: error text names /users/:u/, never the username"
  - "Literal rule table for importPhaseOf, canChangeMatchOf, canRetryOf over every import status x job status x intent"
  - "toImportDto mapping table: failure kinds, reason cut, interrupted defence, candidate and existing-copy parsing"
affects: [04-02, 04-03, 04-05, 04-12, phase-04-verification]

actuals:
  tokens: 6400
  tasks: 2
  commits: 2
plan_head_before: 30046fc66a65b15123c8bb06aba752c209dee950
plan_head_after: 9d40121e2ecccff1059c100b9161e5530956908e

tech-stack:
  added: []
  patterns:
    - "Literal expected-value tables (Record<status, Record<jobStatus, ...>>) rather than a re-implemented oracle"
    - "Mutation check before commit: weaken the code under test, confirm cases fail, restore"

key-files:
  created:
    - src/server/imports/queries.test.ts
  modified:
    - src/server/discogs/client.test.ts

key-decisions:
  - "No production change: every gate, redaction and read-model case passed against the 04-01 and 04-10 code, so client.ts, import-types.ts and queries.ts are untouched"
  - "Tests proven to bite by mutation instead of a RED run: widening the folder pattern or removing redaction fails 4 gate cases; dropping the missing-job defence, the rejected refusal or the interrupted kind fails 14 table cases"

patterns-established:
  - "Pinning plan: tests for already-built behaviour are committed as test(...) only and mutation-checked, with no feat commit"

requirements-completed: [IMP-04, IMP-02]

coverage:
  - id: D1
    description: "The write gate admits only the add-to-folder POST (folder 1 and above, stored username, oauth) and the token exchange; folder 0, bad ids, another user, PUT, DELETE, PATCH, HEAD and every other POST are refused before fetch; GET collection paths stay allowed"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/discogs/client.test.ts#write gate (D-06, IMP-04)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Folder 1 is accepted and folder 0 is refused before any request (IMP-02 edge)"
    requirement: IMP-02
    verification:
      - kind: unit
        ref: "src/server/discogs/client.test.ts#refuses folder 0 (All is read-only, IMP-02) before fetch is called"
        status: pass
    human_judgment: false
  - id: D3
    description: "With stored username CANARYUSER-0123, a 500 on the add POST (and a refused DELETE) throws a message with /users/:u/ and never the username"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/discogs/client.test.ts#a 500 on the add POST names /users/:u/ and never the username (canary)"
        status: pass
    human_judgment: false
  - id: D4
    description: "importPhaseOf, canChangeMatchOf and canRetryOf pinned over every import status x job status x intent, and toImportDto failure, interrupted defence, candidate and existing-copy mapping pinned"
    verification:
      - kind: unit
        ref: "src/server/imports/queries.test.ts"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 11: Write Gate and Read-Model Rule Tables Summary

**Stub-fetch gate table plus a CANARYUSER redaction canary for the one Discogs write, and a 178-case literal table that pins the import phase, Change match, Retry and row-to-card mapping rules. No production change was needed.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-22T10:20:18Z
- **Completed:** 2026-10-22T10:23:26Z
- **Tasks:** 2
- **Files modified:** 2 (both test files)

## Accomplishments
- 31 new client gate cases. The add POST to folder 1 (and 8765) with the stored username and oauth reaches the stub fetch. 22 refusal rows throw `DiscogsRequestError` with zero fetch calls: folder 0, non-numeric, negative or zero-padded folder, non-numeric, negative or 0 release, another user, the username in another case, a trailing slash, a sub-path, PUT, DELETE, DELETE of an instance, PATCH, HEAD, POST to the folders list, a folder or the profile, and the add POST with auth request, consumer or none. The add POST is also refused when no username is stored. GET on the folders list and on a collection release stays allowed.
- Canary: with username `CANARYUSER-0123`, a 500 on the add POST and a refused DELETE both name `/users/:u/`. Neither the message nor the stack contains `CANARYUSER`.
- `queries.test.ts`, 178 cases: importPhaseOf and canChangeMatchOf over 5 statuses x 6 job statuses x intent, with literal expected tables. The failed-with-intent error-kind table is pinned (only not_found and rejected free the match), and canRetryOf is true only for failed.
- toImportDto: every error_kind maps to itself and an unknown one to other. The reason is kept only for other, cut to 160 code points (astral-safe). A pending or importing row whose job is failed, cancelled or missing reads failed/interrupted unless an error_kind is recorded, in which case the recorded kind wins. Malformed, absent or wrong-shape candidate_json gives null. existing_json gives the count and the first valid copy's folder, name and date. Folder names come from the settings cache: cached name, then Uncategorized, then Folder N.

## Task Commits

1. **Task 1: Tracer, write gate and username redaction** - `6a6b408` (test)
2. **Task 2: Read-model rule and mapping table** - `9d40121` (test)

**Plan metadata:** see final docs commit

## TDD Gate Compliance

- **RED:** Both test commits passed on their first run. This plan pins behaviour that Plans 04-01 and 04-10 already shipped, and its `<action>` says to keep failing cases red *only if* any fail. None did. So no RED evidence exists. No INVALID_RED or fabricated RED was recorded.
- **Semantic assessment (substitute for RED):** I checked that the tests bite with targeted mutations of the code under test, restoring each file with `git checkout -- <file>`:
  - In `client.ts`, folder `[1-9]\d{0,9}` was changed to `\d{1,10}` and `redactUserPath` to identity. Four cases failed: folder 0, zero-padded folder, and both canary cases.
  - In `import-types.ts`, the `jobStatus === null` defence and the `rejected` refusal were removed, and in `queries.ts` interrupted was changed to other. Fourteen cases failed.
- **GREEN:** No `feat(04-11)` commit. No production code needed to change. This is a gate deviation by design for a pinning plan, not a skipped implementation.
- **REFACTOR:** None.

## Files Created/Modified
- `src/server/discogs/client.test.ts`: the `write gate (D-06, IMP-04)` describe, with the gate table, GET allowances and the CANARYUSER canary
- `src/server/imports/queries.test.ts`: the importPhaseOf, canChangeMatchOf and canRetryOf literal tables, plus the toImportDto mapping cases (temp DATA_DIR only for the folder-name settings case)

## Decisions Made
- Expected values are literal tables, not a re-implemented rule function. A test oracle that copies the rule would drift along with it.
- I added refusal rows beyond the plan's list (zero-padded id, release 0, case-variant username, trailing slash, sub-path, HEAD, folder rename, profile POST). Each is something a loosened regex or method check would let through.

## Deviations from Plan

None. The plan executed as written. The missing GREEN commit is explained under TDD Gate Compliance.

## Issues Encountered
None.

## User Setup Required
None. No external service configuration is required.

## Verification
- `corepack pnpm vitest run src/server/discogs/client.test.ts src/server/imports/queries.test.ts`: 53 + 178 passed
- `NEXT_DIST_DIR=.next/verify corepack pnpm typecheck`: clean. `corepack pnpm lint`: clean. `corepack pnpm test`: 75 files, 1435 tests passed
- The `type: ADD_TO_COLLECTION_JOB_TYPE` non-test enqueue sites still number 1
- Tracer gate (auto mode): the Task 1 verify was re-run end to end and passed before Task 2

## Next Phase Readiness
- T-04-43 is mitigated. Any widening of the write gate now fails `corepack pnpm test`.
- Plans 04-03, 04-05 and 04-12 can rely on the pinned rules. Changing a rule means changing a row in `queries.test.ts`.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
- FOUND: src/server/imports/queries.test.ts, src/server/discogs/client.test.ts
- FOUND: 6a6b408, 9d40121 (ancestors of HEAD)
