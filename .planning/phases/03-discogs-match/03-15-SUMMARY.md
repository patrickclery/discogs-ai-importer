---
phase: 03-discogs-match
plan: 15
subsystem: discogs
tags: [discogs, enqueue, oauth, reconnect, sqlite, react, vitest, tdd]

requires:
  - phase: 03-discogs-match
    provides: "03-07 connect backfill (enqueueMissingSearches includeAuthFailed), 03-14 shared status rule (UNSEARCHED_STATUSES / NON_BASELINE_STATUSES), reactivated-spine.test.ts harness"
provides:
  - "Connect replay of an auth_failed latest search, even over a covering baseline (enqueueAutoSearch afterAuthFailed)"
  - "Test connection backfill on every passing test, independent of the in-memory rejection flag"
  - "showsFieldsChanged: one rule for the fields-changed notice and Search again (WR-01)"
affects: [03-verification, discogs-match, phase-04-import]

actuals:
  tokens: 10739
  tasks: 3
  commits: 6
plan_head_before: f7a266c34b47f51465920808a11a7e6c23ce3497
plan_head_after: de8c5763162a0bb7b46ba98dda3f1e69ce227e21

tech-stack:
  added: []
  patterns:
    - "Replay key: search:auto:{spineId}:{hash}:{rejectedSearchId}, distinct from the baseline's key even for identical inputs"
    - "Owner-action-only replay, re-checked inside the enqueue transaction (latest id and status)"

key-files:
  created:
    - .planning/phases/03-discogs-match/03-15-red-evidence.json
    - .planning/phases/03-discogs-match/03-15-red-evidence-task2.json
    - .planning/phases/03-discogs-match/03-15-red-evidence-task3.json
  modified:
    - src/server/discogs/enqueue.ts
    - src/server/discogs/store.ts
    - src/server/discogs/enqueue.test.ts
    - src/server/discogs/reactivated-spine.test.ts
    - src/app/api/discogs/test/route.ts
    - src/app/api/discogs/test/route.test.ts
    - src/components/discogs-matches.tsx
    - src/components/discogs-matches.test.ts
    - .planning/phases/03-discogs-match/03-UI-SPEC.md

key-decisions:
  - "03-15: CR-01 rule (a): a connect or passing Test connection replays an auth_failed latest search even when the baseline covers the inputs; key carries the rejected search id; maintenance hook never does (T-03-17)"
  - "03-15: The 03-07 test 'an auth_failed search over a done one with the same inputs is not repeated' is deliberately reversed to pin rule (a)"
  - "03-15: A passing Test connection always runs the includeAuthFailed backfill, because the rejection flag is in memory and a restart clears it"
  - "03-15: A not_searched card shows neither Fields changed nor Search again (showsFieldsChanged, WR-01)"

patterns-established:
  - "showsFieldsChanged(discogs) is the single gate for the fields-changed notice and the Search again action"

requirements-completed: [DISC-03]

coverage:
  - id: D1
    description: "After a reconnect (completeConnect), a spine whose rejected Retry repeated a covering baseline gets exactly one queued auto search, reads Queued with no failure, then its real result"
    requirement: DISC-03
    verification:
      - kind: integration
        ref: "src/server/discogs/reactivated-spine.test.ts#CR-01 auth_failed: finishing a connect looks up again a spine whose rejected Retry repeated a covering baseline"
        status: pass
      - kind: unit
        ref: "src/server/discogs/enqueue.test.ts#a connect replays an auth_failed search even when a done one already searched the same inputs (CR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A passing Test connection replays the rejected search whether or not the server still remembers the rejection; a second test queues nothing more"
    requirement: DISC-03
    verification:
      - kind: integration
        ref: "src/server/discogs/reactivated-spine.test.ts#CR-01 auth_failed: a passing Test connection looks the spine up again (WR-04)"
        status: pass
      - kind: integration
        ref: "src/server/discogs/reactivated-spine.test.ts#CR-01 auth_failed: after a restart forgot the rejection, a passing Test connection still looks the spine up again"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invariant rows: every auth_failed case (no baseline, failed/no_match covering baseline, other-inputs baseline) is never queued by the hook and queued exactly once by a connect"
    requirement: DISC-03
    verification:
      - kind: unit
        ref: "src/components/discogs-matches.test.ts#waiting its turn only when the maintenance hook will queue it"
        status: pass
    human_judgment: false
  - id: D4
    description: "WR-01: a Not searched card shows neither 'Fields changed since last search.' nor Search again"
    requirement: DISC-03
    verification:
      - kind: unit
        ref: "src/components/discogs-matches.test.ts#showsFieldsChanged: never on a not-searched card (WR-01)"
        status: pass
      - kind: unit
        ref: "src/components/discogs-matches.test.ts#matchesAction maps failed to retry and changed fields to again, except while not searched, queued or searching"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live backstop: revoke the app on discogs.com, Search again on a matched card, reconnect; the card shows Queued, Searching, then matches with no reconnect line"
    requirement: DISC-03
    verification: []
    human_judgment: true
    rationale: "Needs the owner's real Discogs account and revoking app access on discogs.com"

