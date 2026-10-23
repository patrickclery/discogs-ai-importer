---
phase: 02-shelf-scan
plan: 14
subsystem: ui
tags: [react, spine-field, autosave, escape, vitest, gap-closure]

requires:
  - phase: 02-shelf-scan
    provides: SpineField blur autosave (D-08) and edit persistence (D-10) from 02-09
provides:
  - createFieldCommit per-field deferred blur commit that Escape cancels in either event order
  - SpineField wired to the controller, skip-next-blur flag removed
  - Unmount flush so a pending blur save is never dropped
affects: [phase-02-verification, spine-review]

actuals:
  tokens: 2700
  tasks: 2
  commits: 4
plan_head_before: 6affbacf7df8321039e520bf629f4b09eadd20d8
plan_head_after: 1876181d502662758d788e13509e3d5a1e648afe

tech-stack:
  added: []
  patterns:
    - "Deferred blur commit: blur schedules setTimeout 0; Escape blurs, cancels, resets; nothing stays armed"

key-files:
  created:
    - src/lib/field-commit.ts
    - src/lib/field-commit.test.ts
    - .planning/phases/02-shelf-scan/tdd-evidence/02-14-task1-red.json
    - .planning/phases/02-shelf-scan/tdd-evidence/02-14-task2-red.json
  modified:
    - src/components/spine-field.tsx

key-decisions:
  - "Field blur commits are deferred with setTimeout 0 so an Escape in the same dispatch cancels them whichever of blur and keydown arrives first (G-02-5)"
  - "A pending field save is flushed on unmount (useEffect cleanup) rather than dropped"

patterns-established:
  - "createFieldCommit: per-instance closure state via useState initializer, no module-level state"

requirements-completed: [REV-02]

coverage:
  - id: D1
    description: "Escape restores the saved value and sends no save in keydown-first and blur-first order, including a second Escape"
    requirement: REV-02
    verification:
      - kind: unit
        ref: "src/lib/field-commit.test.ts#createFieldCommit: Escape (G-02-5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A click-away after an Escape saves the typed value (no stale flag swallows it); click-away, Enter and refocus each save exactly once"
    requirement: REV-02
    verification:
      - kind: unit
        ref: "src/lib/field-commit.test.ts#blur-first: a click-away after an Escape saves the typed value (attempt 4)"
        status: pass
      - kind: unit
        ref: "src/lib/field-commit.test.ts#createFieldCommit: saving on blur (D-08)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A save pending when the field unmounts is sent once"
    requirement: REV-02
    verification:
      - kind: unit
        ref: "src/lib/field-commit.test.ts#createFieldCommit: flush on unmount (D-08)"
        status: pass
    human_judgment: false
  - id: D4
    description: "UAT test 5 re-run in the real browser with the capture-phase blur snippet: Escape restores without PATCH, click-away persists with Edited, Enter/Ctrl+Enter, Revert and Undo revert still work"
    requirement: REV-02
    verification: []
    human_judgment: true
    rationale: "Real DOM event ordering and the Network tab cannot be exercised in the node Vitest environment (no DOM library allowed); plan's human-check runs at end-of-phase verification"

duration: 3min
completed: 2026-10-20
status: complete
---

# Phase 02 Plan 14: Escape-safe field commit (G-02-5) Summary

**SpineField blur saves now go through a per-field deferred commit (createFieldCommit) that Escape cancels whether blur or keydown arrives first, with no skip flag to swallow a later save, and a pending save is flushed on unmount.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-20T08:28:03Z
- **Completed:** 2026-10-20T08:31:06Z
- **Tasks:** 2
- **Files modified:** 5 (3 source, 2 evidence records)

## Accomplishments
- `createFieldCommit()`: `blur(commit)` schedules with `setTimeout 0`; `escape(blurInput, reset)` blurs, cancels, resets and leaves nothing armed; `focus()` drops a same-task pending commit; `flush()` sends a pending commit once
- SpineField uses one controller per field (`useState(createFieldCommit)`); `skipCommit` is gone; Enter and Ctrl/Cmd+Enter still save through `blur()`
- `useEffect` cleanup flushes the controller so a card removed in the same task as its blur still saves
- 13 ordering tests reproduce the four debug-session attempts in both event orders

