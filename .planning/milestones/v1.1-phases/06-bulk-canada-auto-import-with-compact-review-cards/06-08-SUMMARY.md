---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
plan: 08
subsystem: ui
status: complete
tags: [bulk-import, cards, copy, country-badge, retry]
requires:
  - phase: 06-04
    provides: countryBadgeOf, SpineDto.bulk
  - phase: 06-05
    provides: POST /api/spines/{id}/retry re-runs a failed lookup
  - phase: 06-07
    provides: CompactSpineCard, matchSlotOf, SpineView
provides:
  - countryBadgeText, fallbackLine, skippedLine, lookupFailureLine, findingLine, bulkStatusLineOf (src/lib/bulk-copy.ts)
  - CountryBadge (src/components/country-badge.tsx)
  - BulkStatusLine with Retry import (src/components/bulk-status-line.tsx)
  - ImportStateBadge "Finding pressing"
  - bulkNoticeKind and noticeLineKind (src/components/discogs-matches.tsx)
affects: [06-09, 06-10, 06-12]
tech-stack:
  added: []
  patterns:
    - "One pure precedence function per line slot (bulkStatusLineOf, noticeLineKind); components switch on its answer"
key-files:
  created:
    - src/components/country-badge.tsx
    - src/components/bulk-status-line.tsx
  modified:
    - src/lib/bulk-copy.ts
    - src/lib/bulk-copy.test.ts
    - src/components/import-state-badge.tsx
    - src/components/compact-spine-card.tsx
    - src/components/compact-spine-card.test.ts
    - src/components/confirmed-match.tsx
    - src/components/discogs-matches.tsx
    - src/components/discogs-matches.test.ts
    - src/components/photo-section.tsx
key-decisions:
  - "Lookup failure kind rejected reads \"Couldn't look up pressings: Discogs refused the request. Retry the import.\"; kind other with no reason reads \"something went wrong\""
  - "NoticeLine now switches on a pure noticeLineKind: imported none, then not connected, then the bulk line unless the paused countdown runs, then Fields changed, paused, failed search"
  - "A failed Retry import request reads the server's message via failureReason; a network failure reads \"the app didn't answer\""
requirements-completed: [BULK-01, BULK-07, BULK-08, BULK-11]
duration: 5 min
completed: 2026-10-25
actuals:
  tokens: 12800
  tasks: 2
  commits: 4
plan_head_before: 8d85306261ae87f6375c4ec15dd792028c536345
plan_head_after: 6f15d761c79129a14dab5fe42a216fcb0fe5e2cb
coverage:
  - deliverable: "Bulk-state copy helpers with the UI-SPEC text"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/lib/bulk-copy.test.ts"
        status: pass
  - deliverable: "Compact card: Finding pressing, country badge before the state badge, one status line, Retry import"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/components/compact-spine-card.test.ts#CompactSpineCard bulk states"
        status: pass
  - deliverable: "Detailed/expanded cards: badge in the status slot, fallback line in the panel, skipped/failed notice line and its precedence"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/components/discogs-matches.test.ts#Detailed card bulk states"
        status: pass
      - kind: unit
        ref: "src/components/discogs-matches.test.ts#noticeLineKind precedence"
        status: pass
  - deliverable: "Long country and photo names wrap inside a 264px card"
    human_judgment: true
    rationale: "Visual check at 264px; no test measures layout"
---

# Phase 6 Plan 8: Per-spine bulk states on every card Summary

**Every card form (compact, expanded and Detailed) now shows the bulk states: a "Finding pressing" badge, a map-pin or "Fallback: {country}" badge before the state badge, the fallback reason, the skipped-duplicate line, and a lookup failure with Retry import.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-25T02:46:45Z
- **Completed:** 2026-10-25T02:51:31Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- `bulkStatusLineOf` picks at most one line, in this order: failed lookup, fallback (the badge says Fallback), skipped duplicate, finding. A skip because the spine changed, a preferred import and a manual import show no line.
- `CountryBadge`: outline badge with a muted MapPin and the country as Discogs writes it. A fallback gets a warning-colored TriangleAlert icon (the text stays foreground) and `Fallback: {country}`. Long text truncates and the full text shows on hover.
- `BulkStatusLine`: the failure line with the Open Settings link for a rejected connection, then an outline Retry import button. It POSTs `/retry`, invalidates `['spines']` and dispatches `app:status-refresh`. A request error shows as an inline `role="alert"` line.
- `ImportStateBadge` order: imported, not on Discogs, current bulk item finding ("Finding pressing") or failed ("Import failed"), then the import phase as before.
- Detailed: the status slot shows CountryBadge and then the state badge. ConfirmedMatch shows the fallback line between the box and the state line. The Discogs notice line shows the failed or skipped line ahead of Fields changed, but behind not connected and the paused countdown.

