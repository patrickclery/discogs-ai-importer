---
phase: 04-import-review-queue
plan: 02
subsystem: api
tags: [discogs, exactly-once, jobs, sqlite, vitest, verify]

requires:
  - phase: 04-import-review-queue
    provides: "04-01 imports table, reconcile-first add_to_collection handler, collection rules, fake collection endpoints, verify steps (a)-(c1); 04-10 scripts/lib/import-flow.ts, read model and step (c2)"
provides:
  - "D-09 failure classes in add_to_collection for the read and the add (auth, not_found, rejected, unavailable, other; 429 defers)"
  - "src/server/imports/recovery.ts: markInterruptedImports() and INTERRUPTED_REASON, registered as a maintenance hook"
  - "foreignInstances() returns copies by ascending instance_id; A6 documented in collection.ts"
  - "fake Discogs postMode (ok, hang-after-commit, 502-after-commit, no-instance-201), postsHeld, postsByRelease"
  - "verify-discogs-import steps (d) kill mid-POST, (e) 502 after commit, (f) already in your collection"
  - "unit tables: add-to-collection.test.ts, recovery.test.ts, collection.test.ts"
affects: [04-03, 04-04, 04-11, 04-12, 04-13]

actuals:
  tokens: 16800
  tasks: 3
  commits: 5
plan_head_before: 77d02e20a45d5034840b037243d2105447e4b448
plan_head_after: 954756a460f0177c433df6483d24af3ba8abf93b

tech-stack:
  added: []
  patterns:
    - "Failure-class switch by error name with a read/add stage: terminal endings write only while the claim is current and release the dedupe key; transient ones record and rethrow"
    - "Maintenance hook as one fenced UPDATE keyed on the job's terminal status (COALESCE keeps an earlier reason)"
    - "Fake upstream answer modes that carry out the write and then lose, fail or empty the answer"

key-files:
  created:
    - src/server/imports/recovery.ts
    - src/server/imports/recovery.test.ts
    - src/server/jobs/handlers/add-to-collection.test.ts
    - src/server/discogs/collection.test.ts
    - .planning/phases/04-import-review-queue/tdd-evidence/04-02-task2-red.json
    - .planning/phases/04-import-review-queue/tdd-evidence/04-02-task3-red.json
  modified:
    - src/server/jobs/handlers/add-to-collection.ts
    - src/server/jobs/handlers/index.ts
    - src/server/discogs/collection.ts
    - test/fixtures/fake-discogs.mjs
    - scripts/lib/import-flow.ts
    - scripts/verify-discogs-import.ts

key-decisions:
  - "A 404 on the collection read (not the add) ends the import rejected, not not_found: the read answers 200 empty for an unknown release, so a read 404 is not a missing release"
  - "DiscogsAuthError with no status (no sign-in at request time, missing consumer keys) is treated like a 401: failed, auth"
  - "The record step's unique guard matches only imports.instance_id, so another constraint error is rethrown instead of failing the import"
  - "The fake's posts and postsByRelease count every add POST that recorded a copy, whatever postMode then answers; a held POST is logged with status 0"
  - "markInterruptedImports returns { failed } and stores the UI-SPEC Interrupted line only when no earlier reason exists"

patterns-established:
  - "Phase 4 verify steps drive fake failure modes through ctx.fake.control({ postMode }) and read postsByRelease per release"
  - "RED evidence for vitest is captured with --reporter=tap-flat and -t on the target test, so other failures' multi-line diffs do not break the TAP report"

requirements-completed: [IMP-04, IMP-03]

