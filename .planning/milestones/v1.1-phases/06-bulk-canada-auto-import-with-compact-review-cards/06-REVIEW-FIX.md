---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
fixed_at: 2026-10-26T23:26:32Z
review_path: .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-REVIEW.md
iteration: 3
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-10-26T23:26:32Z
**Source review:** .planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-REVIEW.md (iteration 6, plan 06-19, six-row compact card)
**Iteration:** 3

**Summary:**
- Findings in scope: 2 (WR-01, WR-02; info items IN-01 and IN-02 were left open as instructed)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: The card's implicit `auto` column lets an unbreakable string push content past the card edge

**Files modified:** `src/components/compact-spine-card.tsx`, `src/components/compact-spine-card.test.ts`
**Commit:** 7260eba
**Applied fix:** Added `grid-cols-1` (Tailwind 4: `repeat(1, minmax(0, 1fr))`) to the compact card's class list, so its single column cannot grow past the card. A long file name or catno now wraps inside the card instead of pushing the pencil Edit button out of view. The subgrid class test now expects `grid-cols-1`, and a new test checks that it is the card's only column template.

### WR-02: The compact skipped line still points to "spine #N", but compact cards no longer show any number

**Files modified:** `src/lib/bulk-copy.ts`, `src/lib/bulk-copy.test.ts`, `src/components/compact-spine-card.test.ts`, `src/components/discogs-matches.test.ts`, `.planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-UI-SPEC.md`
**Commit:** 8d2902b
**Applied fix:** `skippedLine` (the shared copy) now names the other spine's photo and never its number:

| Case | Line |
|------|------|
| Same photo | `Already imported from another spine in this photo` |
| Other photo | `Already imported from another spine in {photo}` |
| Other photo, file name unknown | `Already imported from a spine in another photo` (new test) |
| Holder gone | `Already imported from another spine` (unchanged) |

- The demo twin (`src/demo/read-model.ts`) builds the same `skip` DTO and renders through the same `skippedLine`, so it picks up the new wording with no demo code change.
- The Detailed card uses the same line too, so the two layouts stay consistent.
- The `skip` DTO shape is unchanged. `spineNumber` is still used to tell whether the holder is known.
- The 06-UI-SPEC copy table and the E6 state row now match the new wording.
- The compact card's doc comment ("the spine number appears only in accessible names and the crop's alt text") is accurate again, so it was left as is.
- The Phase 4 duplicate-import dialog (`import-view.ts`, `Already imported from {photo}, spine #{m}`) is out of scope. It opens from the full card, which still shows `#n`.

## Verification

All gates ran in the main checkout (`workflow.use_worktrees` is `false`, so no worktree was created):
- `npx vitest run`: 129 files, 2473 tests pass
- `npx vitest run -c vitest.demo.config.ts`: 2 pass, 1 skipped
- `npx tsc --noEmit`: clean
- `npx biome check` on the changed files: clean

---

_Fixed: 2026-10-26T23:26:32Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
