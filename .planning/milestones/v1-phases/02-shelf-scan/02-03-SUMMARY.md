---
phase: 02-shelf-scan
plan: 03
subsystem: ingest
tags: [upload, dedup, sqlite, drizzle, migration, proxy, route-handler]
status: complete

requires:
  - phase: 02-01
    provides: vision-contract constants (SPINE_FIELDS, PROMPT_VERSION, SCHEMA_VERSION), ImageKind
  - phase: 01
    provides: jobs queue, getDb/runMigrations, resolveData, newId, proxy Origin guard, scripts/lib harness
provides:
  - Phase 2 schema (photos, vision_runs, spine_detections, spines, spine_fields) and migration 0001_shelf_scan
  - enqueue() maxAttempts option (1..10, default 3)
  - POST /api/photos (raw one-file upload, magic-byte check, sha256 dedup) and GET /api/photos (PhotosResponse)
  - ingestUpload(), sanitizeFilename(), originalPathFor()
  - listPhotos(), getPhoto(), fileUrl()
  - detectImageKind(), extensionFor(), mimeFor()
  - Client-safe scan-types DTOs and constants for Plans 02-04..02-12
  - scripts/verify-scan.ts steps a-h
affects: [02-04 scan job, 02-06 upload page, 02-07, 02-08 spines page, 02-09, 02-10 re-scan merge]

actuals:
  tokens: 18900
  tasks: 2
  commits: 2
plan_head_before: db2a6f3434a3f50ad59d098a2f2098ec242d1006
plan_head_after: 0bdee6ddbb0618681309e6212ce334abffb390c4

tech-stack:
  added: []
  patterns:
    - "Content-addressed originals: photos/SHA[0..2]/SHA.EXT, temp file + rename, written before the row commits"
    - "Photo + run 1 + one-shot scan job (maxAttempts 1, dedupe scan:<photoId>:<runNo>) in one .immediate() transaction"
    - "Upload refusals (415/411/413/400) all return before any write; the body length must equal Content-Length"
    - "Client-safe enums (PHOTO_STATUSES, SPINE_STATES) live in src/lib/scan-types.ts and the schema imports them"

key-files:
  created:
    - drizzle/0001_shelf_scan.sql
    - drizzle/meta/0001_snapshot.json
    - src/lib/scan-types.ts
    - src/server/images/detect.ts
    - src/server/images/detect.test.ts
    - src/server/scan/ingest.ts
    - src/server/scan/ingest.test.ts
    - src/server/scan/queries.ts
    - src/app/api/photos/route.ts
    - scripts/verify-scan.ts
  modified:
    - src/server/db/schema.ts
    - drizzle/meta/_journal.json
    - src/server/jobs/queue.ts
    - src/server/jobs/queue.test.ts
    - scripts/verify-skeleton.ts
    - next.config.ts

key-decisions:
  - "photos.latest_run_id and spines.current_detection_id are plain text columns without FKs (circular references); integrity is kept by the ingest/scan transactions"
  - "hasEarlierScan = an earlier run (lower run_no) of the photo has status done; visionUrl comes from the newest run with a vision_path"
  - "Filename sanitizer strips \\p{Cc} plus bidi overrides/isolates (U+202A-202E, U+2066-2069) as well as / and \\"
  - "enqueue() throws on maxAttempts outside integers 1..10 rather than clamping"

patterns-established:
  - "verify-scan uploads with global fetch and a Blob body (sets Content-Length); DB assertions open app.db read-only"

requirements-completed: [INGEST-01, INGEST-03]

coverage:
  - id: D1
    description: "Live app.db after boot has the five scan tables and one __drizzle_migrations row per drizzle/*.sql"
    requirement: "INGEST-01"
    verification:
      - kind: integration
        ref: "node scripts/verify-scan.ts step (a); VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts step (c)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A JPEG POST returns 201, is stored by sha256, and creates one queued run 1 and one scan_photo job (max_attempts 1, dedupe scan:ID:1); GET /api/photos lists it as queued"
    requirement: "INGEST-01"
    verification:
      - kind: integration
        ref: "node scripts/verify-scan.ts steps (b)-(d)"
        status: pass
      - kind: unit
        ref: "src/server/scan/ingest.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Concurrent and repeat identical uploads return the same photoId with duplicate true and create no extra photo, run or job (zero Claude calls)"
    requirement: "INGEST-03"
    verification:
      - kind: integration
        ref: "node scripts/verify-scan.ts steps (b), (e)"
        status: pass
      - kind: unit
        ref: "src/server/scan/ingest.test.ts#identical bytes"
        status: pass
    human_judgment: false
  - id: D4
    description: "maxAttempts 1 jobs fail on first failure and on boot recovery, never requeue"
    verification:
      - kind: unit
        ref: "src/server/jobs/queue.test.ts#maxAttempts 1"
        status: pass
    human_judgment: false
  - id: D5
    description: "A 12 MB JPEG passes src/proxy.ts intact (sha256 match) with proxyClientMaxBodySize 64mb"
    requirement: "INGEST-01"
    verification:
      - kind: integration
        ref: "node scripts/verify-scan.ts step (f)"
        status: pass
    human_judgment: false
  - id: D6
    description: "text/plain, form and multipart content types and PDF magic bytes are refused with 415 unsupported_type and nothing is stored"
    verification:
      - kind: integration
        ref: "node scripts/verify-scan.ts steps (g), (h)"
        status: pass
      - kind: unit
        ref: "src/server/images/detect.test.ts"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-10-20
