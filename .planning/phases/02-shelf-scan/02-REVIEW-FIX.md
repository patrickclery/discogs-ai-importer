---
phase: 02-shelf-scan
fixed_at: 2026-10-20T06:10:00Z
review_path: .planning/phases/02-shelf-scan/02-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-10-20T06:10:00Z
**Source review:** .planning/phases/02-shelf-scan/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (fix_scope: all)
- Fixed: 10
- Skipped: 0

**Verification:** `workflow.use_worktrees` is false, so every fix was made and checked in the main checkout (no worktree). After the last commit, `corepack pnpm typecheck`, `corepack pnpm lint` and `corepack pnpm test` all passed there (33 files, 479 tests). Each fix that changes behavior has a regression test, and each of those tests was confirmed to fail without its fix. No live `claude -p` calls were made. All CLI checks used `test/fixtures/fake-claude.mjs`.

One unrelated test is flaky: `src/server/claude/cli.test.ts` "times out a sleeping child in under 4 s". It failed once under full-suite CPU load, then passed on 3 straight reruns. The test races `echo $$` against a 200 ms timeout. It was not changed.

## Fixed Issues

### CR-01: Focusing and leaving a field silently records an owner edit when Claude's read has surrounding whitespace

**Files modified:** `src/server/scan/field-sql.ts` (new), `src/server/scan/fields.ts`, `src/server/scan/merge.ts`, `src/server/scan/orphans.ts`, `src/components/spine-field.tsx`, `src/app/api/spines/[id]/fields/route.test.ts`, `src/server/scan/merge.test.ts`
**Commit:** 7842b09
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- **One definition of "edited".** The new module `field-sql.ts` gives the server the same rule as the client's `isEdited`. It trims with the exact `String.prototype.trim` whitespace set, passed explicitly to SQLite `TRIM` and checked for parity, and maps empty to NULL. The `field-sql.ts` file was created so that `fields.ts`, `merge.ts` and `orphans.ts` share this one helper.
- **Server comparisons.** The following all use the normalized comparison:
  - `updateSpineField`
  - `mergeField` and `hasEdits`
  - the orphan `CANDIDATE` filter and the re-attach CASEs
- **Saving a value equal to Claude's read.** When a saved value equals Claude's read after normalization, the stored value goes back to `ai_value` and the edit base is cleared. This keeps an exact `value IS ai_value` check correct too, and also fixes "Use new read".
- **Client.** `commit()` is a no-op when `next === normalizeFieldInput(f.value)`. The optimistic update and the save-success check use the same rule.

### CR-02: The paid vision call is spawned without checking that the CLI is on the subscription

**Files modified:** `src/server/jobs/handlers/scan-photo.ts`, `src/server/jobs/handlers/scan-photo.test.ts`, `src/app/api/photos/[id]/rescan/route.ts`, `src/app/api/photos/[id]/rescan/route.test.ts`
**Commit:** 0b07fd7
**Applied fix:**
- **Scan handler.** It reuses the Phase 1 check (`getClaudeCliStatus` + `isClaudeReady`). `runScanPhoto` now runs that check right before the spawn, uncached (`maxAgeMs: 0`). If the CLI is missing, logged out or signed in for API billing, the run is marked `cli_unavailable` and no call is made.
- **Rescan route.** It returns 409 `cli_unavailable` before queueing a run, using a 60 s cache. The handler stays the authoritative gate.
- **Upload route.** It was left alone. Uploads still store the photo, and the handler gate stops the paid call.
- **Test changes.**
  - The existing "missing CLI" test now expects no spawn and no raw.json.
  - The abort test now aborts once the fake CLI logs its `-p` call, not after a fixed 200 ms. The extra readiness check had made the fixed delay race.

### WR-01: Orphans lose every re-attach candidate when the latest run failed or a re-scan is queued

