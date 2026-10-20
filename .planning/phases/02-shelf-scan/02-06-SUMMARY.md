---
phase: 02-shelf-scan
plan: 06
subsystem: upload-ui
tags: [upload, polling, tanstack-query, nuqs, status-badges, tracer, tdd]
status: complete

requires:
  - phase: 02-03
    provides: PhotoDto / PhotosResponse contract, GET /api/photos, listPhotos()
  - phase: 02-04
    provides: scan_photo handler (real status transitions), verify-scan steps a-n
  - phase: 02-05
    provides: errorReason, densityFlags and truncated filled on PhotoDto
provides:
  - Providers (QueryClientProvider + NuqsAdapter) in the root layout
  - PhotoStatusList (initialPhotos, pendingRows, duplicateIds) polling ['photos']
  - PhotoStatusRow, RowThumb, RowFilename
  - PhotoStatusBadge + badgeFor() (single status mapping, incl. client waiting/uploading)
  - DensityBadge, IncompleteBadge
  - statusView, pluralize, formatElapsed, isActiveStatus, photosRefetchInterval, incompleteTooltip
  - /upload page with CLI-not-ready Alert and the Photos list
affects: [02-07 dropzone and upload queue, 02-08 polled spines list, 02-10 re-scan button on rows]

estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 8560
  tasks: 2
  commits: 3
plan_head_before: 0bef599a72191823c1720829dd1390e19e533abc
plan_head_after: fc72abd314a2229654706e5b04e62e861f8bae87

tech-stack:
  added: ["@tanstack/react-query 5.104.2", "nuqs 2.10.1", "react-dropzone 20.1.3"]
  patterns:
    - "Server page passes listPhotos() as initialData; the client query takes over with refetchInterval as a function (1500 ms while any photo is active, else false)"
    - "Status-to-badge mapping lives only in badgeFor(); components never switch on status for labels"
    - "Warning badges: outline Badge inside a button type=button Tooltip trigger, warning color on the icon only"
    - "Untrusted text (filenames, error reasons) rendered only as React text children and title attributes"

key-files:
  created:
    - src/app/providers.tsx
    - src/components/photo-status-list.tsx
    - src/components/photo-status-row.tsx
    - src/components/photo-status-badge.tsx
    - src/components/density-badge.tsx
    - src/lib/photo-status.ts
    - src/lib/photo-status.test.ts
    - .planning/phases/02-shelf-scan/tdd-evidence/02-06-task2-red.json
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/app/layout.tsx
    - src/app/upload/page.tsx
    - scripts/verify-scan.ts
    - scripts/verify-skeleton.ts
    - scripts/verify-claude-cli.ts

key-decisions:
  - "PhotoStatusBadge takes a status (server PhotoStatus or client waiting/uploading) and an optional label; badgeFor() is the single mapping, so 02-07 client rows and 02-08 section headers reuse it"
  - "Photos rows are separated with divide-y on the ul rather than Separator elements, so pendingRows can be any ReactNode and row keys stay stable"
  - "The May be incomplete tooltip uses detectedCount (falling back to spineCount) as the returned count, matching how PhotoDto.truncated is computed"

requirements-completed: [INGEST-02]

coverage:
  - deliverable: "/upload server-renders and polls each photo to its final status with a View spines link"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "scripts/verify-scan.ts#stepUploadPage (i2)"
        status: pass
      - kind: unit
        ref: "src/lib/photo-status.test.ts#photosRefetchInterval"
        status: pass
  - deliverable: "Status labels, sub-lines, pluralization and m:ss timer per the UI-SPEC mapping"
    human_judgment: false
    verification:
      - kind: unit
        ref: "src/lib/photo-status.test.ts (13 tests)"
        status: pass
  - deliverable: "CLI-not-ready Alert with Open Settings, and the empty Photos list copy"
    human_judgment: false
    verification:
      - kind: e2e
        ref: "scripts/verify-skeleton.ts#stepShellPages; scripts/verify-claude-cli.ts (c), (e), (f), (g)"
        status: pass
  - deliverable: "Density/incomplete badges with tooltips, clamped error reasons, Couldn't refresh poll-error Alert, layout at 360px and 1280px"
    human_judgment: true
    rationale: "Tooltip behavior, overflow at 360px/1280px and the poll-error state when the server is stopped are visual and live-session checks; the plan routes them to end-of-phase human verification"

duration: 6min
completed: 2026-10-20
---

# Phase 2 Plan 06: Polled Photos list on /upload Summary

**/upload now server-renders every photo with its status from `listPhotos()`, then polls `GET /api/photos` every 1.5 s through TanStack Query while any photo is queued or analyzing. The status mapping lives in one place (`badgeFor` / `statusView`), the sub-line includes a ticking m:ss timer while Claude reads, done rows link to `/spines?photo={id}`, and there are warning badges, clamped error reasons and a "Couldn't refresh" state.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-20T04:10:47Z
- **Completed:** 2026-10-20T04:16:46Z
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files modified:** 15