## Task Commits

1. **Task 1 (tracer): compact card bulk states**: `9c28992` (test, RED), `0c7d731` (feat, GREEN)
2. **Task 2: Detailed and expanded cards**: `48838e8` (test, RED), `6f15d76` (feat, GREEN)

## TDD Gate Compliance

| Task | RED commit | RED evidence | GREEN commit |
|------|-----------|--------------|--------------|
| 1 (tracer) | 9c28992 | `tdd/06-08-task1-red.json`: RED_EVIDENCE_OK. The target "reads the preferred country verbatim" failed on `toBe('Canada')` against the stub | 0c7d731 |
| 2 | 48838e8 | `tdd/06-08-task2-red.json`: RED_EVIDENCE_OK. The target "not connected wins over a failed lookup" failed on `toBe('not_connected')` against the stub | 6f15d76 |

Semantic assessment: each target ran and failed on its planned scalar assertion against stubs that compiled. In the unfiltered RED runs, 26 new tests (Task 1) and 9 new tests (Task 2) failed on assertions, and every existing test passed.

Tracer gate (auto mode): the full Task 1 `<verify>` was re-run after GREEN. 52 tests passed, and tsc and biome were clean, so the plan went on to Task 2.

## Verification

- Task 2 `<verify>` (`vitest run src/components src/lib/bulk-copy.test.ts`): 9 files, 119 tests, all passing.
- Plan-level checks: the full `vitest run` gave 117 files and 2103 tests, all passing. `tsc --noEmit` is clean and `biome check` passes on 676 files.
- Acceptance greps:
  - `Finding pressing` in import-state-badge.tsx: 1
  - `export function CountryBadge`: 1
  - `app:status-refresh` in bulk-status-line.tsx: 1
  - `font-(semibold|bold)` in both new components: 0
  - `CountryBadge` in photo-section.tsx: 2
  - `BulkStatusLine` in confirmed-match.tsx and discogs-matches.tsx: 2 each

## Deviations from Plan

None. The plan ran as written. Two small choices go beyond the plan text:
- `noticeLineKind` is exported next to `bulkNoticeKind`, so the full notice precedence (including the not-connected rule) has unit tests. NoticeLine now switches on it, and its existing behavior is unchanged.
- A non-OK Retry import response uses the existing `failureReason`, which falls back to "the server answered {status}" when there is no JSON message. The plan's "the app didn't answer" is used when fetch itself fails.

## Issues Encountered

- A spine with a failed lookup and an older failed import shows two Retry import buttons: one on the notice line and one in the panel. The plan asks for exactly this layout. Both POST the same `/retry`, which re-runs the lookup (Plan 06-05). Worth checking in the end-of-phase visual pass.

## Known Stubs

None. The RED stubs were replaced in the GREEN commits.

## Threat Flags

None. All server text is rendered as React text. The Open Settings href is the fixed `/settings` (T-06-20). Retry uses the existing same-origin route (T-06-21).

## Next Phase Readiness

- Plan 06-09 can put the selection checkbox in the compact header and the SpineCard `leading` slot. The tab order (checkbox, crop link, Retry import, Edit spine) is already right.
- End-of-phase visual checks: a 40-character country in the fallback line, and a 120-character photo name in the skipped line, both at 264px.

## Self-Check: PASSED

- src/components/country-badge.tsx and src/components/bulk-status-line.tsx exist.
- Commits 9c28992, 0c7d731, 48838e8 and 6f15d76 are ancestors of HEAD.
