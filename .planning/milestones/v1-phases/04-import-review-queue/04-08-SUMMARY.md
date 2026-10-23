---
phase: 04-import-review-queue
plan: 08
subsystem: ui
tags: [nextjs, react, shadcn, radix-ui, dropdown-menu, sqlite, vitest]

requires:
  - phase: 04-import-review-queue
    provides: "spines.not_on_discogs, SpineDto.notOnDiscogs/reviewStatus/import (04-01, 04-10); ConfirmedMatch branch in DiscogsMatches (04-03); review status counts and filter (04-05)"
provides:
  - "setNotOnDiscogs rule (imported and import_open refusals, idempotent repeat)"
  - "POST /api/spines/{id}/not-on-discogs { flag }"
  - "shadcn DropdownMenu primitive (src/components/ui/dropdown-menu.tsx)"
  - "SpineActionMenu card menu, useNotOnDiscogs control, NotOnDiscogsLine marked body, not-found Mark button"
affects: [04-verification, uat, spines-view]

actuals:
  tokens: 10835
  tasks: 2
  commits: 3
plan_head_before: 16edef0ec06af67c0d3152c642aef08007e9a0ce
plan_head_after: d6cd05e7339566f0862578451fa9eadda907f745

tech-stack:
  added: []
  patterns:
    - "One mark/unmark controller (useNotOnDiscogs) owned by DiscogsMatches and shared by the menu, the marked line and the not-found button, so pending and error state live in one place"
    - "Focus after a refetch: data-* hooks inside [data-spine-card] focused in requestAnimationFrame"

key-files:
  created:
    - src/server/scan/not-on-discogs.ts
    - src/server/scan/not-on-discogs.test.ts
    - src/app/api/spines/[id]/not-on-discogs/route.ts
    - src/app/api/spines/[id]/not-on-discogs/route.test.ts
    - src/components/ui/dropdown-menu.tsx
    - src/components/spine-action-menu.tsx
    - src/components/spine-action-menu.test.ts
    - src/components/not-on-discogs-line.tsx
  modified:
    - src/components/discogs-matches.tsx

key-decisions:
  - "A repeated mark or unmark answers ok and writes nothing (no updated_at bump), so a double click or a late toast Undo is harmless"
  - "The mark wins over an earlier failed import: DiscogsMatches checks notOnDiscogs before the import branch, so a marked spine shows the marked line, not the failed panel"
  - "The menu's in-flight spinner renders in the trigger slot (the plan's allowed alternative to the card status slot, which belongs to photo-section)"
  - "The not-found Mark button shows whenever the search state is no_match and canMarkNotOnDiscogs holds, so manual candidates still list below it"

patterns-established:
  - "canMarkNotOnDiscogs mirrors the server rule: pending, not_found or failed review status and no open import"

requirements-completed: [REV-05]

coverage:
  - id: D1
    description: "setNotOnDiscogs changes only the flag, refuses imported and open imports, is reversible and idempotent"
    requirement: REV-05
    verification:
      - kind: unit
        ref: "src/server/scan/not-on-discogs.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/spines/{id}/not-on-discogs: 200 mark/unmark, 404 unknown, 409 not_markable/imported/import_open, 415/400 guards, crop/fields/searches/candidates untouched"
    requirement: REV-05
    verification:
      - kind: integration
        ref: "src/app/api/spines/[id]/not-on-discogs/route.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Menu visibility rule and inline error copy (canMarkNotOnDiscogs, markErrorText)"
    requirement: REV-05
    verification:
      - kind: unit
        ref: "src/components/spine-action-menu.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Card menu, marked line, toast Undo, focus moves, pending spinner and badge/filter count change in the browser"
    requirement: REV-05
    verification: []
    human_judgment: true
    rationale: "Menu, toast Undo, focus and the in-flight spinner are browser behavior no unit test renders"

duration: 7min
completed: 2026-10-22
status: complete
---

# Phase 4 Plan 08: Mark Not on Discogs Summary

**A card menu (new shadcn DropdownMenu) and a not-found button mark a spine "not on Discogs" through POST /api/spines/{id}/not-on-discogs. The mark hides the matches behind a marked line with Unmark, the toast offers Undo, and nothing stored is deleted.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-22T10:52:53Z
- **Completed:** 2026-10-22T11:00:24Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- `setNotOnDiscogs` runs in one IMMEDIATE transaction. A mark is refused on an imported spine (409 imported) and while an import is pending, importing or already in the collection (409 import_open, A-04-19). A dismissed or superseded spine gives 409 not_markable. Only `not_on_discogs` and `updated_at` change.
- `SpineActionMenu` is the last header action: a ghost size-9 EllipsisVertical trigger with "Mark not on Discogs" or "Unmark not on Discogs". It does not render when it would be empty (imported, or an import is open).
- `NotOnDiscogsLine` replaces the body of a marked spine. Search again, Retry search, Search Discogs… and the notice line are hidden. A not-found card gets an outline "Mark not on Discogs" button under the no-matches line.
- Pending states: "Unmarking…", "Marking…", and a spinner in the trigger slot for menu actions. After a mark, focus moves to Unmark; after an unmark, it moves to the menu trigger. Errors show inline (role alert) under the header row.

