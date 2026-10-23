---
phase: 04-import-review-queue
plan: 04-15
reviewed: 2026-10-22T18:15:00Z
depth: standard
diff_range: e3ea183..f73c8a9 -- src/
files_reviewed: 4
files_reviewed_list:
  - src/components/duplicate-import-dialog.tsx
  - src/components/duplicate-import-dialog.test.ts
  - src/components/spines-filter-bar.tsx
  - src/components/spines-filter-bar.test.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 04 (plan 04-15): Code Review Report

**Reviewed:** 2026-10-22T18:15:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Both fixes are correct as far as they go. I compiled the new classes with Tailwind 4.3.3 (`@tailwindcss/node`).
- `grid-cols-[minmax(0,1fr)]` emits `grid-template-columns: minmax(0,1fr)`.
- `*:[span]:last:min-w-0` emits `:is(.… > *):is(span):last-child { min-width: 0 }`.
- `[overflow-wrap:anywhere]` is now the only overflow-wrap rule on the title.

`cn` keeps all the new tokens when merged with the real (not abridged) AlertDialogTitle and SelectItem bases.

I found no regressions in the rest of the dialog. The crop row is already `repeat(n, minmax(0,1fr))`. The `break-words` error `<p>` now wraps inside the bounded column. The footer stacks at phone width. The header's `place-items-center` on mobile is fine because the title's min-content is now tiny. All 11 new tests pass.

What is wrong:
- **The gap is not fully closed.** The Re-scan dialog shows the same photo filename in an AlertDialogTitle with the same defect, and it still overflows.
- **The new tests are weak.** They pin string constants, so they cannot detect the JSX dropping those constants. They also cannot detect the cascade problem that caused the original bug.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The Re-scan dialog still overflows with a long photo name (same root cause, not fixed)

**File:** `src/components/rescan-button.tsx:163-165` (root: `src/components/ui/alert-dialog.tsx:61`)
**Issue:** The Re-scan dialog title is `` `Re-scan ${filename}?` `` with `className="break-words"`. It renders inside a default `AlertDialogContent`, which has one implicit `auto` grid column. Its `filename` is `photo.filename` (`photo-section.tsx:303`, `photo-status-row.tsx:187`), which is the same 123-character unspaced name as UAT test 7. `overflow-wrap: break-word` does not lower min-content. So, exactly as the debug doc shows for the duplicate dialog:
- the title's min-content (about 1100px) widens the content column;
- the description and the Cancel/Re-scan buttons are pushed off the right edge of the 512px box.

Plan 04-15 patched only the duplicate dialog's call site and left the shared primitive unbounded. Any AlertDialog title or body that shows a user-controlled unspaced string has this bug.
**Fix:** Bound the column in the primitive once, and fix the title:
```tsx
// src/components/ui/alert-dialog.tsx, AlertDialogContent base
'group/alert-dialog-content fixed ... grid grid-cols-[minmax(0,1fr)] w-full ...'
// src/components/rescan-button.tsx:163
<AlertDialogTitle className="min-w-0 [overflow-wrap:anywhere]">
```
Then drop `DUPLICATE_DIALOG_CONTENT_CLASS`, or keep it as a harmless duplicate. Also check `ui/dialog.tsx` (`DialogContent`, same implicit `auto` column) for any dialog that shows filenames.

## Warnings

### WR-01: The tests never check that the components use the constants

**File:** `src/components/duplicate-import-dialog.test.ts:22-63`, `src/components/spines-filter-bar.test.ts:18-55`
**Issue:** Every dialog and select test only checks the exported string constants or the `photoOptionItemProps` return value. All 11 tests stay green if someone:
- deletes `className={DUPLICATE_DIALOG_CONTENT_CLASS}` (`duplicate-import-dialog.tsx:156`);
- deletes `className={DUPLICATE_DIALOG_TITLE_CLASS}` (`:160`);
- reverts `{...photoOptionItemProps(p)}` to `value={p.id}` (`spines-filter-bar.tsx:92`).

These are exactly the lines that fix G-04-7. The tests are close to tautological: they assert a constant equals itself (`spines-filter-bar.test.ts:28-32`).
**Fix:** Render the real components into a DOM:
- Add `// @vitest-environment jsdom` to the test file.
- Use `@testing-library/react`. Render `DuplicateImportDialog` with a non-null `duplicate` (the Radix Portal mounts into `document.body`). Assert that `[data-slot=alert-dialog-content]` contains `grid-cols-[minmax(0,1fr)]` and that `[data-slot=alert-dialog-title]` contains `[overflow-wrap:anywhere]` and does not contain `break-words`.
- For the filter, render `SpinesFilterBar` inside `NuqsTestingAdapter` with the Select open (`defaultOpen`). Assert that each photo `[role=option]` has a `title` and the shrink class.

### WR-02: The cn-merge tests use hand-copied base strings that differ from the real primitives

**File:** `src/components/duplicate-import-dialog.test.ts:42-46,56-62`, `src/components/spines-filter-bar.test.ts:45-54`
**Issue:** The "survives cn merging" tests merge against invented, abridged bases:
- the title base `'text-lg font-medium'`;
- the content base `'grid w-full max-w-[calc(100%-2rem)] gap-4 sm:max-w-lg'`, while the real one uses `data-[size=default]:sm:max-w-lg` among about 20 other tokens;
- a shortened SelectItem base.

The original bug came from a second overflow-wrap utility winning on CSS emission order. A future `shadcn add alert-dialog --overwrite` that puts `break-words` or a `grid-cols-*` into the real base would bring it back, and these tests would not notice. The "has no second overflow-wrap" test (`:29-40`) checks only the constant, never the merged class list that reaches the DOM.
**Fix:** Assert on the className of the rendered element (see WR-01), which includes the real base. If you keep string tests, also run the forbidden-utility check against the rendered or merged class list.

## Info

### IN-01: Keyboard and touch users cannot read a truncated photo name

**File:** `src/components/spines-filter-bar.tsx:27-33,93`
**Issue:** The full name is only in a native `title` tooltip, which appears on mouse hover only. The trigger (`w-64`) also truncates the selected value. On a phone or with the keyboard, a long name is never fully visible. This meets the plan's "full name on hover" wording but not the spirit.
**Fix:** Optional. Use a Tooltip on focus, or `line-clamp-2` with `break-all` in the list rows instead of a one-line truncate.

### IN-02: The `title` on `role="option"` makes screen readers repeat the name

**File:** `src/components/spines-filter-bar.tsx:30`
**Issue:** The Radix option is labelled by its ItemText (the filename), and `title` becomes its accessible description. Some screen readers announce the filename twice.
**Fix:** Optional. Put `title` on the inner `<span className="truncate">` instead of the SelectItem.

### IN-03: The same dead `[overflow-wrap:anywhere]` remains in already-in-collection

**File:** `src/components/already-in-collection.tsx:106`
**Issue:** It has `break-words [overflow-wrap:anywhere]` together, the exact cascade conflict from the debug doc: `.break-words` is emitted later and wins, so `anywhere` is dead. The text includes a user-controlled Discogs folder name (`alreadyLine`).
**Fix:** Drop `break-words` and keep `[overflow-wrap:anywhere]`.

---

_Reviewed: 2026-10-22T18:15:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