---

# Phase 2 Plan 03: Photo Ingest, Dedup and Phase 2 Schema Summary

**POST /api/photos stores each photo once under photos/SHA[0..2]/SHA.EXT and queues exactly one run with a one-shot scan job (max_attempts 1, dedupe scan:ID:1) in a single immediate transaction. Identical bytes, concurrent or repeated, return the same photoId with `duplicate: true` and create nothing. A 12 MB JPEG now passes the proxy byte for byte, and non-photos get 415.**

## Performance

- **Duration:** 7 min (2026-10-20T03:33:49Z to 03:40Z)
- **Tasks:** 2
- **Files:** 16 (10 created, 6 modified)

## Accomplishments

- **Schema:** photos, vision_runs (unique photo_id+run_no, status index), spine_detections, spines and spine_fields (composite PK), generated as `drizzle/0001_shelf_scan.sql` (5 CREATE TABLE) and applied at boot by migrate().
- **Queue:** `enqueue()` writes `max_attempts` (1..10, default 3). Unit tests show a maxAttempts 1 job fails on its first failure and on boot recovery.
- **Ingest:** sha256 over the original bytes before any decode. On an existing hash it returns the row as a duplicate. Otherwise it writes the file (temp + rename, skipped if present), then in one `.immediate()` transaction inserts the photo `ON CONFLICT(sha256) DO NOTHING` (a lost race returns the twin as a duplicate), inserts run 1 as queued, enqueues scan_photo, and links job_id and latest_run_id.
- **Route:** content type (parameters ignored) must be an accepted image type or application/octet-stream, otherwise 415. Then 411 without a numeric Content-Length, 413 over 64 MB before reading, 400 cut_off on a length mismatch, 400 empty, and 415 when magic bytes are not JPEG/PNG/WebP/HEIF. x-filename is display text only.
- **Contracts:** `src/lib/scan-types.ts` exports PHOTO_STATUSES, SPINE_STATES, DENSITY_FLAGS, UPLOAD_ERROR_CODES, MAX_UPLOAD_BYTES, ACCEPTED_UPLOAD_TYPES and every DTO later plans consume.
- **Proof:** `node scripts/verify-scan.ts` passes steps a-h ("uploading 12.0 MB"). verify-skeleton step (c) now expects one migration row per .sql file plus the five new tables.

## Task Commits

1. **Task 1: tracer, upload stored once and queued once**: `c04ee4f` (feat)
2. **Task 2: >10 MB uploads intact, non-photos refused**: `0bdee6d` (feat)

## Verification

- `corepack pnpm typecheck`, `corepack pnpm lint`: exit 0
- `corepack pnpm test`: 17 files, 238 tests pass
- `node scripts/verify-scan.ts` (with build): `verify-scan OK`
- `VERIFY_SKIP_BUILD=1 node scripts/verify-skeleton.ts`: `verify-skeleton OK`
- Acceptance greps: maxAttempts?: number = 1; table names = 5; drizzle/*.sql = 2; CREATE TABLE = 5; "maxAttempts: 1" in ingest.ts = 1; proxyClientMaxBodySize '64mb' = 1
- Tracer gate (end-of-phase, automated-only verify): re-run passed before expansion

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Unit tests for detect, ingest and maxAttempts**
- **Found during:** Task 1
- **Issue:** The plan only proved the new pure logic end to end.
- **Fix:** Added detect.test.ts (signatures, HEIF major/compatible brands, refusals), ingest.test.ts (sanitizer, storage, concurrent dedup) and two queue tests.
- **Commit:** c04ee4f

**2. [Rule 1 - Bug] verify-scan step (h) false positive**
- **Found during:** Task 2
- **Issue:** The check for "PDF not written" tested whether the photos/<2-hex> folder existed, and that folder can legitimately exist for another photo with the same prefix.
- **Fix:** The step now searches photos/ recursively for the PDF's sha256.
- **Commit:** 0bdee6d

**3. [Rule 1 - Bug] Invisible bidi characters in source**
- **Found during:** Task 1
- **Issue:** The written regex and test literal contained raw U+202A..U+2069 characters instead of `\u` escapes. Biome also rejects `\u0000` ranges in regexes.
- **Fix:** Rewrote them as ASCII `\u` escapes and used `\p{Cc}` with the `u` flag.
- **Commit:** c04ee4f

**Total deviations:** 3 auto-fixed (1 missing critical, 2 bugs). **Impact:** none on scope.

## Known Stubs

None. A-22 stands as planned: no scan_photo handler exists until Plan 02-04, so the worker fails the queued job as an unknown type. verify-scan asserts the job row, not its status.

## Next Phase Readiness

Ready for 02-04: the scan job reads `{ photoId, runId }` from the payload, stamps model and effort on the run, and fills the remaining vision_runs columns.

## Self-Check: PASSED

- All key-files.created exist on disk
- Commits c04ee4f and 0bdee6d are ancestors of HEAD
