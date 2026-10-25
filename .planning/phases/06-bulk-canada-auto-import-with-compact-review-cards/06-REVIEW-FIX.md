---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
fixed_at: 2026-10-25T23:58:00Z
review_path: .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-10-25T23:58:00Z
**Source review:** .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-REVIEW.md (iteration 4, re-review of 7537da1, 283679d, f71f40f)
**Iteration:** 2

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

Both fixes tell the cases apart with the stored outcome, not with guesses in the copy. A card names the fallback country as tried only when a fallback-country lookup returned an answer that was examined.

| How the item ended | Outcome | Line |
|--------------------|---------|------|
| Preferred answer implausible, or its pick fails the title check (no fallback request sent) | `fallback_unusable_master` | `No Canadian pressing listed for this release, used X` |
| Fallback answer implausible, or its pick fails the title check (both tried) | `fallback_country_unusable` (new) | `No Canadian or US pressing listed for this release, used X` |
| Fallback answer examined, no version from that country (a 404 counts as an answer) | `fallback_no_version` | `No Canadian or US pressing, used X` |
| Fallback lookup errored, or was never sent | `fallback_country_unchecked` (new) | `No Canadian pressing, couldn't check for US pressings, used X` |

## Fixed Issues

### WR-01: The "unusable master" line names the fallback country even when that country was never looked up

**Files modified:** `src/lib/bulk-types.ts`, `src/lib/pressing.ts`, `src/lib/bulk-copy.ts`, `src/lib/pressing.test.ts`, `src/lib/bulk-copy.test.ts`, `src/server/jobs/handlers/resolve-pressing.test.ts`, `06-UI-SPEC.md`
**Commit:** 9cde7b6
**Status:** fixed: requires human verification (outcome logic change)
**Applied fix:**
- Added the outcome `fallback_country_unusable` to `PRESSING_OUTCOMES`. The schema's `text` enum reads that constant. SQLite has no CHECK constraint on the column, so no migration was needed.
- `chooseFallbackTier` returns the new outcome for an `'unusable'` fallback answer and for a fallback-tier title-guard miss.
- `fallbackLine` reverts `fallback_unusable_master` to the one-country phrase. Only `fallback_country_unusable` uses the pair phrase.
- UI-SPEC: both fallback-line rows are amended.

**Tests:** Added a pure test that a preferred-tier guard miss or unusable answer stays `fallback_unusable_master` and that `needsFallbackLookup` is false for both. Added a job test that a Canadian title-guard miss sends exactly one request and stores `fallback_unusable_master`. The copy tests cover both outcomes. The two existing fallback-tier job tests now expect `fallback_country_unusable`.

### IN-01: A failed fallback request reads as "no pressing from either country"

**Files modified:** `src/lib/bulk-types.ts`, `src/lib/pressing.ts`, `src/lib/bulk-copy.ts`, `src/lib/pressing.test.ts`, `src/lib/bulk-copy.test.ts`, `src/server/jobs/handlers/resolve-pressing.ts`, `src/server/jobs/handlers/resolve-pressing.test.ts`, `src/demo/ops/bulk.ts`, `06-UI-SPEC.md`
**Commit:** 5bb5a4a
**Status:** fixed: requires human verification (error-handling and outcome logic change)
**Applied fix:**
- Added the outcome `fallback_country_unchecked`.
- `PressingInput.fallbackVersions` now also accepts `'failed'`. In `chooseFallbackTier`, both `undefined` (the request was never sent) and `'failed'` give `fallback_country_unchecked`. A top match whose combined country names the fallback country still gives `fallback_country`. Before this fix, `undefined` silently meant `fallback_no_version`.
- Job: the optional (fallback) request's degrade branches now return `unchecked: true`. These are a non-404 4xx, a wrong-shaped body, and a last-attempt 5xx or unknown error. The call site maps that to `'failed'`. It maps a fallback 404 to `[]`, an examined empty answer. That keeps a 404 as `fallback_no_version`, as before. The header comment was updated to match.
- Copy: `No {Canadian} pressing, couldn't check for {US pressings}, used X`. A country without a demonym reads `pressings from {country}`. There is a one-country fallback if the run has no distinct fallback country. The line is true both when the lookup errored and when it was never sent.
- Demo twin: its canned fallback lookup always answers and is always usable, so it never produces either new outcome. Its `fallback_no_version` always means an examined answer. A doc comment in `src/demo/ops/bulk.ts` now says so, and the demo renders through the same `fallbackLine`.
- UI-SPEC: added the unchecked line to the main fallback-line row and to the fallback-country copy table, and noted that "no version in either country" applies only to an answered lookup.

**Tests:** The three WR-01 degrade job tests (422, wrong shape, last-attempt 502) now expect `fallback_country_unchecked`. The 404 test still expects `fallback_no_version`. The pure tests cover `undefined`, `'failed'`, and a combined top with `'failed'`, and `[]` stays `fallback_no_version`. Copy tests cover the US, Hong Kong and no-fallback lines.

## Verification

All checks ran in the main checkout (`workflow.use_worktrees: false`, so no worktree was created):
- `npx vitest run`: 121 files, 2313 tests passed. The `cli.test.ts` timing test did not flake this run.
- `npx tsc --noEmit`: clean
- `npx biome check` on the changed source files: clean

---

_Fixed: 2026-10-25T23:58:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