## Task Commits

1. **Task 1 (tracer): Escape cancels in either order** - RED `0c81887` (test), GREEN `7868087` (feat)
2. **Task 2: flush on unmount** - RED `8101e06` (test), GREEN `1876181` (feat)

## TDD Gate Compliance

- **RED (Task 1):** `corepack pnpm exec vitest run src/lib/field-commit.test.ts --reporter=tap-flat`; classifier `RED_EVIDENCE_OK` (`target_test_failed`, 9 tests, 5 failing). Semantic assessment: the target (blur-first Escape, attempt 1) failed on its assertion (`expected 'Brave And CrazyAAA' to be ''`) against a skeleton that reproduces SpineField's skip-next-blur flag; attempt 4 shows the dropped click-away save. Record: `.planning/phases/02-shelf-scan/tdd-evidence/02-14-task1-red.json`.
- **GREEN (Task 1):** `7868087`, 9/9 pass; typecheck and lint clean. Tracer gate (auto mode): verify re-run, passed.
- **RED (Task 2):** same command; `RED_EVIDENCE_OK` (13 tests, 2 failing). Target (flush after blur) failed on `expected '' to be 'Brave And CrazyZ'` against a no-op `flush()` stub. Record: `.planning/phases/02-shelf-scan/tdd-evidence/02-14-task2-red.json`.
- **GREEN (Task 2):** `1876181`; full suite 500/500, lint, typecheck and build pass.
- **REFACTOR:** none needed.

## Files Created/Modified
- `src/lib/field-commit.ts` - deferred, Escape-cancellable, flushable blur commit
- `src/lib/field-commit.test.ts` - fake-input harness wired like SpineField; ordering and flush regressions
- `src/components/spine-field.tsx` - controller wiring, unmount flush, skip flag removed

## Decisions Made
- Escape's blur callback captures `e.currentTarget` in a local before calling `escape()`; it runs synchronously, so it is equivalent to calling `e.currentTarget.blur()` inline.

## Deviations from Plan

**1. [Process] RED commits include a skeleton/stub module instead of a missing import**
- **Found during:** Task 1 and Task 2 RED
- **Issue:** The plan's RED fails on a missing module (Task 1) or a missing method (Task 2). Both are load/TypeError failures, which the TDD gate treats as INVALID_RED.
- **Fix:** Task 1 RED shipped a skeleton reproducing today's skip-next-blur semantics; Task 2 RED shipped a no-op `flush()`. Both tests then failed on their planned assertions, and GREEN replaced the skeleton and stub.
- **Committed in:** `0c81887`, `8101e06`

**2. [Rule 3 - Blocking] Save assertions compare a joined string, not an array**
- **Found during:** Task 1 RED
- **Issue:** Vitest's TAP reporter emits multi-line `actual:` YAML for array diffs, which the RED classifier rejects as malformed TAP.
- **Fix:** A `saved(f)` helper joins saves with ` | `, and tests assert with `toBe`. Same coverage.
- **Committed in:** `0c81887`

**Total deviations:** 2 (1 process, 1 blocking). **Impact:** none on behavior or scope.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- G-02-5 closed in code; D4 (UAT test 5 re-run with the capture-phase blur snippet) is left for end-of-phase verification.

## Self-Check: PASSED
- Files exist: src/lib/field-commit.ts, src/lib/field-commit.test.ts, both evidence records
- Commits on HEAD: 0c81887, 7868087, 8101e06, 1876181
- Acceptance: createFieldCommit export 1, in spine-field 2, skipCommit 0, flush present, useEffect 2; `pnpm test`, lint, typecheck, build exit 0

---
*Phase: 02-shelf-scan*
*Completed: 2026-10-20*
