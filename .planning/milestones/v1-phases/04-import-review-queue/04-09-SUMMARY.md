---
phase: 04-import-review-queue
plan: 09
subsystem: api, ui
tags: [discogs, retry, status, header, report, sqlite, nextjs]

requires:
  - phase: 04-import-review-queue
    provides: "retrySpine per-spine rule (04-12), getSpines review statuses and counts.byStatus (04-05), imports rows and the reconcile-first add (04-02)"
provides:
  - "POST /api/spines/retry-failed: bulk retry of every failed spine under the photo filter, in /spines order"
  - "RetryAllFailedButton in /spines filter row 2 (only when Failed > 0)"
  - "GET /api/status discogs.imports { left, failed }"
  - "Header 'Adding to Discogs' wording and tooltip 'Collection — {left} being added, {failed} failed'"
  - "scripts/report-discogs-import-live.ts: read-only report of real imports with WARN lines for doubled copies"
  - "verify-review-queue steps (e) and (f)"
affects: [phase-4-verification, uat, real-account-check]

actuals:
  tokens: 12800
  tasks: 3
  commits: 5
plan_head_before: ff27369565ec35ddd7683d827ef345504b2ba54f
plan_head_after: 1fbcc5998281e5bb7b0c7f6abb949dfae69a6919

tech-stack:
  added: []
  patterns:
    - "Bulk route = loop over the per-spine store rule in list order; counts ok results only"
    - "Status counts as SQL literals (no type: 'add_to_collection' outside imports/store.ts, IMP-01 guard)"

key-files:
  created:
    - src/app/api/spines/retry-failed/route.ts
    - src/app/api/spines/retry-failed/route.test.ts
    - src/components/retry-all-failed-button.tsx
    - scripts/report-discogs-import-live.ts
    - .planning/phases/04-import-review-queue/tdd-evidence/04-09-task2-red.json
  modified:
    - src/components/spines-filter-bar.tsx
    - src/server/discogs/status.ts
    - src/server/discogs/status.test.ts
    - src/lib/status-types.ts
    - src/lib/status-text.ts
    - src/lib/status-text.test.ts
    - src/components/status-indicator.tsx
    - scripts/verify-review-queue.ts

key-decisions:
  - "04-09: Retry all failed skips a failed spine whose import is already waiting or running (failed search beside an open import, A-04-09) and does not count it as retried"
  - "04-09: imports.failed uses the card's importPhaseOf rule (a pending or importing import whose job failed, was cancelled or is missing) and leaves out spines marked not on Discogs, matching the Failed filter"
  - "04-09: RetryAllFailedButton takes photoId as a prop from SpinesFilterBar (avoids a circular import with usePhotoFilter)"
  - "04-09: the IMP-01 one-enqueue-site guard forbids type: 'add_to_collection' anywhere else; status SQL uses the literal"

patterns-established:
  - "Read-only live reports: readonly + fileMustExist, enum words masked, counts and local ids only, end line '<name> done'"

requirements-completed: [REV-04, IMP-04]

coverage:
  - id: D1
    description: "One Retry all failed request retries every failed import (on its own row) and failed search under the photo filter, in list order, and enqueues nothing while Discogs is not connected"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "src/app/api/spines/retry-failed/route.test.ts"
        status: pass
      - kind: integration
        ref: "node scripts/verify-review-queue.ts#(e)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Retry all failed never gives a spine without an imports row an add_to_collection job (T-04-37)"
    requirement: REV-04
    verification:
      - kind: unit
        ref: "src/app/api/spines/retry-failed/route.test.ts#never gives a spine without an imports row an add_to_collection job"
        status: pass
    human_judgment: false
  - id: D3
    description: "Retry all failed button: shown only when Failed > 0, Retrying… while pending, toast wording, muted not-connected line, inline error"
    requirement: REV-04
    verification: []
    human_judgment: true
    rationale: "Visual placement and the toast or inline line are UI behaviour no test renders"
  - id: D4
    description: "/api/status discogs.imports { left, failed } and the header 'Adding to Discogs' wording plus the Collection tooltip line"
    requirement: IMP-04
    verification:
      - kind: unit
        ref: "src/server/discogs/status.test.ts"
        status: pass
      - kind: unit
        ref: "src/lib/status-text.test.ts"
        status: pass
      - kind: integration
        ref: "node scripts/verify-review-queue.ts#(f)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Read-only live import report"
    requirement: IMP-04
    verification:
      - kind: other
        ref: "DATA_DIR=$(mktemp -d) node scripts/report-discogs-import-live.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real import on the owner's Discogs account lands exactly once, also when the app is stopped right after Add (A-04-22)"
    requirement: IMP-04
    verification: []
    human_judgment: true
    rationale: "Only the owner can write to their real Discogs account and look at it on discogs.com; tests only use the fake"

