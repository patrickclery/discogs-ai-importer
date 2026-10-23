---
phase: 04-import-review-queue
plan: 14
subsystem: ui
tags: [nextjs, react, vitest, sqlite, review-queue, empty-states]

requires:
  - phase: 04-import-review-queue
    provides: "Plan 04-05 getSpines read model (counts.byStatus, statusById, photoProgress, discogsActive), leftCount, useStatusFilter"
  - phase: 04-import-review-queue
    provides: "Plan 04-10 SpinesResponse.discogs.folder and the ImportUi folder name"
provides:
  - "Page description '{n} spines from {m} photos · {i} imported · {l} left' with the l = 0 'every spine is imported or marked' variant"
  - "Photo section sub-line '{i} / {n} imported · {model} · scanned {time}' via sectionSubline(photo, now, progress)"
  - "filterEmptyOf(status, review, shown) and six per-status empty states plus the combined status + Needs review state"
  - "Status-row loading skeleton on /spines"
  - "src/server/scan/queries.test.ts pinning getSpines counts, photoProgress, order, empty case and discogsActive"
affects: [04-verification, 04-uat]

actuals:
  tokens: 6200
  tasks: 2
  commits: 4
plan_head_before: a5a29c44e5874aad87026ac0490ee3091a5bf17d
plan_head_after: d0e9500e083760286f8fd47ad2cac4826a4f4628

tech-stack:
  added: []
  patterns:
    - "Pure empty-state chooser (filterEmptyOf) in src/lib, copy and icons in a STATUS_EMPTY table in the view"
    - "Read-model characterization tests seed imports and jobs with direct SQL on top of orphanScenario/foreignCandidate"

key-files:
  created:
    - src/server/scan/queries.test.ts
    - src/components/photo-section.test.ts
  modified:
    - src/components/photo-section.tsx
    - src/components/spines-view.tsx
    - src/lib/review-status.ts
    - src/lib/review-status.test.ts
    - src/app/spines/loading.tsx

key-decisions:
  - "getSpines needed no change: every count, order, empty and discogsActive case passed against Plan 04-05's implementation, so queries.test.ts pins it as characterization"
  - "The empty-state choice is a pure filterEmptyOf helper in review-status.ts so it is unit-tested; copy stays in spines-view.tsx"
  - "A done photo with orphans but no active spines shows '0 / n imported' (n counts orphans); 'No CDs found' only when it has no listed spine"

patterns-established:
  - "sectionSubline takes optional progress; error and active photos ignore it and keep the Phase 2 line"

requirements-completed: [REV-03]

coverage:
  - id: D1
    description: "Each done photo header reads '{i} / {n} imported · {model} · scanned {time}', n counting active and orphaned spines whatever the filters"
    requirement: REV-03
    verification:
      - kind: unit
        ref: "src/components/photo-section.test.ts#sectionSubline"
        status: pass
      - kind: unit
        ref: "src/server/scan/queries.test.ts#getSpines photoProgress"
        status: pass
    human_judgment: false
  - id: D2
    description: "Counts ignore the status and review filters, sum to counts.all and exclude superseded and dismissed spines"
    requirement: REV-03
    verification:
      - kind: unit
        ref: "src/server/scan/queries.test.ts#getSpines counts"
        status: pass
    human_judgment: false
  - id: D3
    description: "List order is kept under a status filter, the no-photo case gives all-zero counts, and discogsActive is true only for queued or running imports"
    requirement: REV-03
    verification:
      - kind: unit
        ref: "src/server/scan/queries.test.ts#getSpines order, empty and polling"
        status: pass
    human_judgment: false
  - id: D4
    description: "Page description shows imported and left (or 'every spine is imported or marked'), with mono numbers"
    requirement: REV-03
    verification:
      - kind: integration
        ref: "node scripts/verify-review-queue.ts"
        status: pass
    human_judgment: true
    rationale: "No test asserts the rendered description text or the mono styling; check it on /spines"
  - id: D5
    description: "Every status filter and the status + Needs review combination show their own Empty state with the right action"
    requirement: REV-03
    verification:
      - kind: unit
        ref: "src/lib/review-status.test.ts#filterEmptyOf (D-11, UI-SPEC E11)"
        status: pass
    human_judgment: true
    rationale: "The chooser is unit-tested; the rendered copy, icons and that 'Show all spines' / 'Clear filters' keep the right filters need a look in the browser"
  - id: D6
    description: "At 360 px the section sub-line truncates with a title attribute and '{i} / {n} imported' stays visible first; /spines loading shows the status-row skeleton"
    verification: []
    human_judgment: true
    rationale: "Visual layout check (UI-SPEC E4 overflow backstop, E1 loading)"

duration: 7min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 14: Progress and Per-Status Empty States Summary

**/spines now says "{i} imported · {l} left" on the page and "{i} / {n} imported" on every photo header, and each status filter (and status + Needs review) has its own empty state instead of a blank list.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-22T11:02:08Z
- **Completed:** 2026-10-22T11:09:32Z
- **Tasks:** 2
- **Files modified:** 7 source/test files (plus 2 RED evidence records)

