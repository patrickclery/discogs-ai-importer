---
phase: 02-shelf-scan
verified: 2026-10-20T05:51:15Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/02-shelf-scan/02-01-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-01-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-02-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-02-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-03-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-03-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-04-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-04-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-05-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-05-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-06-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-06-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-07-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-07-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-08-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-08-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-09-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-09-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-10-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-10-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-11-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-11-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-12-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-12-SUMMARY.md"
  - "drizzle/0001_shelf_scan.sql"
  - "drizzle/meta/0001_snapshot.json"
  - "drizzle/meta/_journal.json"
  - "next.config.ts"
  - "package.json"
  - "scripts/spike/vision.spike.ts"
  - "scripts/verify-claude-cli.ts"
  - "scripts/verify-rescan.ts"
  - "scripts/verify-scan-recovery.ts"
  - "scripts/verify-scan.ts"
  - "scripts/verify-skeleton.ts"
  - "src/app/api/files/[...path]/route.ts"
  - "src/app/api/photos/[id]/rescan/route.test.ts"
  - "src/app/api/photos/[id]/rescan/route.ts"
  - "src/app/api/photos/route.test.ts"
  - "src/app/api/photos/route.ts"
  - "src/app/api/spines/[id]/dismiss/route.ts"
  - "src/app/api/spines/[id]/fields/route.test.ts"
  - "src/app/api/spines/[id]/fields/route.ts"
  - "src/app/api/spines/[id]/reattach/route.test.ts"
  - "src/app/api/spines/[id]/reattach/route.ts"
  - "src/app/api/spines/route.ts"
  - "src/app/layout.tsx"
  - "src/app/providers.tsx"
  - "src/app/spines/loading.tsx"
  - "src/app/spines/page.tsx"
  - "src/app/upload/loading.tsx"
  - "src/app/upload/page.tsx"
  - "src/components/density-badge.tsx"
  - "src/components/dismiss-spine-button.tsx"
  - "src/components/dropzone.tsx"
  - "src/components/photo-section.tsx"
  - "src/components/photo-status-badge.tsx"
  - "src/components/photo-status-list.tsx"
  - "src/components/photo-status-row.tsx"
  - "src/components/reattach-dialog.tsx"
  - "src/components/rescan-button.tsx"
  - "src/components/spine-card.tsx"
  - "src/components/spine-crop.tsx"
  - "src/components/spine-field.tsx"
  - "src/components/spines-filter-bar.tsx"
  - "src/components/spines-view.tsx"
  - "src/components/ui/dialog.tsx"
  - "src/components/ui/radio-group.tsx"
  - "src/components/ui/textarea.tsx"
  - "src/components/ui/toggle-group.tsx"
  - "src/components/ui/toggle.tsx"
  - "src/components/upload-tip.tsx"
  - "src/components/upload-view.tsx"
  - "src/components/worst-field-badge.tsx"
  - "src/lib/failure-reason.ts"
  - "src/lib/photo-status.test.ts"
  - "src/lib/photo-status.ts"
  - "src/lib/scan-types.ts"
  - "src/lib/spine-review.test.ts"
  - "src/lib/spine-review.ts"
  - "src/lib/upload-queue.test.ts"
  - "src/lib/upload-queue.ts"
  - "src/lib/vision-contract.ts"
  - "src/server/claude/cli.test.ts"
  - "src/server/claude/cli.ts"
  - "src/server/db/schema.ts"
  - "src/server/images/crop.test.ts"
  - "src/server/images/crop.ts"
  - "src/server/images/detect.test.ts"
  - "src/server/images/detect.ts"
  - "src/server/images/normalize.test.ts"
  - "src/server/images/normalize.ts"
  - "src/server/images/resize.test.ts"
  - "src/server/images/resize.ts"
  - "src/server/jobs/handlers/index.ts"
  - "src/server/jobs/handlers/scan-photo.test.ts"
  - "src/server/jobs/handlers/scan-photo.ts"
  - "src/server/jobs/queue.test.ts"
  - "src/server/jobs/queue.ts"
  - "src/server/jobs/worker.ts"
  - "src/server/scan/field-sql.ts"
  - "src/server/scan/fields.ts"
  - "src/server/scan/ingest.test.ts"
  - "src/server/scan/ingest.ts"
  - "src/server/scan/levenshtein.test.ts"
  - "src/server/scan/levenshtein.ts"
  - "src/server/scan/match.test.ts"
  - "src/server/scan/match.ts"
  - "src/server/scan/merge.test.ts"
  - "src/server/scan/merge.ts"
  - "src/server/scan/orphans.test.ts"
  - "src/server/scan/orphans.ts"
  - "src/server/scan/queries.ts"
  - "src/server/scan/reconcile.test.ts"
  - "src/server/scan/reconcile.ts"
  - "src/server/scan/rescan.ts"
  - "src/server/scan/store.ts"
  - "src/server/settings.test.ts"
  - "src/server/settings.ts"
  - "src/server/vision/density.test.ts"
  - "src/server/vision/density.ts"
  - "src/server/vision/parse.test.ts"
  - "src/server/vision/parse.ts"
  - "src/server/vision/prompt.ts"
  - "src/server/vision/reasons.test.ts"
  - "src/server/vision/reasons.ts"
  - "src/server/vision/run.test.ts"
  - "src/server/vision/run.ts"
  - "src/server/vision/schema.test.ts"
  - "src/server/vision/schema.ts"
  - "src/types/heic-decode.d.ts"
  - "test/fixtures/fake-claude.mjs"
  - "test/fixtures/vision/calibration/calibrationHeavy.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/calibration/calibrationHeavy.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/calibration/calibrationLandscape.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/calibration/calibrationLandscape.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/calibration/calibrationPortrait.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/calibration/calibrationPortrait.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/cd-spines.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/cd-spines.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/cd-spines.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/cd-spines.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3554.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3554.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3554.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3554.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3555.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3555.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3555.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3555.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3556.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3556.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3556.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3556.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3557.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3557.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3557.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3557.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3558.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3558.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3558.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3558.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3559.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3559.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3559.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3559.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3560.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3560.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3560.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3560.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3561.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3561.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3561.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3561.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3562.claude-opus-5-5.high.json"
  - "test/fixtures/vision/spike/img-3562.claude-opus-5-5.medium.json"
  - "test/fixtures/vision/spike/img-3562.claude-sonnet-5-5.high.json"
  - "test/fixtures/vision/spike/img-3562.claude-sonnet-5-5.medium.json"
  - "test/fixtures/vision/spike/report.json"
  - "test/fixtures/vision/synthetic-shelf.mjs"
  - "test/fixtures/vision/vision-schema.frozen.json"
  - "test/helpers/scan-runs.ts"
