---
phase: 02-shelf-scan
plan: 08
subsystem: review-ui
tags: [spines, polling, react-query, nuqs, sticky-header, tracer]
status: complete

requires:
  - phase: 02-03
    provides: SpinesResponse / PhotoDto / SpineDto contract, listPhotos
  - phase: 02-04
    provides: listSpines, /api/files crops, server-rendered /spines tracer
  - phase: 02-06
    provides: Providers (QueryClient + NuqsAdapter), PhotoStatusBadge, DensityBadge, IncompleteBadge, photo-status helpers
provides:
  - getSpines({ photoId }) read model with counts { all, needsReview }, confidenceThreshold, densityMaxSpines
  - GET /api/spines (?photo= filter; unknown id returns no photos)
  - src/lib/spine-review.ts pure helpers (normalizeFieldInput, isEdited, isLowConfidence, worstField, editedCount, confidencePct, needsReview, spineNumber, formatRelativeTime)
  - SpinesView (polled list, title block, page-level empty/error states)
  - PhotoSection (sticky header, section states)
  - SpineCard (badges, statusSlot, footer props) and SpineCrop (Crop unavailable fallback)
  - src/app/spines/loading.tsx
  - verify-scan steps (k) header/description, (k2) order and crops, (o) photo filter
affects: [02-09 field editing (SpineCard fields, badges slot), 02-10 re-scan (RescanButton in the section header), 02-12 filters (needsReview count, filter bar)]

actuals:
  tokens: 8400
  tasks: 2
  commits: 2
plan_head_before: 2fae4f6988cb4bd1a04b7dc734ad488e4bb3fdbf
plan_head_after: f08612e24521025c7d33469c51cae48653b8c704

tech-stack:
  added: []
  patterns:
    - "Server-rendered initialData for the query key that matches the URL, then refetchInterval via photosRefetchInterval (1.5 s while active)"
    - "Section header sticks at top-14 inside its own <section>, so the next section pushes it out"
    - "Slots on SpineCard (badges, statusSlot, footer) render nothing, separator included, when empty (D-11)"
    - "Relative-time sub-line is a single text node with suppressHydrationWarning, refreshed by a local useNow"

key-files:
  created:
    - src/app/api/spines/route.ts
    - src/lib/spine-review.ts
    - src/lib/spine-review.test.ts
    - src/app/spines/loading.tsx
    - src/components/spines-view.tsx
    - src/components/photo-section.tsx
    - src/components/spine-card.tsx
    - src/components/spine-crop.tsx
  modified:
    - src/server/scan/queries.ts
    - src/app/spines/page.tsx
    - scripts/verify-scan.ts

key-decisions:
  - "The card shows #{index + 1}: Claude's index is 0-based (prompt.ts), so spineNumber() gives the owner 1, 2, 3; alt text uses the same number"
  - "counts.all and the page description count the returned (photo-filtered) spines; Needs review counts low-confidence spines only (A-16)"
  - "Every photo gets a section: done with 0 spines shows No CDs found, an error with no spines shows the Scan failed Alert"

requirements-completed: [REV-01]

duration: 7min
completed: 2026-10-20
---

# Phase 2 Plan 08: Polled spines list Summary

**/spines is now a client list that polls GET /api/spines. Each photo has a sticky header showing its thumbnail link, filename, `{n} spines · {model} · scanned {time}` and its status and warning badges. Below the header, each spine card shows the crop on top and Claude's six fields underneath. First-run, failed, empty, unknown-photo and failed-poll states all render.**

## Performance

- **Duration:** about 7 min
- **Started:** 2026-10-20T04:27:34Z
- **Completed:** 2026-10-20T04:34:44Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 11

## Accomplishments

