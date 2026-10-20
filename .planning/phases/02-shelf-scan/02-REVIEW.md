---
phase: 02-shelf-scan
reviewed: 2026-10-20T05:28:02Z
depth: standard
files_reviewed: 111
files_reviewed_list:
  - .gitignore
  - biome.json
  - drizzle/0001_shelf_scan.sql
  - next.config.ts
  - package.json
  - scripts/spike/vision.spike.ts
  - scripts/verify-claude-cli.ts
  - scripts/verify-rescan.ts
  - scripts/verify-scan-recovery.ts
  - scripts/verify-scan.ts
  - scripts/verify-skeleton.ts
  - src/app/api/files/[...path]/route.ts
  - src/app/api/photos/[id]/rescan/route.test.ts
  - src/app/api/photos/[id]/rescan/route.ts
  - src/app/api/photos/route.test.ts
  - src/app/api/photos/route.ts
  - src/app/api/spines/[id]/dismiss/route.ts
  - src/app/api/spines/[id]/fields/route.test.ts
  - src/app/api/spines/[id]/fields/route.ts
  - src/app/api/spines/[id]/reattach/route.test.ts
  - src/app/api/spines/[id]/reattach/route.ts
  - src/app/api/spines/route.ts
  - src/app/layout.tsx
  - src/app/providers.tsx
  - src/app/spines/loading.tsx
  - src/app/spines/page.tsx
  - src/app/upload/loading.tsx
  - src/app/upload/page.tsx
  - src/components/density-badge.tsx
  - src/components/dismiss-spine-button.tsx
  - src/components/dropzone.tsx
  - src/components/photo-section.tsx
  - src/components/photo-status-badge.tsx
  - src/components/photo-status-list.tsx
  - src/components/photo-status-row.tsx
  - src/components/reattach-dialog.tsx
  - src/components/rescan-button.tsx
  - src/components/spine-card.tsx
  - src/components/spine-crop.tsx
  - src/components/spine-field.tsx
  - src/components/spines-filter-bar.tsx
  - src/components/spines-view.tsx
  - src/components/ui/dialog.tsx
  - src/components/ui/radio-group.tsx
  - src/components/ui/textarea.tsx
  - src/components/ui/toggle-group.tsx
  - src/components/ui/toggle.tsx
  - src/components/upload-tip.tsx
  - src/components/upload-view.tsx
  - src/components/worst-field-badge.tsx
  - src/lib/failure-reason.ts
  - src/lib/photo-status.test.ts
  - src/lib/photo-status.ts
  - src/lib/scan-types.ts
  - src/lib/spine-review.test.ts
  - src/lib/spine-review.ts
  - src/lib/upload-queue.test.ts
  - src/lib/upload-queue.ts
  - src/lib/vision-contract.ts
  - src/server/claude/cli.test.ts
  - src/server/claude/cli.ts
  - src/server/db/schema.ts
  - src/server/images/crop.test.ts
  - src/server/images/crop.ts
  - src/server/images/detect.test.ts
  - src/server/images/detect.ts
  - src/server/images/normalize.test.ts
  - src/server/images/normalize.ts
  - src/server/images/resize.test.ts
  - src/server/images/resize.ts
  - src/server/jobs/handlers/index.ts
  - src/server/jobs/handlers/scan-photo.test.ts
  - src/server/jobs/handlers/scan-photo.ts
  - src/server/jobs/queue.test.ts
  - src/server/jobs/queue.ts
  - src/server/jobs/worker.ts
  - src/server/scan/fields.ts
  - src/server/scan/ingest.test.ts
  - src/server/scan/ingest.ts
  - src/server/scan/levenshtein.test.ts
  - src/server/scan/levenshtein.ts
  - src/server/scan/match.test.ts
  - src/server/scan/match.ts
  - src/server/scan/merge.test.ts
  - src/server/scan/merge.ts
  - src/server/scan/orphans.test.ts
  - src/server/scan/orphans.ts
  - src/server/scan/queries.ts
  - src/server/scan/reconcile.test.ts
  - src/server/scan/reconcile.ts
  - src/server/scan/rescan.ts
  - src/server/scan/store.ts
  - src/server/settings.test.ts
  - src/server/settings.ts
  - src/server/vision/density.test.ts
  - src/server/vision/density.ts
  - src/server/vision/parse.test.ts
  - src/server/vision/parse.ts
  - src/server/vision/prompt.ts
  - src/server/vision/reasons.test.ts
  - src/server/vision/reasons.ts
  - src/server/vision/run.test.ts
  - src/server/vision/run.ts
  - src/server/vision/schema.test.ts
  - src/server/vision/schema.ts
  - src/types/heic-decode.d.ts
  - test/fixtures/fake-claude.mjs
  - test/fixtures/vision/synthetic-shelf.mjs
  - test/fixtures/vision/vision-schema.frozen.json
  - test/helpers/scan-runs.ts
  - vitest.spike.config.ts