covered_digest: "v3:sha256:b20e80e8133a24939433d92119fdfb437c64a98d0df6cfa7b9fa019dcf77d111"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "INGEST-05: Photos are EXIF-rotated and resized locally before analysis so the image sent to Claude is the same image crops are cut from"
    reason: "Owner chose freeze-master at the 02-04 freeze checkpoint. Crops are cut from the full-resolution upright image. The vision JPEG sent to Claude is a pure resize of that same image (same frame, no crop), and boxes are scaled exactly (floor/ceil outward). The geometry matches, and crops come out about 3x sharper. Live calibration recorded a median corner error of 0.02-0.03% of the short edge, against a 1.5% bar."
    accepted_by: "Patrick Clery (02-04 freeze checkpoint, recorded in 02-04-SUMMARY.md key-decisions)"
    accepted_at: "2026-10-20T03:47:26Z"
human_verification:
  - test: "Run the end-to-end fake-CLI proofs after the review fixes: node scripts/verify-scan.ts, node scripts/verify-scan-recovery.ts, node scripts/verify-rescan.ts"
    expected: "Each one ends with its OK line. verify-scan-recovery shows exactly one -p invocation after the kill -9."
    why_human: "These start a Next server, which the verifier may not do. 02-REVIEW-FIX.md reports only typecheck, lint and unit tests after CR-02 added a CLI readiness check right before the spawn."
  - test: "On /upload, drag several real shelf photos at once (include an iPhone HEIC), and also drop a PDF, a duplicate photo and a file of about 70 MB"
    expected: "Each photo goes Waiting to upload, then Uploading, then Queued, then Analyzing with a ticking m:ss timer, then Done with its spine count. The PDF and the 70 MB file become failed rows with their copy and are never sent. The duplicate shows the 'already uploaded... no new Claude call' toast and an 'Already uploaded' badge."
    why_human: "Real browser drag-and-drop, react-dropzone MIME and extension handling, and the live polling transitions can't be exercised by unit tests."
  - test: "Stop the server while /upload or /spines is open, then start it again"
    expected: "The last data stays under a 'Couldn't refresh' alert, and the alert clears on the next successful poll. Retry upload works after the restart."
    why_human: "This is a live-session polling error state."
  - test: "Open /spines for real shelf photos (portrait, landscape, and an EXIF-rotated phone JPEG). Also count misreads on fixtures/spike/out/*/compare.html."
    expected: "Every crop is horizontal, reads left to right, and frames its real spine. Artist, title, format, label, catalog number and raw text sit under it. The misread rate is acceptable, which confirms freeze-master and no tiling."
    why_human: "Alignment against real spines and misread counting need human ground truth (A-02). HEIC irot/imir was never exercised, because all 10 spike HEICs had angle 0 (A-03 still unverified)."
  - test: "Edit a title on /spines, click away, then reload"
    expected: "The new value persists with an 'Edited' badge and 'Edited · 1' in the card header. Revert restores Claude's read. 'Undo revert' restores the edit. Escape restores the saved value. Typing while a scan polls never makes the text jump."
    why_human: "Focus and blur behavior, toasts and polling-versus-draft behavior need a browser. resolveDisplayedValue is unit-tested only as a pure function."
  - test: "Hover the low-confidence field icon, the density badges (Retake closer / May be incomplete) and the disabled Re-scan trigger"
    expected: "Each tooltip shows its documented copy, for example 'Claude is {pct}% sure of this. Check it against the crop.'"
    why_human: "Tooltip rendering is visual."
  - test: "Re-scan a photo from /spines and from an error row on /upload"
    expected: "A confirm dialog opens with the quota copy. While it is analyzing, the existing cards stay visible and editable. After it finishes, the merged cards keep their edits and keys. Below 640px the trigger is a 36px icon button, and it is disabled with a tooltip while analyzing."
    why_human: "This is an interactive multi-step flow with visual state."
  - test: "After a re-scan that orphans an edited spine, use Re-attach spine... and Dismiss spine"
    expected: "The orphan shows under 'No longer detected (n)'. Re-attach moves the edits and toasts 'Edits moved to spine #n'. Dismiss toasts and moves focus to the next card's first field, or to the section's Re-scan button."
    why_human: "Dialog flow and focus management after dismiss are browser behaviors."
  - test: "On /spines, use the All / Needs review toggle and the photo Select, then reload. After a re-scan that changed an edited field's read, click 'Use new read'."
    expected: "Both filters survive a reload, changing the photo scrolls to the top, and the counts match the list. 'Use new read' clears the 'Latest scan reads' hint and the Edited badge."
    why_human: "URL-state and scroll behavior need a browser."
  - test: "Check the layouts at 360px and 1280px: the CLI-not-ready alert, sticky photo headers with wrapping badges and truncated filenames, the Raw text textarea with 300 characters (grows to 6 rows, then scrolls), the Re-scan, Re-attach and Dismiss dialogs, the filter bar, and error reasons clamped to 3 lines"
    expected: "No overflow at either width. Copy matches UI-SPEC."
    why_human: "These are backstop (non-inferable) visual truths from plans 02-06, 02-08 to 02-12."
  - test: "Render a 20:1 crop and a 4:1 crop, then scroll a list of about 500 spine cards"
    expected: "Both crops render in full (object-contain, max-h-32/min-h-12), and scrolling stays responsive without virtualization."
    why_human: "These are backstop visual and performance truths (02-08)."
  - test: "Review the VIS-01 privacy prohibition (judgment tier): 'MUST NOT send a photo, crop or extracted text anywhere except the single local claude -p call per run, and MUST NOT let that call bill an API key'"
    expected: "Owner agrees the only outbound path is runVisionCall (scan-photo.ts:414) with buildClaudeEnv scrubbing API-billing variables, and that the fresh isClaudeReady check before the spawn (scan-photo.ts:391) refuses API-billed logins."
    why_human: "unverified-prohibition, human review recommended. The verifier's verdict (holds) is non-authoritative."
