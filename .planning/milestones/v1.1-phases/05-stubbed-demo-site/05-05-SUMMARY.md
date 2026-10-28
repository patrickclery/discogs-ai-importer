---
phase: 05-stubbed-demo-site
plan: 05
subsystem: demo-runtime
tags: [demo, upload, rescan, static-export]
status: complete

requires: ["05-01", "05-03"]
provides:
  - "src/demo/ops/uploads.ts: demoFilename, addUploadedPhoto (about 3 s run plus a pristineShelf copy at doneAt), rescanPhoto, RUN_OFFSETS"
  - "src/demo/routes/uploads.ts: POST /api/photos (reads x-filename only), POST /api/photos/:id/rescan (the real 201/409/404/415)"
  - "src/app/upload/page.demo.tsx, src/app/page.demo.tsx (redirect to /upload), src/app/error.demo.tsx (the real error screen)"
affects: [05-06, 05-07, 05-08]

actuals:
  tokens: 5100
  tasks: 2
  commits: 3
plan_head_before: 1db7c4dc1c373ad0b99cd4417c30da2c2f9a73f7
plan_head_after: aa229e75928c655b7c9beb6f20536c188fefe661

tech-stack:
  added: []
  patterns:
    - "Photo runs are timestamp offsets from queuedAt (400/900/2400/3000 ms); the read model derives the status from now()"

key-files:
  created:
    - src/demo/ops/uploads.ts
    - src/demo/ops/uploads.test.ts
    - src/app/upload/page.demo.tsx
    - src/app/page.demo.tsx
    - src/app/error.demo.tsx
  modified:
    - src/demo/routes/uploads.ts

key-decisions:
  - "Uploaded file names are cleaned the same way as the real sanitizeFilename: decoded (or kept as is when malformed), with control characters and path separators removed, trimmed and capped at 255. Since the bytes are never read, the fallback name is always photo.jpg."
  - "Re-scan keeps the photo's spines and their states, and only the new run animates. runId is <photoId>-run-<runNo>, the same format as the read model's createdRunId."
  - "The rescan route never answers cli_unavailable because the demo's Claude CLI is always ready (D-12)."

requirements-completed: [DEMO-08, DEMO-09]

coverage:
  - id: U1
    description: "Dropped photo: 201 from the file name alone with the body readers never called; queued to done at +3000 ms; 61-spine copy whose searches settle; sample shelf untouched; duplicate 409 against the sample's import"
    requirement: DEMO-08
    verification:
      - kind: unit
        ref: "src/demo/ops/uploads.test.ts"
        status: pass
  - id: U2
    description: "Re-scan answers the real 201 body, 409 run_active, 404 and 415, and keeps the spines"
    requirement: DEMO-08
    verification:
      - kind: unit
        ref: "src/demo/ops/uploads.test.ts"
        status: pass
  - id: U3
    description: "Root, Upload and Spines export with the banner, the expected markers and zero /api requests"
    requirement: DEMO-09
    verification:
      - kind: e2e
        ref: "node scripts/demo/build-demo.ts && node scripts/demo/smoke.ts --expect \"/=Drop photos of your CD shelves\" --expect \"upload/=cd-spines.heic\" --expect \"spines/=cd-spines.heic\""
        status: pass

duration: 4min
completed: 2026-10-23
---

# Phase 5 Plan 05: Demo Upload, Re-scan, Root and Error Pages Summary

**In the demo, dropping any photo now plays a fake 3-second analysis in the real upload row and then adds a fresh 61-spine copy of the sample shelf. That copy's Discogs lookups finish from the recordings. The file itself is never read: only its name is used. Re-scan animates a new run, the base URL lands on Upload, and the app's own error screen is kept.**

## Performance

- **Duration:** about 4 min
- **Tasks:** 2
- **Files:** 6 (5 created, 1 modified)

## Accomplishments

- `POST /api/photos` uses only the `x-filename` header and answers `201 {photoId, duplicate:false}`. A test passes a body whose `arrayBuffer`, `text`, `stream`, `bytes` and `blob` are spies, sends it through the real `toDemoRequest` and `handle()`, and confirms none of them is called.
- An uploaded photo moves through queued (0 ms), preparing (+400), calling (+900, spawnedAt set), parsing (+2400) and done (+3000). Its spines appear only at done (61 of them). Every search then reaches done or no_match, `discogsActive` goes false and the backlog is 0.
- Confirming release 09 from the sample shelf on the copy answers the duplicate 409 with `photo: cd-spines.heic`.
- `POST /api/photos/:id/rescan` answers 201 `{runId, runNo}`, or the real 409 `run_active`, 404 `not_found` or 415. `hasEarlierScan` stays true during the new run, and the spines and their states are unchanged.
- Verification: the full suite passes 1722 of 1722, and tsc and biome are clean. The scratch demo export passed verify-export (382 files, rules a to h) and showed `/`, `/upload` and `/spines` as static. Smoke passed on 3 pages with zero `/api` requests. The only 404s were the expected `/settings/` prefetch warnings (that page arrives in 05-07).

## Task Commits

1. **Task 1: Fake analysis, second shelf copy and Re-scan:** `38723f1` (test, RED), `ecbac96` (feat, GREEN)
2. **Task 2: Upload page, root redirect and error page:** `aa229e7` (feat)

## TDD Gate Compliance

- RED `38723f1`: all 9 upload tests failed against the empty route group (501).
- GREEN `ecbac96`: 9 of 9 pass, and src/demo passes 116 of 116.
- No refactor commits.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Rescan's 415 guard and the filename cleaning**
- **Found during:** Task 1
- **Issue:** The real rescan route refuses non-JSON requests with 415. The real ingest also removes control characters and path separators from file names. The plan did not mention either.
- **Fix:** Both are mirrored in the demo and tested.
- **Commit:** ecbac96

**Total deviations:** 1. **Impact:** no scope change. The real app is untouched.

## Known Stubs

None.

## Threat Flags

None. T-05-22 is mitigated: the shim passes only string bodies, the route reads only `x-filename`, a spy test proves the body is never read, and smoke saw no `/api` network requests. T-05-27 is accepted as planned: the name is decoded safely, cleaned, capped at 255 characters and rendered as React text.

## Self-Check: PASSED