duration: 4min
completed: 2026-10-22
status: complete
---

# Phase 3 Plan 15: CR-01 auth_failed reconnect replay and WR-01 Summary

**Reconnecting Discogs or a passing Test connection now replays a spine's rejected (auth_failed) search even over a covering baseline, under a key that carries the rejected search's id. Not-searched cards no longer offer "Fields changed" or Search again.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-22T01:00:05Z
- **Completed:** 2026-10-22T01:04:25Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- `enqueueAutoSearch(db, spineId, { afterAuthFailed })` replays a rejected latest search. It re-checks inside its transaction that the search is still the latest and still auth_failed. The dedupe key is `search:auto:{spineId}:{hash}:{rejectedId}`.
- `enqueueMissingSearches` selects `latest_id`/`latest_status`. With includeAuthFailed, an auth_failed latest is always due. The maintenance hook still passes false (T-03-17).
- A passing Test connection always runs the includeAuthFailed backfill, so a restart that clears the in-memory flag no longer strands rejected spines.
- `showsFieldsChanged` gates both the notice line and `matchesAction`, so a Not searched card offers neither.
- The `NON_BASELINE_STATUSES` doc comment and the UI-SPEC now describe the real rules.

## Task Commits

1. **Task 1: Tracer, rejected Retry replayed after completeConnect.** RED `0c2c76f` (test), GREEN `58ebe35` (feat)
2. **Task 2: Test connection replay, with the flag on and with it lost.** RED `44bfbee` (test), GREEN `e991e19` (fix)
3. **Task 3: WR-01 and the auth_failed connect rows.** RED `9809417` (test), GREEN `de8c576` (feat)

## TDD Gate Compliance

| Task | RED evidence | Verdict | Semantic assessment |
|------|--------------|---------|---------------------|
| 1 | 03-15-red-evidence.json | RED_EVIDENCE_OK | The target failed on the card-state assertion right after completeConnect (expected queued, received failed). All setup assertions passed. |
| 2 | 03-15-red-evidence-task2.json | RED_EVIDENCE_OK | Test C failed on the card state after a passing test (received failed). Its preconditions held (flag lost, hook queued nothing, card failed/auth). Test B already passed after Task 1. |
| 3 | 03-15-red-evidence-task3.json | RED_EVIDENCE_OK | The matchesAction target failed on the WR-01 assertion (received 'again', expected null). The showsFieldsChanged test failed with the expected missing-export TypeError. The connect rows already passed after Task 1 and are now pinned. |

Each RED commit precedes its GREEN commit. Task 2's GREEN uses `fix(` instead of `feat(`. The plan-level gate is still met, because `feat(03-15)` commits exist.

## Files Created/Modified
- `src/server/discogs/enqueue.ts`: the afterAuthFailed replay, latestSearch, the replay-aware selector and `due` precheck, and JSDoc that names NON_BASELINE_STATUSES (IN-03)
- `src/server/discogs/store.ts`: the NON_BASELINE_STATUSES JSDoc only (values unchanged)
- `src/server/discogs/enqueue.test.ts`: the 03-07 again-1 test rewritten to rule (a)
- `src/server/discogs/reactivated-spine.test.ts`: CR-01 auth_failed tests A, B and C, plus the helpers (stubDiscogs, searchesOf, rejectedRetry, passTestConnection)
- `src/app/api/discogs/test/route.ts`: backfill on every passing test
- `src/app/api/discogs/test/route.test.ts`: `useTempDataDir()` on the first describe (T-03-49)
- `src/components/discogs-matches.tsx`: showsFieldsChanged, used by NoticeLine and matchesAction
- `src/components/discogs-matches.test.ts`: WR-01 tests and the connectQueues invariant rows
- `.planning/phases/03-discogs-match/03-UI-SPEC.md`: two WR-01 "Not shown while the card reads Not searched" notes

## Decisions Made
- Rule (a) was chosen as planned. The connect replays the rejected search instead of showing the older baseline result.
- **Deliberate reversal:** the 03-07 test "an auth_failed search over a done one with the same inputs is not repeated" is now "a connect replays an auth_failed search even when a done one already searched the same inputs (CR-01)". The old expectation is what kept the card saying "Reconnect Discogs" after a successful reconnect, which broke the 03-07 connect-backfill truth and the /spines alert's promise. The cost is at most one paced read per rejected spine for each owner action.

## Deviations from Plan

None. The plan was executed as written. One small note: Task 2's GREEN commit type is `fix` instead of `feat`.

## Issues Encountered
None

## Verification
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: exit 0, 64 files, 963 tests passed (956 before)
- `reactivated-spine.test.ts`: 7 passed
- All acceptance-criteria greps pass for Tasks 1 to 3. `includeAuthFailed: false` is still in handlers/index.ts.

## User Setup Required
None

## Next Phase Readiness
- Phase 3 is ready for re-verification. The completeConnect / Test connection → includeAuthFailed → covering-baseline link is now tested end to end.
- The live backstop (D5) still needs the owner's real Discogs account.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-22*

## Self-Check: PASSED