---

# Phase 2: Shelf Scan Verification Report

**Phase Goal:** User drops shelf photos and sees every detected spine as a horizontal crop next to the AI-extracted fields, which they can correct. Each photo costs exactly one Claude call.
**Verified:** 2026-10-20T05:51:15Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## MVP Mode Note (format discrepancy, WARNING)

ROADMAP.md marks Phase 2 as `**Mode:** mvp`, but the goal is not in user-story form. `user-story.validate` returns `valid: false`. The plans carry the story "As the owner cataloguing my CDs, I want to ... so that misreads are easy to see and fix and each photo costs exactly one Claude call." That also fails the canonical regex, because it says "As the" where the regex wants "As a". The orchestrator explicitly asked for verification, so I verified against the plans' story and the five roadmap success criteria. To make the goal canonical, run `/gsd-mvp-phase 2`.

## User Flow Coverage

User story (from the plans): "As the owner cataloguing my CDs, I want to drop shelf photos and see every detected spine as a horizontal crop next to the AI-extracted fields, which I can correct, so that misreads are easy to see and fix and each photo costs exactly one Claude call."

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open /upload | Dropzone shown, gated on CLI readiness | src/app/upload/page.tsx (isClaudeReady, Alert), src/components/dropzone.tsx | ✓ |
| Drop photos | One POST per file, 2 at a time, each queued once | upload-view.tsx createUploadQueue concurrency 2; api/photos/route.ts; ingest.ts one run + one max_attempts 1 job in a transaction | ✓ |
| Watch progress | Queued, then Analyzing, then Done, or Error with a reason | photo-status.ts statusView; photo-status-list refetchInterval 1.5 s; reasons.ts copy; scan-photo failure-mode tests | ✓ (live view: human) |
| See spines | Horizontal crop above six fields per spine | spines/page.tsx → SpinesView → PhotoSection → SpineCard (SpineCrop + 6 SpineField); crop.ts ORIENTATION_ANGLE | ✓ (real alignment: human) |
| Correct a field | Saves on blur, survives reload, AI value kept | spine-field.tsx PATCH → fields.ts (never writes ai_value); route.test "edit then revert leaves ai_value byte-identical" | ✓ |
| Outcome: one call per photo | Exactly one recorded call, zero on re-upload, re-scan only on explicit action | scan-photo.test "makes one recorded call" (calls()===1), "never runs a run twice"; ingest.test duplicates; only ingest.ts and rescan.ts insert vision_runs | ✓ |

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Several photos move through queued, analyzing and done. A failure, including a truncated or refused response, shows as an error with a reason and is never silently dropped | ✓ VERIFIED | Run state machine with compare-and-set in scan-photo.ts. classifyVisionRun maps refused, error_max_turns, the 8 MB buffer, schema_invalid, timeout, aborted and missing CLI to typed kinds. reasonFor gives UI-SPEC copy. 14 failure-mode tests pass. reconcile.ts errors stuck runs ("never analyzing forever"). The UI polls /api/photos every 1.5 s while any photo is active. |
| 2 | Every row shows its horizontal crop, aligned with the real spine (portrait and EXIF-rotated included), next to artist, title, format, label, catalog number, raw text and per-field confidence | ✓ VERIFIED | SpineCard renders SpineCrop and the 6 SpineFields. normalize.ts uses autoOrient (EXIF-6 test: 400x300 comes out 300x400). crop.ts rotation angles are tested for all four orientations. Live calibration in report.json gives a median corner error of 0.02-0.03% across portrait, landscape and >500 KB layouts. Confidence follows D-09: a warning border and tooltip with the percentage below the threshold, plus a worst-field badge. Real-photo alignment and HEIC irot go to human verification. |
| 3 | Exactly one recorded Claude call per analyzed photo, raw response persisted, and re-upload makes zero calls and shows the existing spines | ✓ VERIFIED | afterSpawn writes raw.json before setRunStatus(parsing) and classify. The test asserts calls()===1, raw_path and the raw stdout. ingest.ts dedupes on sha256 with ON CONFLICT, and the concurrent-identical test passes. The client shows a duplicate toast and badge. reparse reads raw.json only and has no CLI path. |
| 4 | User can edit any field; the edit survives a reload and the original AI value is kept | ✓ VERIFIED | fields.ts writes only value and edit_base_ai_value. The PATCH route is validated with zod. Route test: ai_value is byte-identical after edit and revert. CR-01 is fixed: field-sql.ts normalizes the comparison on both sides, and the client commit() is a no-op for an unchanged value. |
| 5 | Explicit re-scan is the only way a photo goes back to Claude, and edits survive on spines that still match | ✓ VERIFIED | Only ingest.ts (run 1) and rescan.ts (run_no+1, IMMEDIATE transaction, 409 while active, CLI gate) insert vision_runs. Reconcile enqueues only `mode: 'reparse'`. The merge tests show an edited field keeps the owner's value, and an unmatched edited spine becomes orphaned. The match test pairs at least 85% on spike fixtures. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