## Accomplishments
- The page description reads `{n} spines from {m} photos · {i} imported · {l} left. Changes save when you leave a field.`, with `· every spine is imported or marked` when l = 0 and n > 0. The numbers are mono and pluralized.
- Done photo headers lead with `{i} / {n} imported`, from `data.photoProgress`, with a `title` on the truncated line.
- Six per-status Empty states (Pending, Matched, Imported, Not found, Not on Discogs, Failed) use UI-SPEC copy and icons, with `Show all spines`. The Imported body names the import folder. Status + Needs review shows `No spines match these filters` with `Clear filters`.
- `/spines` loading shows an `h-9 w-full max-w-3xl` status-row skeleton above the `h-9 w-80` one.
- `queries.test.ts` pins getSpines: photoProgress, counts ignoring filters, the exclusion of superseded and dismissed spines, order under a filter, the empty case and discogsActive.

## Task Commits

1. **Task 1 (tracer): progress on the page and every photo header**
   - RED `adf8251` (test)
   - GREEN `7fbdebd` (feat)
2. **Task 2: per-status empty states, order and the loading skeleton**
   - RED `a957e19` (test)
   - GREEN `d0e9500` (feat)

## TDD Gate Compliance

- **Task 1 RED:** `src/components/photo-section.test.ts > sectionSubline > leads a done photo with its imported progress` failed on its assertion. Actual was `40 spines · …` and expected was `12 / 40 imported · …`. TAP evidence returned `RED_EVIDENCE_OK` (`tdd-evidence/04-14-task1-red.json`). Semantic check: the target executed and failed because sectionSubline ignored progress. The getSpines cases passed at RED because Plan 04-05 already implements them, so they act as characterization tests.
- **Task 2 RED:** `filterEmptyOf > uses the combined state when Needs review is also on` failed on its assertion against a stub that returns null. The first run used a missing symbol, which gave a TypeError rather than an assertion failure, so a typed stub was added. Vitest's tap-flat multi-line diffs were rejected as malformed TAP, so the run was repeated with the JUnit reporter. That returned `RED_EVIDENCE_OK` (`tdd-evidence/04-14-task2-red.json`).
- **GREEN:** each feat commit makes its target pass. No REFACTOR commits were needed.

## Files Created/Modified
- `src/server/scan/queries.test.ts`: getSpines counts, photoProgress, order, empty and discogsActive cases.
- `src/components/photo-section.test.ts`: sectionSubline progress cases and the Phase 2 fallbacks.
- `src/components/photo-section.tsx`: `sectionSubline(photo, now, progress?)`, the `PhotoProgress` type, the `progress` prop and the sub-line `title`.
- `src/components/spines-view.tsx`: the imported/left description, `photoProgress` passed to each section, the `STATUS_EMPTY` table, `FilterEmptyState` and the combined empty state.
- `src/lib/review-status.ts` / `.test.ts`: `filterEmptyOf` and `FilterEmpty`.
- `src/app/spines/loading.tsx`: the status-row skeleton.

## Decisions Made
- getSpines was left unchanged. Every behavior case passed against Plan 04-05's code, and its signature is untouched for Plan 04-09.
- The choice of empty state lives in a pure `filterEmptyOf` helper so it can be unit-tested. The acceptance greps require the copy to stay in spines-view.tsx.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing test] Added src/components/photo-section.test.ts and the filterEmptyOf tests in review-status.test.ts**
- **Found during:** Task 1 RED and Task 2 RED.
- **Issue:** The plan's only test file was queries.test.ts, and its getSpines cases already pass, so neither task had a valid RED target for its new behavior.
- **Fix:** Tested the new pure logic directly: sectionSubline in a new test file, and filterEmptyOf in the existing review-status test file.
- **Files modified:** src/components/photo-section.test.ts, src/lib/review-status.test.ts, src/lib/review-status.ts.
- **Committed in:** adf8251, a957e19, d0e9500.

---

**Total deviations:** 1 auto-fixed (missing test coverage for the TDD target).
**Impact on plan:** Two extra test files and one small pure helper. No scope creep.

## Issues Encountered
- Full-suite runs hit the known timing flakes once each: `match.test.ts` (85% pairing) and `cli.test.ts` (SIGKILL escalation). Both pass when run alone.

## Verification
- `corepack pnpm vitest run src/server/scan/queries.test.ts`: 13 passed.
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`: clean, apart from the flakes above.
- `node scripts/verify-review-queue.ts`: `verify-review-queue OK`, steps (a) to (d), rebuilt into .next/verify.
- `VERIFY_SKIP_BUILD=1 node scripts/verify-discogs-search.ts`: `verify-discogs-search OK`.

## User Setup Required
None.

## Next Phase Readiness
- Phase 4 plans are complete, and the phase is ready for verification and UAT. To check in the browser: the description and sub-line wording, empty-state copy and actions, the 360 px truncation, and the loading skeleton.

## Self-Check: PASSED

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*
