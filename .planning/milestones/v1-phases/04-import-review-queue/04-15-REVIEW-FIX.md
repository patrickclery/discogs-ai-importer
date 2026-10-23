---
phase: 04-import-review-queue
plan: 04-15
fixed_at: 2026-10-22T18:20:00Z
review_path: .planning/phases/04-import-review-queue/04-15-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 4
skipped: 2
status: partial
---

# Phase 04 (plan 04-15): Code Review Fix Report

**Fixed at:** 2026-10-22T18:20:00Z
**Source review:** .planning/phases/04-import-review-queue/04-15-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 critical, 2 warning, 3 info)
- Fixed: 4 (CR-01, WR-01, WR-02, IN-03)
- Skipped: 2 (IN-01, IN-02, both optional per the orchestrator)

## Fixed Issues

### CR-01: The Re-scan dialog still overflows with a long photo name

**Files modified:** `src/components/ui/alert-dialog.tsx`, `src/components/rescan-button.tsx`, `src/components/rescan-button.test.ts` (new), `test/helpers/radix-open.ts` (new)
**Commit:** fea7c49
**Applied fix:**
- In the shared primitive, `AlertDialogContent` now has `grid-cols-[minmax(0,1fr)]` and `AlertDialogHeader` has `min-w-0`. No AlertDialog can widen past its box on an unspaced string.
- The Re-scan title is now `min-w-0 [overflow-wrap:anywhere]` (no `break-words`).
- `DUPLICATE_DIALOG_CONTENT_CLASS` is kept as a harmless duplicate. tailwind-merge dedupes it.
- `ui/dialog.tsx` is unchanged. Its two users (reattach and Discogs search) show no filenames in their titles.
- New render tests use a vi.mock helper that renders the Radix portals inline and forces the roots open. They failed before the fix and pass after it.

### WR-01: The tests never check that the components use the constants

**Files modified:** `src/components/duplicate-import-dialog.test.ts`, `src/components/spines-filter-bar.test.ts`
**Commit:** 41cf273
**Applied fix:**
- The tests render the real `DuplicateImportDialog` and `SpinesFilterBar` with `renderToStaticMarkup`. The filter bar renders inside `NuqsTestingAdapter`, with the Select forced open.
- They assert on the rendered `data-slot` elements. There is no jsdom or testing-library in the repo, so none was added.
- Mutation check: dropping `className={DUPLICATE_DIALOG_TITLE_CLASS}` fails the tests, and so does reverting the `photoOptionItemProps` spread to `value={p.id}` (3 failures).
- Dropping the content className no longer fails, by design. The primitive now carries the bound.

### WR-02: The cn-merge tests use hand-copied base strings

**Files modified:** same as WR-01
**Commit:** 41cf273
**Applied fix:**
- Removed the abridged-base `cn(...)` tests.
- The wrap-rule check now runs on the rendered title's class list, which includes the real AlertDialogTitle base. It uses `OTHER_WRAP_UTILITIES` in `test/helpers/radix-open.ts`.
- The SelectItem check asserts the real `*:[span]:last:flex` next to `*:[span]:last:min-w-0` on the rendered rows.

### IN-03: The same dead `[overflow-wrap:anywhere]` remains in already-in-collection

**Files modified:** `src/components/already-in-collection.tsx`
**Commit:** 48941e9
**Applied fix:** Dropped `break-words` and kept `min-w-0` plus `[overflow-wrap:anywhere]`. This is the wrapping that UAT test 6 passed with.

## Skipped Issues

### IN-01: Keyboard and touch users cannot read a truncated photo name

**File:** `src/components/spines-filter-bar.tsx:27-33,93`
**Reason:** Optional, and not trivial (it needs a Tooltip or a row layout change). The orchestrator said to skip it.
**Original issue:** The full name is only in a native `title`, which shows on mouse hover only.

### IN-02: The `title` on `role="option"` makes screen readers repeat the name

**File:** `src/components/spines-filter-bar.tsx:30`
**Reason:** Optional. Moving `title` to the inner span changes the hover area that UAT accepted. The orchestrator said to skip it.
**Original issue:** The `title` becomes the option's accessible description, so the filename may be announced twice.

## Verification

- All gates ran in the **main checkout** (`workflow.use_worktrees: false`, no worktree).
- `vitest run`: 86 files, 1606 tests, all passing.
- `tsc --noEmit`: clean.
- `biome check`: clean.

---

_Fixed: 2026-10-22T18:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
