---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 07
subsystem: ui
tags: [react, nextjs, nuqs, tailwind, shadcn, compact-cards]

requires:
  - phase: 06-04
    provides: "SpineDto.bulk on the /spines read model and SpinesResponse.counts.fallback"
provides:
  - "CompactSpineCard: #n, worst-field, Edited and orphan badges, state badge, spine crop, then the top or confirmed match"
  - "TopMatchRow: 48px cover, two-line clamped title with the full title on hover, year · country · catno"
  - "CardLayoutToggle / useCardLayout bound to ?view=detailed (absent = Compact)"
  - "ExpandedCardsProvider / useExpandedCard / toggleExpanded / layoutReset"
  - "bulk-copy.ts matchSlotOf and matchDetails"
  - "SpineCard leading slot and card id spine-card-{id}; SpineView exported with trailing; PhotoSection layout prop"
affects: [06-08, 06-09, 06-10, 06-11, 06-12]

actuals:
  tokens: 11800
  tasks: 2
  commits: 4
plan_head_before: d3676e6e6cff6f4f8da010e09e00b6f3f61d32b9
plan_head_after: 1095a4b5e489c6104e28826182d04199905f16fb

tech-stack:
  added: []
  patterns:
    - "CompactSpineCard takes renderFull(trailing) so SpineView stays the one full-card renderer"
    - "Expanded ids live in a context keyed by spine id; a layout change resets them while rendering"

key-files:
  created:
    - src/lib/bulk-copy.ts
    - src/lib/bulk-copy.test.ts
    - src/components/card-layout-toggle.tsx
    - src/components/compact-spine-card.tsx
    - src/components/compact-spine-card.test.ts
    - src/components/top-match-row.tsx
    - src/components/expanded-cards.tsx
  modified:
    - src/components/photo-section.tsx
    - src/components/spine-card.tsx
    - src/components/spines-filter-bar.tsx
    - src/components/spines-view.tsx
    - src/app/spines/loading.tsx

key-decisions:
  - "CompactSpineCard receives a renderFull(trailing) callback; PhotoSection passes SpineView, which appends the Show less row as its footer's last row"
  - "A search state of done with no candidates reads 'No matches on Discogs'; a missing search summary reads 'Not looked up yet'"
  - "The Edit spine toggle only renders when renderFull is given, so the collapsed card renders without a provider"

patterns-established:
  - "Pure URL mappers (layoutOf / layoutParamOf) sit beside nuqs hooks so the setter semantics are unit-tested"

requirements-completed: [BULK-01, BULK-02, BULK-03]

coverage:
  - id: D1
    description: "Compact card shows #n, badges, crop and the top or confirmed match (or a search-state placeholder)"
    requirement: BULK-01
    verification:
      - kind: unit
        ref: "src/components/compact-spine-card.test.ts#CompactSpineCard (collapsed)"
        status: pass
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts#matchSlotOf"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compact / Detailed toggle in the filter bar, kept in the URL as ?view=detailed"
    requirement: BULK-01
    verification:
      - kind: unit
        ref: "src/components/compact-spine-card.test.ts#useCardLayout"
        status: pass
    human_judgment: false
  - id: D3
    description: "Edit spine expands a card in place into the full card across the row; Show less collapses it"
    requirement: BULK-02
    verification:
      - kind: unit
        ref: "src/components/compact-spine-card.test.ts#CompactSpineCard expand toggle"
        status: pass
      - kind: unit
        ref: "src/components/compact-spine-card.test.ts#toggleExpanded"
        status: pass
    human_judgment: false
  - id: D4
    description: "Responsive grid density (1/2/3/4 columns), long-title clamping, gap before an expanded card, focus handoff and expanded state surviving a 3 s poll with a field focused"
    requirement: BULK-03
    verification: []
    human_judgment: true
    rationale: "Visual layout, focus movement and poll survival with a live draft need a real browser (UI-SPEC backstops)"
  - id: D5
    description: "/spines first load shows a compact grid of 8 card skeletons"
    verification:
      - kind: other
        ref: "grep -c 'h-64 rounded-xl' src/app/spines/loading.tsx"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-25
status: complete
---

# Phase 6 Plan 07: Compact Review Cards Summary