duration: 12min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 09: Retry all failed, import header status and live import report Summary

**One POST /api/spines/retry-failed retries every failed search and import in view through the per-spine rule. The header now reads "Adding to Discogs · {d} left" when the Discogs backlog is only imports. A read-only report flags any doubled copy before the owner checks their real account.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-22T11:11:33Z
- **Completed:** 2026-10-22T11:23:23Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- `POST /api/spines/retry-failed` takes `{ photoId? }` with a strict body and accepts JSON only. It calls `retrySpine` for each failed spine in /spines order and answers `{ retried, skipped }`. While Discogs is not connected it answers `{ retried: 0, skipped: n }` and enqueues nothing.
- `RetryAllFailedButton` sits at the right end of filter row 2 and appears only when Failed is above 0. While the request runs it shows a spinner and "Retrying…" and is disabled. On success it shows the toast "Retrying {r} failed spine(s)." and adds " {s} wait until Discogs is connected." when some were skipped. When nothing could be retried it shows the muted line "Nothing to retry until Discogs is connected.". On a request error it shows "Couldn't retry: {reason}." in red (role alert).
- `/api/status` now returns `discogs.imports { left, failed }`. The header uses the import wording only when the whole backlog is imports. The tooltip gains "Collection — {left} being added, {failed} failed" when either count is above 0.
- `scripts/report-discogs-import-live.ts` opens the database read-only and prints counts and local ids only, with WARN lines for doubled adds, copy numbers held twice and stale open imports.

## Task Commits

1. **Task 1: Tracer, Retry all failed (route, button, verify step e)** - `4542e61` (feat)
2. **Task 2: Header import wording and tooltip counts** - `48cdd3f` (test, RED), `a967dac` (feat, GREEN)
3. **Task 3: Read-only live import report** - `0267176` (feat)
4. **Fix: IMP-01 guard false positive in status SQL** - `1fbcc59` (fix)

## TDD Gate Compliance (Task 2)

- **RED:** `48cdd3f` adds the tests for `discogsStatus` imports, the `headerParts` import wording, the `headerInputs` import counts and the tooltip Collection line. The full run of both files failed 13 new tests, each on its own assertion, and 35 existing tests passed. The formal record, `tdd-evidence/04-09-task2-red.json`, covers the target test alone ("imports.failed counts a spine whose latest import failed", `expected undefined to be 1`) and the classifier returned `RED_EVIDENCE_OK`. Semantic check: the target ran and failed because the `imports` field is missing, with no load, syntax or fixture fault. The first RED attempt over both files came back INVALID_RED (`invalid_record`) because vitest's tap-flat output breaks multi-line YAML messages. I reran the single target test with a one-line assertion.
- **GREEN:** `a967dac`. Both files pass (48/48).
- **REFACTOR:** none.