- `getSpines` and `GET /api/spines` return photos newest first, active spines in detection order, counts, the threshold and the density N. `?photo=` narrows the result to one photo, and an unknown id returns nothing.
- `SpinesView` server-renders from `initialData` and then refetches every 1.5 s while any photo is queued or analyzing. Cards are keyed by spine id, so they stay mounted across polls.
- `SpineCard` (D-08/D-11) has a `#n` header with a right-aligned status slot, then the crop in a muted well (real width and height, lazy, async, linked), then the 6/2/1-column field grid with "Not read". The footer slot renders nothing when empty.
- `PhotoSection` has a sticky `top-14` header, three skeleton cards on a first run, the "Scan failed" and "Re-scan failed. Showing the previous scan." Alerts, and the "No CDs found" Empty. Badges wrap under the filename below 640px.
- Page states: "No spines yet" with an accent "Upload photos" button, "Photo not found" with an outline "Show all photos" button that clears `?photo`, the "Couldn't refresh" Alert above the last data, and `spines/loading.tsx`.

## Task Commits

1. **Task 1 (tracer): /spines fills in by itself.** `97a75b5` (feat)
2. **Task 2: Photo sections, states and fallbacks.** `f08612e` (feat)

## Decisions Made

- The displayed spine number is `index + 1`, because Claude's index is 0-based in reading order. Plans 02-09, 02-10 and 02-12 should use `spineNumber()` for `#n`, re-attach and dismiss copy.
- `counts.all` and the description count the spines in the response, which respects `?photo=`.
- Every photo gets a section. The "omit sections with no matching spines" rule only applies under 02-12's filters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Crop error fallback before hydration**
- **Found during:** Task 2
- **Issue:** A server-rendered `<img>` can fail before React attaches `onError`, which would leave a broken image instead of the fallback.
- **Fix:** On mount, if the img is complete, has a `currentSrc` and has `naturalWidth` 0, it switches to "Crop unavailable". Lazy imgs that have not been requested have no `currentSrc`, so they are skipped.
- **Files modified:** src/components/spine-crop.tsx
- **Commit:** f08612e

**2. [Rule 2 - Tests] Unit tests for spine-review helpers**
- `src/lib/spine-review.test.ts` (14 tests) covers the strict threshold, exact edit compare, worst field tie-break, relative time and the 1-based number.
- **Commit:** 97a75b5

**3. [Rule 1 - Bug] The page description must be one text node**
- **Found during:** Task 2 (verify-scan)
- **Issue:** JSX interpolation splits the text with `<!-- -->` markers, so "6 spines from 1 photo." was never one contiguous string. The same split would also affect hydration warnings.
- **Fix:** The description is a single template string.
- **Files modified:** src/components/spines-view.tsx
- **Commit:** f08612e

**4. [Structure] The title block lives in SpinesView**
- The plan put the title block in `page.tsx`. The description has live, polled counts, so `SpinesView` renders both the h1 and the description. The page stays server-side: it awaits `connection()` and `searchParams` and passes `getSpines()` as `initialData`.

---

**Total deviations:** 4 (1 bug, 2 missing critical, 1 structural). **Impact:** no scope change.

## Issues Encountered

None.

## Verification

- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`: clean
- `corepack pnpm test`: 26 files, 378 tests passed
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`: `verify-scan OK`, including (k) header link and "6 spines from 1 photo.", (k2) 6 spines with indexes 0..5 and horizontal crops, and (o) 1 of 2 photos with an unknown id listing nothing
- `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts`: `verify-skeleton OK` ("No spines yet" on an empty folder)
- Acceptance greps: getSpines 1, refetchInterval 1, GET 1, top-14 1, Re-scan failed 1, No CDs found 3, Crop unavailable 1, Photo not found 1, loading.tsx present
- Tracer gate (auto mode): verify re-run end to end and passed before Task 2

## Human checks deferred to end-of-phase verification

- Watch a section appear and fill on /spines while an upload runs in another tab.
- At 360px, headers should stick, badges wrap and filenames truncate.
- A 20:1 crop and a 4:1 crop should both render in full (backstop).
- Scrolling 500 cards should stay responsive (backstop).

## Next Phase Readiness

- 02-09 can replace the read-only `<dd>` values in `SpineCard` with `SpineField` and fill the `badges` slot (worst field) and the `statusSlot` (`Edited · n`) using `spine-review.ts`.
- 02-10 can add `RescanButton` to the end of the `PhotoSection` header row.
- 02-12 can add the filter bar above the sections and extend `needsReview` with orphaned spines.

## Self-Check: PASSED

- All 8 created files exist on disk. Commits 97a75b5 and f08612e are ancestors of HEAD.