**/spines now opens as a 1/2/3/4-column grid of compact cards, each with the spine crop above its top or confirmed match (48px cover, clamped title, year · country · catno). A URL-backed Compact/Detailed toggle switches layouts, and Edit spine opens any card in place into the full Phase 4 card.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-25T02:23:27Z
- **Completed:** 2026-10-25T02:30:47Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- `matchSlotOf` picks what each card shows, in this order: the Not on Discogs mark, then an import in any phase ("Confirmed match", or `Release {id}` when the snapshot is gone), then the rank-1 candidate ("Top match"), then the exact search-state placeholder text from the UI-SPEC.
- `CompactSpineCard` and `TopMatchRow` render Discogs text only as React text. The cover src comes only from `candidateThumbSrc` (T-06-19).
- `CardLayoutToggle` is the last item in filter row 2, inside a right-aligned group with Retry all failed. `?view=detailed` means Detailed; no param, or any other value, means Compact.
- `ExpandedCardsProvider` keeps open cards keyed by spine id, so polls and refetches leave them open, and several can be open at once. Switching layouts closes them all.
- Edit spine and Show less carry aria-expanded and aria-controls. Focus moves to Show less after opening; after closing, the card scrolls into view and Edit spine gets focus. There is no height animation.
- In Compact, the scan Alert, No CDs found and "No longer detected ({n})" span the full row, and orphans follow in the same grid. The loading screen shows 8 `h-64` skeletons in the grid.

## Task Commits

1. **Task 1 (tracer): compact layout from the URL toggle to a card with its crop and top match**: `d039ecf` (test, RED), `feb06f3` (feat, GREEN)
2. **Task 2: Edit spine expands in place; SpineCard leading slot; compact skeleton**: `9e58816` (test, RED), `1095a4b` (feat, GREEN)

## TDD Gate Compliance

- Each RED commit added skeleton modules with the right exports. Tests therefore failed on assertions (for example `expected '' to contain '#7'` and `expected [] to deeply equal [ 'a' ]`), not on missing modules. Semantic check: each target test failed on its planned assertion.
- Both GREEN commits pass. No refactor commits were needed.

## Files Created/Modified
- `src/lib/bulk-copy.ts`: `matchDetails`, `matchSlotOf` and the placeholder text constants.
- `src/components/card-layout-toggle.tsx`: `layoutOf`, `layoutParamOf`, `useCardLayout`, `CardLayoutToggle`.
- `src/components/top-match-row.tsx`: the 48px cover and the title/details column.
- `src/components/compact-spine-card.tsx`: the collapsed card, plus the Edit spine and Show less toggles.
- `src/components/expanded-cards.tsx`: `toggleExpanded`, `layoutReset`, `ExpandedCardsProvider`, `useExpandedCard`.
- `src/components/photo-section.tsx`: `layout` prop, `COMPACT_GRID`, a grid-aware `CardSkeletons`, and an exported `SpineView` with `trailing`.
- `src/components/spine-card.tsx`: `leading` slot before `#n` and the `spine-card-{id}` id.
- `src/components/spines-filter-bar.tsx`: the right-aligned group holding Retry all failed and the layout toggle.
- `src/components/spines-view.tsx`: `useCardLayout` and `ExpandedCardsProvider` around the photo sections.
- `src/app/spines/loading.tsx`: the compact 8-card skeleton grid.

## Decisions Made
- I used the `renderFull(trailing)` callback option, not a `full` prop. CompactSpineCard builds its own Show less row, and SpineView stays the only full-card renderer.
- A `done` search with zero candidates reads "No matches on Discogs", the same as `no_match`.

## Deviations from Plan

None. The plan ran as written. The only small additions are an optional `initial` prop on `ExpandedCardsProvider` for tests, and a pure `layoutReset` helper so the layout reset can be unit-tested.

## Issues Encountered
- I checked the app on 127.0.0.1:3001. Compact SSR showed 300 Edit spine buttons and 0 inputs; Detailed showed 1500 field inputs. The dev log had no errors. I then stopped the dev server.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness
- Plan 06-08 can add the bulk-state copy to `src/lib/bulk-copy.ts` and the status line to CompactSpineCard.
- Plan 06-09 can put the selection checkbox in the `SpineCard` `leading` slot and in the compact header.
- End-of-phase visual checks: the 120-character title at 264px and 360px, the gap before an expanded card at xl, and an expanded card with a focused field across a 3 s poll.

---
*Phase: 06-bulk-canada-auto-import-with-compact-review-cards*
*Completed: 2026-10-25*

## Self-Check: PASSED
