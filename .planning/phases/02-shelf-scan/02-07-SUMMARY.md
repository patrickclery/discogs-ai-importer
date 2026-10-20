---
phase: 02-shelf-scan
plan: 07
subsystem: upload-ui
tags: [upload, react-dropzone, tanstack-query, sonner, a11y, tracer, tdd]
status: complete

requires:
  - phase: 02-03
    provides: POST /api/photos raw-body contract, UploadResponse, UploadErrorBody, MAX_UPLOAD_BYTES, ACCEPTED_UPLOAD_TYPES
  - phase: 02-04
    provides: getDensityThresholds() (density_max_spines)
  - phase: 02-06
    provides: PhotoStatusList (pendingRows, duplicateIds), PhotoStatusRow, PhotoStatusBadge, pluralize, /upload page and CLI-not-ready Alert
provides:
  - Dropzone (react-dropzone wrapper with idle, accept, reject and disabled states)
  - UploadView (client upload queue, failure rows, duplicate badges, live region)
  - uploadPhoto, uploadErrorMessage, createUploadQueue, terminalAnnouncements (src/lib/upload-queue.ts)
  - ClientUploadRow (waiting, uploading, failed with Retry upload / Remove from list)
  - UploadTip (D-03) and src/app/upload/loading.tsx
affects: [02-08 polled spines list (invalidated ['spines'] key), 02-10 re-scan button on /upload rows]

estimate:
  tokens: 55000
  tasks: 3
actuals:
  tokens: 6772
  tasks: 3
  commits: 4
plan_head_before: b610d60398e7945f7d19bf4744edc3d3044a44bc
plan_head_after: f703df5408ac5609e6a9fd466e63cc3033431e36

tech-stack:
  added: []
  patterns:
    - "One POST per File through a FIFO queue capped at 2 in flight; the client row stays until the invalidated ['photos'] refetch lands, so a photo never blinks out"
    - "Live region observes the shared ['photos'] query through queryCache.subscribe instead of a second useQuery observer, so it never competes for query options"
    - "Files the dropzone refuses become failed rows without Retry (never sent); failed POSTs keep Retry, which re-queues the same File"

key-files:
  created:
    - src/components/dropzone.tsx
    - src/components/upload-view.tsx
    - src/components/upload-tip.tsx
    - src/lib/upload-queue.ts
    - src/lib/upload-queue.test.ts
    - src/app/upload/loading.tsx
    - .planning/phases/02-shelf-scan/tdd-evidence/02-07-task2-red.json
  modified:
    - src/components/photo-status-row.tsx
    - src/app/upload/page.tsx
    - scripts/verify-claude-cli.ts

key-decisions:
  - "Unknown non-2xx upload responses (proxy refusal, 5xx) map to the network copy: retry once the app is healthy is the only useful action"
  - "length_required reads the cut-off copy and empty reads the image-unreadable copy, since the UI-SPEC has no dedicated text for either"
  - "Retry upload is offered only for files that were actually sent; dropzone-refused files get Remove from list only"
  - "The dropzone root uses role=group with aria-label, because react-dropzone's default role=presentation would drop the label"

requirements-completed: [INGEST-01, INGEST-03]

coverage:
  - id: D1
    description: "Each dropped file is its own POST /api/photos, at most 2 in flight, with Waiting to upload / Uploading… rows before the server row"
    requirement: INGEST-01
    verification:
      - kind: unit
        ref: "src/lib/upload-queue.test.ts#createUploadQueue > starts tasks in insertion order with at most 2 in flight"
        status: pass
      - kind: unit
        ref: "src/lib/upload-queue.test.ts#uploadPhoto > sends the raw File with its type and the encoded name"
        status: pass
    human_judgment: true
    rationale: "Drag-and-drop in a real browser, the row transitions and HEIC picking need a live session; routed to end-of-phase human verification"
  - id: D2
    description: "Identical re-upload removes the client row, badges the existing row Already uploaded and toasts that no Claude call was made"
    requirement: INGEST-03
    verification:
      - kind: unit
        ref: "src/lib/upload-queue.test.ts#uploadPhoto > maps a 200 duplicate body to ok with duplicate true"
        status: pass
      - kind: e2e
        ref: "scripts/verify-scan.ts (e) re-upload of the same bytes"
        status: pass
    human_judgment: true
    rationale: "Badge and toast are only visible in a live browser session"
  - id: D3
    description: "Upload failure copy (cut off, network, unsupported, too large), Retry upload and Remove from list"
    verification:
      - kind: unit
        ref: "src/lib/upload-queue.test.ts#uploadErrorMessage (4 tests), uploadPhoto 415/400/rejected fetch"
        status: pass
    human_judgment: true
    rationale: "The 70 MB refusal and the stopped-server retry are live-session checks in the plan"
  - id: D4
    description: "Polite live region announces only done / scan failed transitions"
    verification:
      - kind: unit
        ref: "src/lib/upload-queue.test.ts#terminalAnnouncements (3 tests)"
        status: pass
    human_judgment: true
    rationale: "Screen-reader announcement timing is not automatable here (assumption A-12)"
  - id: D5
    description: "D-03 tip, disabled dropzone when the CLI is not ready, and the upload loading skeleton"
    verification:
      - kind: e2e
        ref: "scripts/verify-claude-cli.ts (ready step asserts Drop shelf photos here; not-ready steps assert the Alert)"
        status: pass
      - kind: e2e
        ref: "scripts/verify-skeleton.ts"
        status: pass
    human_judgment: true
    rationale: "Dimmed styling, ignored drops and the skeleton flash are visual checks"

duration: 6min
completed: 2026-10-20
---

# Phase 2 Plan 07: Drag-and-drop upload on /upload Summary