findings:
  critical: 2
  warning: 4
  info: 4
  total: 10
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-10-20T05:28:02Z
**Depth:** standard
**Files Reviewed:** 111
**Status:** issues_found

## Summary

I reviewed the shelf-scan pipeline: ingest, the one-shot scan job and reconcile/reparse, normalization and crops, re-scan matching and merge, orphan re-attach and dismiss, the routes, and the review UI. The job ledger and compare-and-set run transitions hold up. I traced claim, abort, lease loss and recovery, and found no way for a run to be sent to Claude twice.

There are two blocking problems:

1. **Two definitions of "edited".** The client and the server decide whether a field was edited in different ways. Simply tabbing through a field can record a hidden edit, which then changes how a later re-scan merges that spine.
2. **No billing guard on the paid call.** The vision call never checks that the CLI is logged in with a subscription before it spawns. A CLI logged in for API billing gets charged.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Focusing and leaving a field silently records an owner edit when Claude's read has surrounding whitespace

**File:** `src/components/spine-field.tsx:183-191`, `src/server/vision/parse.ts:53-58`, `src/server/scan/fields.ts:64-69`, `src/lib/spine-review.ts:28-30`, `src/server/scan/merge.ts:154-157`, `src/server/scan/orphans.ts:23-24`

**Issue:** `normalizeField` deliberately keeps AI values untrimmed (`" Abbey Road"`, or raw_text with a trailing newline). Here is what happens when the owner focuses such a field and leaves it unchanged:

- `onFocus` copies `f.value` into the draft.
- `commit()` computes `next = normalizeFieldInput(draft)`, which gives `"Abbey Road"`.
- `next === f.value` is false, so the field is PATCHed.
- `updateSpineField` stores `value = "Abbey Road"` and `edit_base_ai_value = " Abbey Road"`, because `@value IS ai_value` is false.

The server now treats the field as edited: `merge.ts` `hasEdits`, the `CANDIDATE` filter in `orphans.ts` and `mergeField` all compare exactly with `value IS NOT ai_value`. The client's `isEdited` trims both sides, so it says "not edited". The result:

- No Edited badge and no revert button appear.
- On re-scan, the field no longer follows the new read.
- An unmatched spine becomes an orphan ("Your edits are kept") instead of being superseded, even though the UI shows no edits.
- The spine is excluded from re-attach candidates.

"Use new read" has the same problem: it saves the trimmed value against an untrimmed `ai_value`.

**Fix:** Give the client and server one definition. The simplest fix is to compare normalized values on the server:

```sql
-- fields.ts updateSpineField
edit_base_ai_value = CASE WHEN @value IS NULLIF(TRIM(ai_value), '') THEN NULL ELSE ai_value END
-- merge.ts hasEdits / orphans.ts CANDIDATE / mergeField CASEs
... NULLIF(TRIM(value), '') IS NOT NULLIF(TRIM(ai_value), '')
```

Also make the client's `commit()` a no-op when `next === normalizeFieldInput(f.value)`. Note that SQL `TRIM` only strips spaces by default; pass the whitespace set explicitly, or trim AI values at parse time and bump `SCHEMA_VERSION`.

### CR-02: The paid vision call is spawned without checking that the CLI is on the subscription

**File:** `src/server/jobs/handlers/scan-photo.ts:371-399`, `src/app/api/photos/[id]/rescan/route.ts:21-22`, `src/app/api/photos/route.ts:83-87`

**Issue:** `isClaudeReady` / `auth.state === 'subscription'` is enforced only by `testClaude` and by the `/upload` dropzone gate. That gate is computed at page render and cached for 60 s. `runScanPhoto` never checks the auth method before `runVisionCall`. Neither does the rescan route, and the Re-scan button on `/spines` has no readiness gate at all.

`buildClaudeEnv` strips API-key env vars, but it cannot stop a CLI that is itself logged in with a Console or API account (`auth.state === 'other'`). Every scan and re-scan then bills the API, which breaks D-18 and the project constraint that vision runs on the Max subscription.

**Fix:** Check readiness right before the spawn, and fail the run without calling:

```ts
// scan-photo.ts, before setRunStatus(runId, 'preparing', 'calling', ...)
const cli = await getClaudeCliStatus({ maxAgeMs: 60_000 });
if (!isClaudeReady(cli)) {
  markRunError(runId, 'cli_unavailable',
    cli.auth.state === 'other' ? 'the CLI is signed in for API billing' : undefined);
  return;
}
```

Optionally, also refuse `startRescan` with a 409 when the CLI is not ready.

## Warnings

### WR-01: Orphans lose every re-attach candidate when the latest run failed or a re-scan is queued

**File:** `src/server/scan/orphans.ts:19-24`