## Files Created/Modified
- `src/app/api/spines/retry-failed/route.ts`: the bulk retry route.
- `src/app/api/spines/retry-failed/route.test.ts`: 7 tests covering the photo filter, list order, not connected, no import without a row, a second call and a waiting import.
- `src/components/retry-all-failed-button.tsx`: the button and `retriedToast`.
- `src/components/spines-filter-bar.tsx`: renders the button in row 2 when Failed > 0.
- `src/server/discogs/status.ts`: `IMPORTS_LEFT_SQL` and `IMPORTS_FAILED_SQL`.
- `src/lib/status-types.ts`: adds `discogs.imports`.
- `src/lib/status-text.ts`: `importsLeft`, `importsFailed` and `importsOnly`, the import wording and the Collection line.
- `src/components/status-indicator.tsx`: passes the import counts to the tooltip.
- `scripts/verify-review-queue.ts`: steps (e) Retry all failed and (f) status imports.
- `scripts/report-discogs-import-live.ts`: the read-only live import report.

## Decisions Made
- A failed search next to a waiting or running import (A-04-09) is skipped and not counted, so "a spine already waiting or running is left as it is" holds and the toast count stays honest. `retrySpine` alone would answer ok with the same job.
- `imports.failed` follows the card's `importPhaseOf` rule (a missing job also reads failed) and leaves out spines marked not on Discogs, because the marked line wins on the card and in the Failed filter.
- The button gets `photoId` as a prop from the filter bar, which reads `usePhotoFilter`. This avoids a circular import.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The status query tripped the IMP-01 one-enqueue-site guard**
- **Found during:** Plan-level verification (full `pnpm test`)
- **Issue:** `IMPORTS_LEFT_SQL` passed `type: 'add_to_collection'` as a named parameter. The guard test in `store.test.ts` treats any such text outside `imports/store.ts` as an enqueue site.
- **Fix:** Put the type into the SQL as a literal, which also follows the project's single-quoted-literal convention.
- **Files modified:** src/server/discogs/status.ts
- **Verification:** store.test.ts and status.test.ts pass (89/89).
- **Committed in:** `1fbcc59`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** A small fix to keep an existing safety guard green. No scope change.

## Issues Encountered
- The first full run failed `src/server/scan/match.test.ts`, a known timing flake. It passed when rerun alone (10/10).

## Verification
- `corepack pnpm typecheck`, `lint` and `test` all pass (the match.test flake passed on its own rerun).
- `node scripts/verify-review-queue.ts` prints "verify-review-queue OK" with steps (a) to (f).
- Phase gate: verify-discogs-import, then (with `VERIFY_SKIP_BUILD=1`) verify-review-queue, verify-discogs-search, verify-discogs-backfill and verify-rescan (`NEXT_DIST_DIR=.next/verify`). All OK.
- Read-only report against the owner's data folder (no writes, database file sizes unchanged):
  ```
  No imports yet

  report-discogs-import-live done
  ```

## Human check for the end of phase (A-04-22): your first real import lands exactly once

Nothing here was run against your real Discogs account. These steps are for you.

1. Open discogs.com and look at your collection. Note how many copies of one CD you own there (probably none, since your collection is empty today).
2. Start the app with `corepack pnpm start` and open http://localhost:3001/spines.
3. Find that CD's card and click "Add to Uncategorized".
4. When the card says Imported, look at your collection on discogs.com. You should see that CD in Uncategorized exactly once.
5. Pick a second CD and click "Add to Uncategorized". Within a second, stop the app in its terminal with Ctrl+C.
6. Start the app again with `corepack pnpm serve`.
7. Wait for the second card to say Imported, then look at discogs.com again. You should see the second CD there exactly once, even though you stopped the app in the middle.
8. In the project folder, run `node scripts/report-discogs-import-live.ts` and paste what it prints. You should see 2 imported, no WARN lines, and no names or passwords.

This also settles RESEARCH A1, A2, A4 and A5: how Discogs answers a missing release, whether an empty-body add is accepted, what an owned copy looks like, and what a successful add returns.

## User Setup Required
None. No external service configuration required.

## Next Phase Readiness
- Phase 4 plans are complete. Next is phase verification, with the real-account check above collected as a human check.

## Self-Check: PASSED
- Files found: route.ts, route.test.ts, retry-all-failed-button.tsx, report-discogs-import-live.ts, tdd-evidence/04-09-task2-red.json
- Commits found: 4542e61, 48cdd3f, a967dac, 0267176, 1fbcc59

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*