**/upload now has a react-dropzone drop target that sends each photo as its own raw-body POST, two at a time. Rows go Waiting to upload, then Uploading…, then the polled server row. Refused and failed uploads stay in the list with the UI-SPEC copy, plus Retry upload and Remove from list. A duplicate upload gets an "Already uploaded" badge and a toast that no Claude call was made. A polite live region announces only finished or failed scans. The page also has the D-03 tip, a disabled dropzone when the CLI isn't ready, and a loading skeleton.**

## Performance

- **Duration:** about 6 min
- **Started:** 2026-10-20T04:19:06Z
- **Completed:** 2026-10-20T04:25:26Z
- **Tasks:** 3 (1 tracer, 1 TDD, 1 auto)
- **Files modified:** 10

## Accomplishments

- `Dropzone` handles the idle, drag-accept (accent), drag-reject (destructive) and disabled states. Its root has the label "Upload shelf photos" and opens the picker on Enter or Space. "Choose photos" stops propagation so the picker opens only once.
- `UploadView` runs a `createUploadQueue({ concurrency: 2 })`. On success it invalidates `['photos']` and `['spines']` and dispatches `app:status-refresh`. It drops the client row only after the refetch, so the photo never blinks out of the list.
- `ClientUploadRow` covers waiting, uploading and failed rows. A failed row shows the reason as destructive text, an outline "Retry upload" button and a ghost "Remove {filename} from the list" button.
- Duplicate photo ids go into a session Set that is passed to `PhotoStatusList` as `duplicateIds`. The toast uses the exact INGEST-03 copy.
- `UploadTip` reads `density_max_spines`. `upload/loading.tsx` shows Skeletons at h-8 w-32, h-48 and h-40 with 24px gaps.

## Task Commits

1. **Task 1: Tracer, the owner drops a photo and it uploads, appears in the list and polls to Done:** `84c3090` (feat)
2. **Task 2: Upload failures, duplicates and retries, announced:** `acac517` (test, RED), `9794564` (feat, GREEN)
3. **Task 3: D-03 tip, disabled dropzone, loading skeleton:** `f703df5` (feat)

## TDD Gate Compliance

- **RED (`acac517`):** the target "terminalAnnouncements > announces a scan failure" ran against a stub that returns `[]` and failed its `toBe` assertion (actual `''`). Classifier verdict: `RED_EVIDENCE_OK`, recorded in `tdd-evidence/02-07-task2-red.json`. Semantic check: the target ran and failed for the intended reason. In the same RED run, the cut-off copy and the two filename-interpolation targets also failed, against the Task 1 `uploadErrorMessage` stub. Their TAP diagnostics contain an apostrophe that Vitest writes as an invalid YAML escape (`\'`), so the classifier can't parse them, and the announcement target was used for the machine record instead. The queue and `uploadPhoto` tests describe code the Task 1 tracer already built, so they passed at RED.
- **GREEN (`9794564`):** all 15 tests pass, and the full suite passes (368 tests).
- **REFACTOR:** none needed.

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ClientUploadRow added to photo-status-row.tsx in Task 1**
- **Found during:** Task 1
- **Issue:** The tracer needs Waiting/Uploading rows, but Task 1's file list left out photo-status-row.tsx, where the row primitives (`RowThumb`, `RowFilename`) live.
- **Fix:** Added `ClientUploadRow` (waiting/uploading) there in Task 1. Task 2 extended it with the failed variant.
- **Commit:** 84c3090

**2. [Rule 2 - Missing] terminalAnnouncements helper, plus tests for it**
- **Issue:** The plan's live region had no testable unit, and its transition rule (announce only active-to-terminal, skip photos not seen before) is easy to get wrong.
- **Fix:** Added a pure `terminalAnnouncements(previous, photos)` to `upload-queue.ts` with 3 tests. `UploadView` feeds it from `queryCache.subscribe`.
- **Commit:** acac517, 9794564

**3. [Rule 1 - Bug] Dropzone role and double-open**
- **Issue:** react-dropzone defaults the root to `role="presentation"`, which drops `aria-label`. The nested button's click also bubbles to the root's open handler.
- **Fix:** The root uses `role: 'group'`, and the button calls `stopPropagation()` before `open()`.
- **Commit:** 84c3090

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 missing critical, 1 bug). **Impact:** no scope change.

## Issues Encountered

- The TAP evidence classifier rejected Vitest output with a multi-line `expected` value and with `\'` escapes. The target assertion was made single-line (`join` + `toBe`), and an apostrophe-free target was chosen.

## Verification

- `corepack pnpm vitest run src/lib/upload-queue.test.ts`: 15 passed
- `corepack pnpm test`: 368 passed
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`: clean
- `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts`: `verify-skeleton OK`
- `VERIFY_SKIP_BUILD=1 node scripts/verify-claude-cli.ts`: `verify-claude-cli OK`
- `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`: `verify-scan OK`
- Acceptance greps all at the expected counts (useDropzone 2, "Drop shelf photos here" 1, "concurrency: 2" 1, UploadView in page 2, "Already uploaded" 1, aria-live 1, "from the list" 1, tip 1, aria-disabled 1 file, loading.tsx present, verify-claude-cli 1)
- Tracer gate (auto mode): the tracer verify was re-run end to end and passed before Task 2
- Human checks (real drag-and-drop with HEIC, a PDF reject, a duplicate drop, a 70 MB file, retry after a server restart) are deferred to end-of-phase verification, per `human_verify_mode: end-of-phase`

## Next Phase Readiness

Ready for 02-08. Uploads already invalidate `['spines']`, so the spines list only needs to use that key.

## Self-Check: PASSED

- All 7 created files exist on disk
- Commits 84c3090, acac517, 9794564 and f703df5 are ancestors of HEAD
