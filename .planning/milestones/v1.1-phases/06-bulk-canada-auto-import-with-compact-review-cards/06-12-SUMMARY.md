---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 12
subsystem: ui
tags: [nextjs, nuqs, react-query, shadcn, filters, empty-states]

requires:
  - phase: 06-04
    provides: "GET /api/spines?fallback=1, parseFallbackParam, getSpines({ fallback }), counts.fallback, discogs.preferredCountry, demo buildSpinesResponse opts.fallback"
  - phase: 06-07
    provides: "filter bar row 2 order with the right-aligned Retry all failed and CardLayoutToggle group"
provides:
  - "useFallbackFilter, fallbackOf, fallbackParamOf, FallbackFilterToggle (src/components/fallback-filter-toggle.tsx)"
  - "spinesSearch, spinesQueryKey, SpinesFilters, NoFallbacks, COMBINED_FILTERS_BODY exported from spines-view.tsx"
  - "FilterEmpty kind 'fallback'; filterEmptyOf(status, review, fallback, shown)"
  - "SpinesView required prop initialFallback, passed by /spines and the demo /spines"
affects: [06-09, 06-10, phase-06-verification]

actuals:
  tokens: 7700
  tasks: 2
  commits: 5
plan_head_before: 5cf22193a25e972f33dc8b47e18a380dc31602b2
plan_head_after: fdd7b860578b9894a4d72c71182b6ce57d0fa9dd

tech-stack:
  added: []
  patterns:
    - "URL filter hook split into pure fallbackOf / fallbackParamOf plus a thin nuqs hook (same as layoutOf / layoutParamOf)"
    - "The /api/spines query string and query key come from exported pure helpers (spinesSearch, spinesQueryKey) so tests can check them"

key-files:
  created:
    - src/components/fallback-filter-toggle.tsx
    - src/components/spines-view.test.ts
  modified:
    - src/components/spines-filter-bar.tsx
    - src/components/spines-filter-bar.test.ts
    - src/components/spines-view.tsx
    - src/lib/review-status.ts
    - src/lib/review-status.test.ts
    - src/app/spines/page.tsx
    - src/app/spines/page.demo.tsx

key-decisions:
  - "filterEmptyOf counts the active filters: two or more of status, Needs review and Fallback give combined; otherwise the single active filter gets its own state"
  - "The Fallback toggle carries data-fallback-filter so tests can find it among the row's Toggles"
  - "Empty-state copy is tested by rendering an exported NoFallbacks component and an exported COMBINED_FILTERS_BODY constant, in a new spines-view.test.ts"

patterns-established:
  - "spinesSearch / spinesQueryKey: one place that turns the filters into the request and the cache key"

requirements-completed: [BULK-10]

coverage:
  - id: D1
    description: "The Fallback toggle with its count sits after Needs review and before the photo Select, shows only when its count is above 0 or the filter is on, and is pressed under ?fallback=1"
    requirement: BULK-10
    verification:
      - kind: unit
        ref: "src/components/spines-filter-bar.test.ts#SpinesFilterBar Fallback toggle (D-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "useFallbackFilter reads true only for ?fallback=1, and turning it off removes the param"
    requirement: BULK-10
    verification:
      - kind: unit
        ref: "src/components/spines-filter-bar.test.ts#useFallbackFilter (T-06-26)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The /spines request sends fallback=1 only when the filter is on, beside the other filters, and the query key includes it"
    requirement: BULK-10
    verification:
      - kind: unit
        ref: "src/components/spines-filter-bar.test.ts#the /spines request with Fallback (D-15)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty states: Fallback alone reads 'No fallbacks' with the preferred-country body and Show all spines; two or more filters read the combined state with the new body"
    requirement: BULK-10
    verification:
      - kind: unit
        ref: "src/lib/review-status.test.ts#filterEmptyOf (D-11, D-15, UI-SPEC E11)"
        status: pass
      - kind: unit
        ref: "src/components/spines-view.test.ts#NoFallbacks (Empty: Fallback)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Reloading /spines?fallback=1 server-renders the filtered list in the app and the demo; Show all spines and Clear filters change the URL as described"
    requirement: BULK-10
    verification: []
    human_judgment: true
    rationale: "URL state, server render and empty-state flow across reloads need a browser (the plan's human-check); no dev server was started because the owner's server holds port 3001"

duration: 4min
completed: 2026-10-25
status: complete
---

# Phase 06 Plan 12: Fallback Filter Summary

**A `Fallback {k}` toggle in the /spines filter bar, saved in the URL as `?fallback=1`. It uses 06-04's server filter to list only the spines whose bulk import used another country. It comes with a "No fallbacks" empty state, an updated combined-filters empty state, and server-rendered initial data on both the app and demo pages.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-25T02:53:14Z
- **Completed:** 2026-10-25T02:57:09Z
- **Tasks:** 2
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments

- `FallbackFilterToggle` is an outline Toggle (never accent) with the label `Fallback` and the muted mono count. It sits after Needs review and before the photo Select, and shows only when `counts.fallback > 0` or the filter is on.
- `useFallbackFilter` reads `?fallback=1` only and scrolls to the top on change (T-06-26). This is the same exact-'1' rule as `parseFallbackParam` on the server.
- The `fetchSpines` query string (`spinesSearch`) and the query key (`spinesQueryKey`) both carry `fallback`. The `initialData` guard compares it with `initialFallback`.
- `filterEmptyOf(status, review, fallback, shown)`: two or more filters on gives `combined`, and each filter alone gives its own state.
- Fallback alone shows `NoFallbacks`: a MapPin, "No fallbacks", `Every bulk-imported spine got its {Canadian pressing / pressing from X}.`, and an outline "Show all spines" that turns only Fallback off.
- The combined state's body now reads "Turn off Needs review or Fallback, or pick another status." Clear filters resets status, review and fallback and keeps the photo.
- `/spines` parses `fallback` with `parseFallbackParam` into `getSpines`. The demo passes `sp.get('fallback') === '1'` to `buildSpinesResponse`. `initialFallback` is now required.

## Task Commits

1. **Task 1 (tracer): Fallback toggle through the URL and the server**: `c02dc95` (test, RED), `cf9cca5` (feat, GREEN)
2. **Task 2: Filter empty states and the fallback param on both pages**: `132ff77` (test, RED), `5e50353` (test, RED evidence re-recorded), `fdd7b86` (feat, GREEN)

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | c02dc95 | `tdd/06-12-task1-red.json`: RED_EVIDENCE_OK. The target "reads true for ?fallback=1" failed on `toContain('>on<')` against a stub `fallbackOf` that always returns false | cf9cca5 |
| 2 | 132ff77, 5e50353 | `tdd/06-12-task2-red.json`: RED_EVIDENCE_OK. The target "reads No fallbacks with the Canadian body for Canada" failed on `toContain('No fallbacks')` against a `NoFallbacks` stub that renders null | fdd7b86 |

Semantic assessment: each target ran and failed on its planned assertion against stubs that compiled. In the unfiltered RED runs, 11 new tests failed (Task 1) and 8 new tests failed (Task 2), all on assertions. Every existing test passed.

Tracer gate (auto mode): after GREEN, the full Task 1 `<verify>` was re-run: 20 tests passed and tsc and biome were clean, so the plan went on to Task 2.

## Verification

- Plan `<verification>`: `vitest run` gave 118 files and 2128 tests passed. `tsc --noEmit` exited 0. `biome check` found no issues in 678 files.
- Acceptance greps: `FallbackFilterToggle` in spines-filter-bar.tsx 2, `useFallbackFilter` in spines-view.tsx 2, `font-(semibold|bold)` in fallback-filter-toggle.tsx 0, `initialFallback` 3/1/1, `No fallbacks` 1, `kind: 'fallback'` 2.

## Decisions Made

- The active filters are counted, not tested pairwise, so every combination of two or three filters gets the combined state.
- `data-fallback-filter` marks the toggle for tests. The row has several Toggles with the same slot.

## Deviations from Plan

**1. [Rule 3 - Blocking] RED evidence for Task 2 re-recorded on a string target**
- **Found during:** Task 2 RED
- **Issue:** The first record (target "gives Fallback alone its own state") was refused as `invalid_record`. Vitest `tap-flat` prints the object diff from `toEqual` as multi-line YAML, which the classifier treats as malformed TAP. The target itself did fail (`expected null to deeply equal { kind: 'fallback' }`).
- **Fix:** Re-recorded on the NoFallbacks target, which fails on a string assertion against the same stubs. It got RED_EVIDENCE_OK in a separate commit before GREEN.
- **Files modified:** `.planning/phases/06-.../tdd/06-12-task2-red.json`
- **Committed in:** 5e50353

**2. [Scope] New test file `src/components/spines-view.test.ts`**
- The plan let me pick the test style for the empty-state copy. A rendered check of the exported `NoFallbacks` belongs beside spines-view.tsx, not in a `src/lib` test. The file is inside the plan's `src/components` verify glob.

**3. [Scope] `fetchSpines` takes a `SpinesFilters` object**
- The plan wrote `fetchSpines(photo, review, status, fallback)`. It now takes one object, built by the exported `spinesSearch`, so the query string can be unit-tested. The behaviour is the same.

**Total deviations:** 3 (1 blocking evidence fix, 2 small scope choices). **Impact:** none on behaviour, and no scope creep.

## Issues Encountered

None.

## Known Stubs

None. Every RED stub was replaced in its GREEN commit.

## Threat Flags

None. T-06-26 is mitigated: `fallbackOf` accepts only `'1'`, the same rule as `parseFallbackParam`, and `'0'`, `'true'`, `' 1'` and empty all read false (tested).

## User Setup Required

None.

## Next Phase Readiness

- The plan's human-check is still open for the end-of-phase UAT. On http://127.0.0.1:3001/spines after a bulk import: turn Fallback on, then also pick Imported, then reload with Fallback on.
- Plan 06-10's batch-finished toast action `Show fallbacks` can set `?fallback=1` through `useFallbackFilter`.

## Self-Check: PASSED

- FOUND: src/components/fallback-filter-toggle.tsx, src/components/spines-view.test.ts, tdd/06-12-task1-red.json, tdd/06-12-task2-red.json
- FOUND commits: c02dc95, cf9cca5, 132ff77, 5e50353, fdd7b86

---
*Phase: 06-bulk-canada-auto-import-with-compact-review-cards*
*Completed: 2026-10-25*