## Accomplishments

- `Providers` (one QueryClient per mount, `refetchOnWindowFocus: true`, NuqsAdapter) wrap AppHeader and main inside TooltipProvider.
- `PhotoStatusList` polls only while there is work in progress. It accepts `pendingRows` and `duplicateIds` for Plan 02-07, and shows the empty copy "No photos yet. Photos you drop appear here with their progress." when there are no rows.
- `PhotoStatusRow` shows a 48px thumbnail or muted placeholder, then the truncated filename with a title, then the sub-line. While the status is `calling`, a one-second timer counts up in mono. Error reasons show as destructive text, clamped to 3 lines with the full text in the title. Done rows can carry Retake closer and May be incomplete badges and a View spines link.
- The `/upload` page has the title block, the "The Claude CLI isn't ready" Alert with an accent Open Settings button, and the Photos list, in a `max-w-3xl` column.
- The three e2e scripts now assert the new page. verify-scan has a new step (i2): the done photo's row and its `href="/spines?photo={id}"` link.

## Task Commits

1. **Task 1: Tracer, /upload polls a photo from Queued to Done:** `fa9c011` (feat)
2. **Task 2: status, badges and poll error per the UI contract:** `6734a0f` (test, RED), `fc72abd` (feat, GREEN)

## TDD Gate Compliance

- **RED:** the target "incompleteTooltip > reads the estimate and the returned count" ran against a stub that returns an empty string and failed its `toBe` assertion (actual `''`). Classifier verdict: `RED_EVIDENCE_OK`. Record: `tdd-evidence/02-06-task2-red.json`. Semantic check: the target ran and failed for the intended reason. The other 12 tests characterize helpers the Task 1 tracer already built (the plan's tracer action specifies them), so they passed at RED.
- **GREEN:** `fc72abd`, all 13 tests pass.
- **REFACTOR:** none needed.

## Decisions Made

See `key-decisions` in the frontmatter. In short: `badgeFor()` is the only status mapping, rows are separated with `divide-y`, and the incomplete tooltip counts `detectedCount`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify-claude-cli decoded HTML entities and stopped asserting the old copy**
- **Found during:** Task 1
- **Issue:** React escapes the apostrophe in "isn't" as `&#x27;`, so a raw `includes` would never match "The Claude CLI isn't ready". Steps (e), (f) and (g) also asserted the removed placeholder copy ("Set up the Claude CLI") and the lack of the empty-list text, but that text now renders on every empty data folder.
- **Fix:** `getPage` decodes entities, the same way verify-skeleton does. The not-ready steps now assert "The Claude CLI isn't ready" plus Open Settings, and the ready step asserts the empty-list copy and the absence of the Alert.
- **Files modified:** scripts/verify-claude-cli.ts
- **Commit:** fa9c011

**2. [Rule 2 - Missing] Session duplicate badge and empty-list copy wired in Task 1**
- The empty-list copy was needed in Task 1 because verify-claude-cli's new ALREADY_SET_UP assertion depends on it. The `duplicateIds` prop renders the secondary "Already uploaded" badge, so the prop is not dead code. Plan 02-07 only has to pass the Set.
- **Commit:** fa9c011

**3. [Rule 2 - Missing] Clock-skew guard in formatElapsed**
- A negative or non-finite elapsed time (spawnedAt ahead of the browser clock) reads 0:00 instead of a negative timer. This is covered by a test.

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical). **Impact:** no scope change.

## Issues Encountered

None.

## Verification

- `corepack pnpm vitest run src/lib/photo-status.test.ts`: 13 passed
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`: clean
- `corepack pnpm test`: 353 passed
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`: `verify-scan OK`, including (i2)
- `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts`: `verify-skeleton OK`
- `VERIFY_SKIP_BUILD=1 node scripts/verify-claude-cli.ts`: `verify-claude-cli OK`
- Acceptance greps: each package at its exact version 1; `<Providers>` 1; "Upload isn't built yet" in verify-skeleton 0; `refetchInterval` 1; "Retake closer" 1; "May be incomplete" 1; "Couldn't refresh" 1; `line-clamp-3` 1
- Tracer gate (auto mode): the tracer verify was re-run end to end and passed before Task 2
- Human checks (live poll with a ticking timer, tooltips, overflow at 360px and 1280px, the poll error with the server stopped) are deferred to end-of-phase verification, per `human_verify_mode: end-of-phase`

## Next Phase Readiness

Ready for 02-07 (dropzone and upload queue on top of `PhotoStatusList` `pendingRows` / `duplicateIds`).

## Self-Check: PASSED

- All 8 created files exist on disk
- Commits fa9c011, 6734a0f and fc72abd are ancestors of HEAD