**Issue:** `CANDIDATE` requires `t.created_run_id = photos.latest_run_id`. `startRescan` moves `latest_run_id` to the new run as soon as it is queued. That causes two problems:

- While a re-scan is queued or analyzing, the dialog shows "Every spine in the latest scan is already matched".
- If that re-scan errors, `latest_run_id` stays on the failed run, which created no spines. The spines from the run that actually orphaned the spine can then never be candidates again, unless another paid re-scan succeeds.

**Fix:** Use the latest *done* run instead:

```sql
AND t.created_run_id = (SELECT v.id FROM vision_runs v
  WHERE v.photo_id = t.photo_id AND v.status = 'done'
  ORDER BY v.run_no DESC LIMIT 1)
```

Optionally, return a conflict while a run is active.

### WR-02: The HEIC decompression-bomb guard runs only after the full decode

**File:** `src/server/images/normalize.ts:55-68`

**Issue:** `decodeHeic` allocates and decodes the full RGBA buffer (width x height x 4) before the `MAX_SOURCE_PIXELS` check runs. A crafted HEIC that is at most 64 MB but declares a huge grid can exhaust memory in the server process, and that process also runs the worker. The non-HEIC path checks `metadata()` before decoding.

**Fix:** Read the HEIF dimensions before decoding, for example from the `ispe` box or with `heic-decode`'s `.all()` and `width`/`height` without `decode()`, and reject sizes above `MAX_SOURCE_PIXELS` first.

### WR-03: `encodeVision` can return a JPEG above `VISION_JPEG_MAX_BYTES`, silently

**File:** `src/server/images/normalize.ts:117-143`

**Issue:** The docstring promises "at most VISION_JPEG_MAX_BYTES". `vision-contract.ts:54` says the CLI Read tool re-encodes images above that size. But the loop simply stops at quality 70 and returns whatever size it has. If that happens, the image Claude sees may not be the stored `image.jpg`, which puts the 1:1 box contract at risk. Nothing is logged, and the chosen `quality` is not stored on the run.

**Fix:** After the loop, if `jpeg.length > VISION_JPEG_MAX_BYTES`, shrink the dimensions (re-run `resizedSize` with a smaller `maxEdge`) or throw `ImageDecodeError('too_large', ...)`. At the very least, log it and store the quality and byte size on the run.

### WR-04: Uploads are refused based on the browser-reported MIME type, which the server says it never trusts

**File:** `src/lib/upload-queue.ts:75`, `src/app/api/photos/route.ts:17-51`

**Issue:** The client sends `file.type` as the Content-Type. react-dropzone accepts files by extension, so a `.heic` reported as `image/heic-sequence` or a `.jpg` reported as `image/jpg` passes the dropzone. The server then rejects it with 415 "isn't a supported photo", even though `detectImageKind` would identify it from its magic bytes. Any non-simple Content-Type already forces the CORS preflight.

**Fix:** Always send `'content-type': 'application/octet-stream'` from `uploadPhoto` (the server already accepts it), or accept any `image/*` on the server.

## Info

### IN-01: An invalid `SPIKE_MAX_CALLS` removes the live-call budget

**File:** `scripts/spike/vision.spike.ts:68,165,1251`

**Issue:** `Number('abc')` is `NaN`, and `liveCalls >= NaN` is always false, so the spike sends unlimited paid calls.

**Fix:** Use `const MAX_CALLS = Number.parseInt(process.env.SPIKE_MAX_CALLS ?? '24', 10);` and throw if it is not finite or is negative.

### IN-02: AVIF and other generic HEIF files are detected as HEIC

**File:** `src/server/images/detect.ts:8-18,30-33`

**Issue:** `mif1` and `msf1` are generic HEIF brands that AVIF also lists as compatible. An AVIF upload is stored as `heic`, fails in `heic-decode`, and shows the iPhone "Most Compatible" copy.

**Fix:** Return null when the major or compatible brands include `avif` or `avis`, or only trust `mif1`/`msf1` alongside an HEVC brand.

### IN-03: The section thumbnail links to a failed re-scan's image

**File:** `src/server/scan/queries.ts:105-107`

**Issue:** `vision_path` is taken from the newest run that has one, whatever its status. After a failed re-scan, "Open full photo" opens the new run's image while the cards show the previous run's crops.

**Fix:** Add `AND v.status = 'done'`, falling back to the latest run when no run is done.

### IN-04: Re-attach leaves `spine_detections.spine_id` pointing at the superseded target

**File:** `src/server/scan/orphans.ts:100-108`

**Issue:** After a re-attach, the orphan's `current_detection_id` is the target's detection, but that detection's `spine_id` still names the now-superseded target. Nothing reads this column yet. However, `spine_detections_spine_idx` suggests later phases will, and they would resolve the wrong spine.

**Fix:** Either document `spine_id` as "the spine created for this detection, never moved", or update it in the same transaction.

---

_Reviewed: 2026-10-20T05:28:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