## Task Commits

1. **Task 1: Tracer, mark from the card menu** - `32b52c9` (feat)
2. **Task 2 RED: failing idempotence test** - `c8a4d8c` (test)
3. **Task 2 GREEN: idempotent rule plus pending, focus and error states** - `d6cd05e` (feat)

## TDD Gate Compliance

- **RED** (`c8a4d8c`): `vitest run src/server/scan/not-on-discogs.test.ts --reporter=tap` exited 1. The target test was "marking twice is ok and the repeat writes nothing" and the classifier returned `RED_EVIDENCE_OK` (target_test_failed, 6 tests, 4 pass, 2 fail). Semantic check: the target ran and failed on its planned assertion. The second mark rewrote `updated_at` (expected the row byte-identical). "unmarking an unmarked spine…" failed for the same reason. There were no load, import or fixture faults.
- **GREEN** (`d6cd05e`): the rule returns early when the flag already matches. All 6 rule tests and 8 route tests pass.
- **REFACTOR:** none needed.
- The other four behavior tests (restore, orphaned, dismissed, failed import) were already green after the Task 1 tracer. Only the idempotence behavior was new.

## Files Created/Modified
- `src/server/scan/not-on-discogs.ts`: the setNotOnDiscogs rule
- `src/app/api/spines/[id]/not-on-discogs/route.ts`: POST mark/unmark with strict `{ flag }`
- `src/components/ui/dropdown-menu.tsx`: shadcn DropdownMenu on the installed radix-ui
- `src/components/spine-action-menu.tsx`: SpineActionMenu, useNotOnDiscogs, canMarkNotOnDiscogs, markErrorText
- `src/components/not-on-discogs-line.tsx`: the marked line with Unmark
- `src/components/discogs-matches.tsx`: menu in the header, marked body, not-found Mark button, error line
- Tests: `not-on-discogs.test.ts`, `route.test.ts`, `spine-action-menu.test.ts`

## Decisions Made
See key-decisions above. The main one: a repeat is a no-op, and the mark takes precedence over a failed import in the card.

## Deviations from Plan

**1. [Rule 3 - Blocking/T-04-SC] Wrote the dropdown file from the registry instead of letting the CLI install**
- **Found during:** Task 1
- **Issue:** `shadcn add dropdown-menu --dry-run` listed dependencies `cn` and `radix-ui`. Both are already pinned in package.json, but a live run would call the package manager and could rewrite package.json or the lockfile (package.json also has unrelated uncommitted changes).
- **Fix:** I took the official registry source from `shadcn add dropdown-menu --view` (same CLI 4.22.1, official registry) and wrote only `src/components/ui/dropdown-menu.tsx`, formatted with Biome. The file imports from `radix-ui` and `cn`, the same as the other ui files. The label already used `font-medium`. package.json and pnpm-lock.yaml are unchanged by this plan.
- **Commit:** `32b52c9`

**2. [Rule 2 - Missing tests] Added `src/components/spine-action-menu.test.ts`**
- Unit coverage for the menu visibility rule and the inline error copy. This file was not in the plan's file list.
- **Commit:** `d6cd05e`

**Total deviations:** 2 (1 blocking-safety, 1 added tests). **Impact:** no scope change.

## Issues Encountered
- Known CPU-load flakes (`cli.test.ts` once, `match.test.ts` once) failed in two full runs and passed when re-run alone. The final full run passed: 80 files, 1499 tests.
- A production build into `.next/verify` succeeded. The default `.next` and `tsconfig.json` were untouched.

## User Setup Required
None.

## Next Phase Readiness
- REV-05 is complete. The browser check (menu, Undo, focus, spinner, filter count) is left for end-of-phase UAT (D4).

## Self-Check: PASSED
- All 8 created files exist. Commits 32b52c9, c8a4d8c and d6cd05e are on HEAD.
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` exit 0. `grep -c "react-dropdown-menu" package.json` prints 0.

---
*Phase: 04-import-review-queue*
*Completed: 2026-10-22*