coverage:
  - id: D1
    description: "Killing the app while Discogs holds the add POST, then restarting on the same data, ends with the import imported, adopted 1, post_count 1 and exactly one copy in the fake collection"
    requirement: IMP-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(d)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 502 that Discogs answers after creating the copy is retried and the retry adopts it: one copy, adopted 1, post_count 1, job attempts 2, no username in last_error"
    requirement: IMP-04
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(e)"
        status: pass
      - kind: unit
        ref: "src/server/jobs/handlers/add-to-collection.test.ts#after an add that timed out, the retry reads once and adopts the copy without a second POST"
        status: pass
      - kind: unit
        ref: "src/server/jobs/handlers/add-to-collection.test.ts#a 201 without an instance_id records an error and the retry adopts the copy"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-09 failure classes for the read and the add: 429 defers with the status unchanged; 401/403 fail auth; 404 on the add not_found; 422 and other 4xx rejected; 5xx, network and timeout record unavailable and rethrow; terminal endings write nothing once the claim is lost"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/jobs/handlers/add-to-collection.test.ts (26 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "An import whose job failed or was cancelled while pending or importing becomes failed within one lease tick, keeping an earlier kind or setting interrupted; queued or running jobs and finished imports are untouched; a second run changes nothing"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/imports/recovery.test.ts (12 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A release with a copy no import records is held already_in_collection with zero add POSTs, existing_json ascending, the job succeeded and its dedupe key freed, and /api/spines reads already_in_collection with existing.count 1"
    requirement: IMP-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs-import.ts#(f)"
        status: pass
      - kind: unit
        ref: "src/server/jobs/handlers/add-to-collection.test.ts#a copy no import records holds already_in_collection with no POST, ascending existing_json and a released key"
        status: pass
    human_judgment: false
  - id: D6
    description: "Adopt rule boundaries: intent minus 120 000 ms adopted, minus 120 001 ms not; snapshot, recorded and unparseable or empty dates never adopted; lowest new instance wins; empty list null; foreignInstances ascending"
    requirement: IMP-03
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/discogs/collection.test.ts (22 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "No regressions: typecheck, Biome, the full unit suite and the Phase 3 search verify still pass"
    verification:
      - kind: other
        ref: "corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test (69 files, 1067 tests)"
        status: pass
      - kind: e2e
        ref: "NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-search.ts"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 02: Exactly-once under failure Summary

**The add now survives bad days. If the app is killed while Discogs holds the add, or Discogs answers 502 or an empty 201 after creating the copy, the next attempt adopts that copy instead of adding another. Every D-09 failure ends with a stored kind the card can show. An import the worker gave up on is failed by a maintenance hook within one lease tick. A release the owner already has is held with zero add POSTs.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-22T09:33:35Z
- **Completed:** 2026-10-22T09:42:19Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- The fake Discogs `postMode` can carry out an add and then hang, answer 502, or answer 201 with `{}`. Its state reports `postsHeld` and `postsByRelease`.
- Verify step (d) SIGKILLs the server mid-POST and restarts it, and the import adopts copy 5002. Step (e) gets a 502 after commit, and the retry adopts copy 5003 on attempt 2. Step (f) holds release 1002 as already_in_collection with no POST.
- `add_to_collection` maps D-09 for both the read and the add. Terminal endings check `ctx.isCurrent()` and free the dedupe key. The unique guard catches only `imports.instance_id`.
- `markInterruptedImports()` runs as the third maintenance hook.
- Unit tables cover the handler (26 tests), the hook (12) and the adopt and hold rules (22).

## Task Commits

1. **Task 1 (tracer): kill mid-add and 502 after the add each end with one adopted copy** - `192b520` (feat)
2. **Task 2: D-09 failure classes and the interrupted-import hook**
   - RED `6850390` (test)
   - GREEN `4604ff7` (feat)
3. **Task 3: already-in-collection hold and the adopt-rule boundaries**
   - RED `537fefb` (test)
   - GREEN `954756a` (feat)

## TDD Gate Compliance

| Task | RED | GREEN | Evidence |
|------|-----|-------|----------|
| 2 | `6850390` | `4604ff7` | `tdd-evidence/04-02-task2-red.json`: RED_EVIDENCE_OK. Target "a 404 on the add ends the import failed with not_found" failed on `resolves.toBeUndefined()` because the handler rethrew DiscogsNotFoundError. That is the missing not_found class. `recovery.ts` was a no-op stub in RED, so the suite loaded and failed on assertions. |
| 3 | `537fefb` | `954756a` | `tdd-evidence/04-02-task3-red.json`: RED_EVIDENCE_OK. Target "drops recorded ids and keeps the rest by ascending instance_id" failed with `'9003 9001 9002'` instead of `'9001 9002 9003'`, because `foreignInstances` kept the input order. |

No REFACTOR commits were needed.

## Files Created/Modified
- `src/server/jobs/handlers/add-to-collection.ts`: the per-attempt order and failure-class header, the stage-aware error switch, `endWith`, and `isInstanceTaken`.
- `src/server/imports/recovery.ts`: `markInterruptedImports`, `INTERRUPTED_REASON`.
- `src/server/jobs/handlers/index.ts`: the maintenance registration.
- `src/server/discogs/collection.ts`: ascending `foreignInstances` and the A6 note.
- `test/fixtures/fake-discogs.mjs`, `scripts/lib/import-flow.ts`: `postMode`, `postsHeld`, `postsByRelease`.
- `scripts/verify-discogs-import.ts`: steps (d), (e), (f).
- The three test files listed above.

## Decisions Made
See key-decisions in the frontmatter. The one with a visible effect: a 404 on the collection read ends the import as `rejected`. Only a 404 on the add means "Release not found on Discogs", because the read answers 200 empty for an unknown release.

## Deviations from Plan

None. The plan was executed as written. Task 1 step 4 ("fix anything these steps expose") needed no handler change: steps (d) and (e) passed against the Plan 04-01 algorithm unchanged.

## Issues Encountered
- Vitest's `tap-flat` reporter writes multi-line `actual`/`expected` diffs that the TAP classifier rejects as malformed. Both RED records were therefore captured with `-t` on the target test. Task 3's ordering assertion compares the ids as one string so its report stays single-line.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
- Plan 04-03 can map each stored `error_kind` (auth, not_found, rejected, unavailable, interrupted, other) to its UI-SPEC failure line.
- Plan 04-12's Retry can reopen a failed row (it keeps `intent_at` and the snapshot) and call `enqueueImport`. The handler adopts any copy that landed.
- Not yet proven on the owner's real account: the kill-mid-import check is in the manual UAT row of 04-RESEARCH Validation.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*

## Self-Check: PASSED
