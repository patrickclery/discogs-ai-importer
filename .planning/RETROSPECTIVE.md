# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1 — MVP

**Shipped:** 2026-10-23
**Phases:** 4 | **Plans:** 50

### What Was Built
- Portable local Next.js app with a durable SQLite job queue and boot-time migrations.
- One Claude vision call per shelf photo (subscription CLI), local spine crops, editable review with the AI read kept.
- Discogs OAuth, paced/429-aware search pipeline, manual search and paste-ID.
- Exactly-once confirm-to-import with duplicate / already-in-collection handling and a status-driven review queue.

### What Worked
- Real-account UAT caught what tests could not: the kill-mid-import test passed first time thanks to intent-before-POST + adopt-on-retry.
- Diagnose-then-plan gap closure: root causes from debug agents made the 04-15 fix small and precise.
- A focused code review of a gap fix found the same overflow bug in a second dialog and moved the fix to the shared primitive.

### What Was Inefficient
- A dev server started before a schema change served "page didn't load" for half a day of work; migrations only run at boot.
- Verification fingerprints went stale on earlier phases whenever later phases touched shared files, which made tooling report finished phases as incomplete.
- UAT test 3 was phrased around a code-review finding that had already been fixed, which confused the owner.

### Patterns Established
- Long, unspaced user strings: one `[overflow-wrap:anywhere]` rule plus `min-w-0` / `minmax(0,1fr)` column bounds in the shared dialog primitive.
- Tests that render the real component (renderToStaticMarkup + Radix open helper) instead of asserting exported class constants.
- Plain do/see UAT steps; owner decisions recorded as verification overrides.

### Key Lessons
1. Restart (or health-check) the dev server after any migration before UAT.
2. Write UAT checks from the current code, not from an older verification report.
3. Decide undo/recovery paths for irreversible external writes up front; the deferred undo was the first thing the owner hit.

### Cost Observations
- Model mix: mostly Opus 5.5 (orchestrator and subagents)
- Notable: re-verifying already-finished phases is expensive; scope verification to the phase being closed.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Key Change |
|-----------|--------|------------|
| v1 | 4 | Baseline: discuss → plan → execute → verify → UAT with gap closure |

### Cumulative Quality

| Milestone | Tests | Notes |
|-----------|-------|-------|
| v1 | 1606 | Real-account import UAT passed |

### Top Lessons (Verified Across Milestones)

1. (Needs a second milestone to verify.)
