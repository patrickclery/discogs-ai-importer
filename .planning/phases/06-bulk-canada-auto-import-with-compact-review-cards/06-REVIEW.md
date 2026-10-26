---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
reviewed: 2026-10-26T23:22:34Z
depth: standard
iteration: 6
scope: plan 06-19 only (G-06-side-2, six-row compact card), commits a4ce271..48eb4d5 (diff since a4ce271~1), plus the other callers of TopMatchRow and BulkStatusLine
prior_iteration: "5 (2026-10-25T23:56:52Z): re-review of the WR-01/IN-01 fixes 9cde7b6 and 5bb5a4a (new pressing outcomes), 26 files, status clean with 1 info (fallbackLine has no exhaustiveness guard, bulk-copy.ts:222-223). This iteration does not re-check that scope."
files_reviewed: 4
files_reviewed_list:
  - src/components/compact-spine-card.tsx
  - src/components/compact-spine-card.test.ts
  - src/components/top-match-row.tsx
  - src/components/bulk-status-line.tsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 6: Code Review Report (plan 06-19, six-row compact card)

**Reviewed:** 2026-10-26T23:22:34Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is iteration 6. It covers only plan 06-19, which closes UAT gap G-06-side-2. The plan turns the compact card into a six-row CSS subgrid, removes the on-screen spine number, adds the pencil Edit button and fixes the line counts. Iteration 5 (the re-review of the pressing-outcome fixes) ended clean with one open info item (IN-01 there: `fallbackLine` has no exhaustiveness guard). That scope is not re-checked here.

Other callers are not affected:
- `TopMatchRow` is used only by `CompactSpineCard`.
- `BulkStatusLine` is also used in `discogs-matches.tsx:184` (`kinds={['failed','skipped']}`) and `confirmed-match.tsx:370` (`kinds={['fallback']}`). Neither passes `clamp`, so the default `false` keeps the Detailed SpineView unclamped. The test "a Detailed fallback line is never clamped" checks this.
- `cn` (tailwind-merge) correctly drops the Card base classes `flex` and `py-6` in favour of `grid` and `p-4`.

Checks: `compact-spine-card.test.ts` passes (42 tests), `tsc --noEmit` is clean and `biome check` on the four files is clean.

Two problems are new with this plan:
1. The card's own column is an implicit `auto` track, so an unbreakable string can make the content wider than the card. The card's `overflow-hidden` then cuts off the right edge, including the pencil button. I confirmed this in headless Chrome.
2. With numbers gone from the compact cards, the skipped-duplicate line still sends the user to "spine #N", which they can no longer find.

## Warnings

### WR-01: The card's implicit `auto` column lets an unbreakable string push content past the card edge, where it is clipped (including the pencil Edit button)

**File:** `src/components/compact-spine-card.tsx:156-159` (also affects `:188-208`, `:222-224`; `top-match-row.tsx:46-57`)
**Issue:** The card is now `grid grid-rows-subgrid` with no column template, so its single column is the implicit `grid-auto-columns: auto`. An `auto` track's minimum is the largest min-content contribution of its items. The text spans use `break-words` (`overflow-wrap: break-word`), which does not lower the min-content size. A long unbroken token therefore makes the column wider than the card's content box:
- a long photo file name in the skipped line (`Already imported from PXL_20261025_143012345_HDR_edited-copy-final.jpeg, spine #12`, rendered on the bulk row through `BulkStatusLine clamp`)
- a long catno, or a title token with no spaces

Each row then extends past the right padding, and the Card's `overflow-hidden` (from the `mini` variant) clips it. The `ml-auto` pencil button on the select row moves out with the column, so it is the first thing to be cut off.

Before 06-19 the card was `flex flex-col`. Flex-column items stretch to the container width and break-word wraps inside it, so this could not happen.

I reproduced it in headless Chrome with the same CSS (4 columns of `minmax(0,1fr)`, card with subgrid rows and `p-4`). With that file name, the button's right edge lands at 262.5px against a card edge of 263px, past the content box (246px). With `grid-template-columns: minmax(0,1fr)` on the card, it stays at the content edge (525 = 542 - 17).

**Fix:** Give the card a column that cannot grow past it:
```tsx
className={cn(
  'row-span-6 grid grid-cols-1 grid-rows-subgrid gap-2 rounded-xl p-4',
  orphaned && 'border-warning/60',
)}
```
(Tailwind 4 `grid-cols-1` is `repeat(1, minmax(0, 1fr))`.) Alternatively, add `[&>*]:min-w-0` to the card. Add a test that asserts `grid-cols-1` is among the card's class tokens.

### WR-02: The compact skipped line still points to "spine #N", but compact cards no longer show any number

**File:** `src/components/compact-spine-card.tsx:222-224` (copy from `src/lib/bulk-copy.ts:230-232`)
**Issue:** G-06-side-2 removed every visible spine number from compact cards. The `#n` label and the CornerNumeral are gone, and the number now appears only in `aria-label`s and the crop's alt text. The bulk row still renders `skippedLine`, which reads `Already imported from spine #12` (same photo) or `Already imported from IMG_1.jpg, spine #12`. In the compact grid the user has nothing to match "#12" against: no card shows 12. The tests at `compact-spine-card.test.ts:523` and `:621-628` assert exactly this copy on a compact card.

The component's own doc comment ("the spine number appears only in accessible names and the crop's alt text", `compact-spine-card.tsx:71-72`) is therefore wrong as well.

**Fix:** Pick one:
- (a) Have the skip DTO carry the original spine's id, and render the reference as a link to `#spine-card-{id}` labelled with the original's match title, e.g. `Already imported as {title} from IMG_1.jpg`.
- (b) Add a compact-only `skippedLine` variant that drops `spine #N` (`Already imported from IMG_1.jpg`) and keep the numbered copy for the Detailed layout, which still shows the numeral.

Update the doc comment either way.

## Info

### IN-01: The clamped title, details and bulk lines expose the full text only through `title`

**File:** `src/components/top-match-row.tsx:46-57`, `src/components/bulk-status-line.tsx:114-117`
**Issue:**
- The details line used to wrap to two lines. It is now `line-clamp-1`, and the fallback, skipped and finding lines are now `line-clamp-2`.
- The hidden part can only be read through the native `title` tooltip. That needs a mouse hover, so keyboard and touch users cannot reach it (screen readers still get the full text).
- Combined countries (`UK, Europe & US`) and long catnos are the most likely to be cut.
- This is the trade-off the plan accepted. Opening the card with the pencil shows the full text.

**Fix:** Optional. Wrap the clamped text in the existing shadcn `Tooltip` on a focusable trigger, or accept the trade-off and note it in the UI-SPEC.

### IN-02: Two new test assertions depend on incidental markup

**File:** `src/components/compact-spine-card.test.ts:155`, `:336-338`
**Issue:**
- `expect(text).not.toMatch(/(^|\D)7(\D|$)/)` scans all visible text of the card. Any fixture text with a standalone 7 (a year such as `1997` is fine, but a track count or a catno like `7 CD`) fails it for a reason unrelated to numbering.
- The `<input(?![^>]*type="checkbox" aria-hidden="true")` lookahead depends on the attribute order of Radix's hidden checkbox input, which can change on a Radix upgrade and turn the "no field inputs" check into a false failure or a false pass.

**Fix:** Assert on the specific removed elements: no `data-corner-numeral`, no `>#7<` and no `#7` in visible text, which are already covered. Count `<input` tags excluding `aria-hidden="true"` with a parser or attribute-order-independent check, e.g. split the tags and test each for both attributes.

---

_Reviewed: 2026-10-26T23:22:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