Plan-level truths: 12 plans declare about 110 truths. All 62 declared artifacts pass `verify.artifacts`, and all 29 key links pass `verify.key-links`. The plan truths marked `verification: backstop` (visual and performance) are non-inferable. They are routed to Human Verification, not counted.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| 62 artifacts across 02-01..02-12 | Exist, substantive | ✓ VERIFIED | `verify.artifacts`: 8/8, 4/4, 7/7, 5/5, 4/4, 5/5, 4/4, 6/6, 4/4, 7/7, 5/5, 3/3 |
| src/server/jobs/handlers/scan-photo.ts | Ledgered single call | ✓ VERIFIED | CLI gate + isCurrent + preparing→calling CAS before runVisionCall; nothing throws after the spawn |
| test/fixtures/vision/vision-schema.frozen.json | Frozen schema | ✓ VERIFIED | All VIS-02 fields present; no min/max/minItems/maxItems/minLength/maxLength keys |
| src/lib/vision-contract.ts | Frozen constants | ✓ VERIFIED | 2576/4784, effort high, threshold 0.6, density 90/33, CROP_SOURCE 'master' |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| 29 declared links | | | ✓ WIRED (29/29) |
| upload-view.tsx | api/photos | uploadPhoto (always application/octet-stream since WR-04) | ✓ WIRED |
| spine-card.tsx | SpineCrop, SpineField, Reattach, Dismiss | JSX render | ✓ WIRED |
| photo-section.tsx, photo-status-row.tsx | RescanButton → /api/photos/{id}/rescan | fetch POST after confirm | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| SpinesView | spines/fields/crops | getSpines → loadSpineDtos (SELECT from spines, spine_fields) | Yes, rows written by persistRunResult | ✓ FLOWING |
| PhotoStatusList | photo status/reason | listPhotos (vision_runs join) | Yes | ✓ FLOWING |
| SpineCrop | crop url | crops/<photoId>/<detectionId>.webp via /api/files allowlist | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Types and lint | `corepack pnpm typecheck && corepack pnpm lint` | exit 0, 178 files | ✓ PASS |
| Full suite (run once) | `corepack pnpm test` | 478/479 pass; 1 failure: cli.test.ts "times out a sleeping child..." | ⚠️ see warning |
| Flaky test alone | `vitest run src/server/claude/cli.test.ts -t "times out a sleeping child"` (x2) | passed both times | ✓ PASS (flaky under load) |
| No owner data tracked | `git check-ignore` on secrets.json, fixtures/spike/*, data/ | all ignored | ✓ PASS |
| Review-fix commits present | `git merge-base --is-ancestor` for the 10 fix commits | all ancestors of HEAD | ✓ PASS |
| End-to-end verify scripts | verify-scan / verify-rescan / verify-scan-recovery | not run (they start a server) | ? SKIP → human |

### Probe Execution

None declared. No `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INGEST-01 | 03, 05, 07 | Drag and drop one or more photos | ✓ SATISFIED | dropzone multiple; per-file queue; route refusals tested |
| INGEST-02 | 05, 06 | Per-photo status | ✓ SATISFIED | statusView mapping; polling; reconcile |
| INGEST-03 | 03, 07 | Identical re-upload makes zero calls | ✓ SATISFIED | sha256 dedupe incl. concurrent; toast and badge |
| INGEST-04 | 10, 11, 12 | Explicit re-scan only; edits preserved | ✓ SATISFIED | rescan.ts only path; merge/orphans tests |
| INGEST-05 | 01, 02, 04 | EXIF-rotate and resize; sent image equals crop source | ✓ SATISFIED (override) | freeze-master: same frame, exact scale; see overrides |
| VIS-01 | 01, 02, 04, 05 | One call returns every spine | ✓ SATISFIED | calls()===1; max_attempts 1; no throw after the spawn |
| VIS-02 | 01, 02, 04 | All fields, bbox, confidence, orientation | ✓ SATISFIED | frozen schema keys |
| VIS-03 | 04, 05 | Raw persisted first; truncated/refused surfaced | ✓ SATISFIED | raw.json before parse; failure-mode tests |
| VIS-04 | 01, 02, 04 | Local crop with padding, rotated horizontal | ✓ SATISFIED | padBox, scaleBox, ORIENTATION_ANGLE; no extra AI call |
| REV-01 | 04, 08, 12 | Crop next to fields on every row | ✓ SATISFIED | SpineCard |
| REV-02 | 09 | Edits stored separately from AI output | ✓ SATISFIED | ai_value never written by fields.ts |

There are no orphaned requirements. REQUIREMENTS.md maps exactly these 11 IDs to Phase 2, and every one is claimed by at least one plan.

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| INGEST-04: never re-send without an explicit re-scan (02-05) | test | ✓ enforced: "never runs a run twice", reconcile "never enqueues anything but reparse jobs", "a reparse payload with no raw answer never spawns" |
| VIS-03: never silently drop a failure or a returned spine (02-05) | test | ✓ enforced: failure-mode tests, "zero spines finishes as done", "CD detection with an unusable box is kept" |
| REV-02: never overwrite Claude's read (02-09) | test | ✓ enforced: "edit then revert leaves ai_value byte-identical" |
| VIS-01 privacy and billing (02-04) | judgment | ⚠️ unverified-prohibition, human review recommended. Non-authoritative LLM verdict: holds |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (156 phase-modified files) | n/a | TBD/FIXME/XXX/TODO/placeholder | none found | none |
| src/server/claude/cli.test.ts | ~133 | Timing-sensitive test (process-group kill after timeout) | ⚠️ Warning | Failed in this full-suite run, passes alone. Phase 1 test, already noted in 02-REVIEW-FIX.md. The suite is not reliably green under load. |
| src/app/api/photos/route.ts | 37-89 | Upload does not check CLI readiness | ℹ️ Info | By design (CR-02 note): the photo is stored and the handler fails the run as cli_unavailable without a call. The dropzone is gated in the UI. |
| src/components/spine-field.tsx | 152-154 | Confidence shown only below the threshold | ℹ️ Info | This is the D-09 representation of SC2's "per-field confidence". A high-confidence field shows no score. |

### Human Verification Required

See the `human_verification` frontmatter for the full 12 items. In summary:

1. **End-to-end fake-CLI proofs after the review fixes.** Run verify-scan, verify-scan-recovery and verify-rescan.
2. **Real drag-and-drop.** Use multiple photos with a HEIC, a PDF, a duplicate and a 70 MB file, and watch them move from queued to done.
3. **Poll-error state.** Stop and restart the server.
4. **Real-photo crop alignment and misread count.** Check portrait, landscape and EXIF-rotated photos, and count misreads in compare.html. HEIC irot is untested.
5. **Field editing.** Check the edit, reload, revert, undo, Escape, and typing during a poll.
6. **Tooltips.** Check the low-confidence, density and disabled Re-scan tooltips.
7. **Re-scan flow.** Run it from both pages and at 360px.
8. **Orphans.** Check re-attach, dismiss, and focus after dismiss.
9. **Filters.** Check the filter bar, reload persistence, scroll reset and "Use new read".
10. **Layouts.** Check 360px and 1280px (backstop truths).
11. **Extreme crops and scrolling.** Check 20:1 and 4:1 crops and scrolling 500 cards (backstop).
12. **VIS-01 privacy prohibition.** Owner review of the judgment-tier prohibition.

### Gaps Summary

No blocking gaps. All five roadmap success criteria hold in the code. Each one is backed by tests that exercise the behavior: the single ledgered call, raw-first persistence, failure classification, dedup, the edit store that keeps ai_value, and the re-scan-only path with merge. All 10 review findings are fixed and their commits are on HEAD. INGEST-05 is met only through the owner's accepted freeze-master decision, recorded as an override.

Three warnings are open:

- The ROADMAP goal is not in user-story format, even though the phase is in MVP mode.
- A flaky Phase 1 timeout test failed once in this run.
- The server-based end-to-end verify scripts were not re-run after the review fixes.

What is left is browser and visual verification, which the plans deferred to the end of the phase.

---

_Verified: 2026-10-20T05:51:15Z_
_Verifier: Claude (gsd-verifier)_