**Files modified:** `src/server/scan/orphans.ts`, `src/server/scan/orphans.test.ts`
**Commit:** b6851c2
**Status:** fixed: requires human verification (logic change)
**Applied fix:** `CANDIDATE` now takes candidates from the photo's latest run with status `done`, not from `photos.latest_run_id`. The new test covers a queued re-scan and a failed one.

### WR-02: The HEIC decompression-bomb guard runs only after the full decode

**Files modified:** `src/server/images/normalize.ts`, `src/server/images/normalize.test.ts`, `src/types/heic-decode.d.ts`
**Commit:** 7ce458b
**Applied fix:** The code now calls `heic-decode`'s `.all()`, which parses the container and reports the image size without decoding it. A primary image over `MAX_SOURCE_PIXELS` is rejected as `too_large` before `decode()` runs. The handles are always released. The type declaration was extended for `all()`. The real-HEIC spike tests still pass.

### WR-03: `encodeVision` can return a JPEG above `VISION_JPEG_MAX_BYTES`, silently

**Files modified:** `src/server/images/normalize.ts`, `src/server/images/normalize.test.ts`, `src/server/jobs/handlers/scan-photo.ts`
**Commit:** a188540
**Status:** fixed: requires human verification (logic change)
**Applied fix:**
- **Shrinking.** If the JPEG is still over the byte limit at quality 70, `normalizeImage` makes the image smaller and recomputes `resizedSize`. Each step scales the long edge by the square root of the byte overshoot, and always by at least 10%. Each step is logged. Below a 512 px long edge the photo is refused as `too_large`.
- **Recorded edge.** `NormalizedImage.vision.maxEdge` holds the edge actually used, and the run stores it as `max_edge`. The JPEG quality is not stored, because that would need a schema migration; it is logged instead.

### WR-04: Uploads are refused based on the browser-reported MIME type

**Files modified:** `src/lib/upload-queue.ts`, `src/lib/upload-queue.test.ts`
**Commit:** 7266e83
**Applied fix:** `uploadPhoto` now always sends `content-type: application/octet-stream`. The server already accepts it, detects the format from the file's first bytes, and the header still forces the CORS preflight.

### IN-01: An invalid `SPIKE_MAX_CALLS` removes the live-call budget

**Files modified:** `scripts/spike/vision.spike.ts`
**Commit:** 7433f7e
**Applied fix:** `SPIKE_MAX_CALLS` must now be a non-negative integer (`/^\d+$/`), otherwise the spike throws. The default is still 24.

### IN-02: AVIF and other generic HEIF files are detected as HEIC

**Files modified:** `src/server/images/detect.ts`, `src/server/images/detect.test.ts`
**Commit:** 647ff80
**Applied fix:**
- HEVC brands always mean HEIC.
- The generic brands `mif1`, `msf1` and `heif` count only when no `avif` or `avis` brand is present.
- AVIF now gets the generic 415 "not a JPEG, PNG, WebP or HEIC" error.
- All existing detection tests still pass.

### IN-03: The section thumbnail links to a failed re-scan's image

**Files modified:** `src/server/scan/queries.ts`, `src/server/scan/merge.test.ts`
**Commit:** c3aa0ea
**Applied fix:** `vision_path` now comes from the newest `done` run, falling back to the newest run with an image when no run is done (`ORDER BY v.status = 'done' DESC, v.run_no DESC`).

### IN-04: Re-attach leaves `spine_detections.spine_id` pointing at the superseded target

**Files modified:** `src/server/db/schema.ts`, `src/server/scan/orphans.ts`
**Commit:** a14a6ad
**Applied fix:** I took the review's "document" option. Detection rows are immutable by design, and an existing test asserts that re-attach does not modify them. `spine_id` is now documented as "linked when the run was stored, never moved". The owning spine is resolved through `spines.current_detection_id`. No schema change was needed (`drizzle-kit generate` reports none).

---

_Fixed: 2026-10-20T06:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
