---
phase: 02-shelf-scan
verified: 2026-10-20T08:39:37Z
status: passed
score: 15/15 must-haves verified
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
  - ".planning/phases/02-shelf-scan/02-13-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-13-SUMMARY.md"
  - ".planning/phases/02-shelf-scan/02-14-PLAN.md"
  - ".planning/phases/02-shelf-scan/02-14-SUMMARY.md"
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
  - "src/lib/field-commit.test.ts"
  - "src/lib/field-commit.ts"
  - "src/lib/photo-polling.test.ts"
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
covered_digest: "v3:sha256:318161fec897fe5ac08ae15739520631b32cb7abff8e6942a55364b6862d3878"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "INGEST-05: Photos are EXIF-rotated and resized locally before analysis so the image sent to Claude is the same image crops are cut from"
    reason: "Owner chose freeze-master at the 02-04 freeze checkpoint. Crops are cut from the full-resolution upright image. The vision JPEG sent to Claude is a pure resize of that same image (same frame, no crop), and boxes are scaled exactly (floor/ceil outward). Live calibration recorded a median corner error of 0.02-0.03% of the short edge, against a 1.5% bar."
    accepted_by: "Patrick Clery (02-04 freeze checkpoint, recorded in 02-04-SUMMARY.md key-decisions)"
    accepted_at: "2026-10-20T03:47:26Z"
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "G-02-3 (UAT 3): the Couldn't refresh alert clears on the next successful poll when every photo is Done (in code, test-proven; browser re-run pending)"
    - "G-02-5 (UAT 5): Escape restores the saved value without saving, in either blur/keydown order, and no stale flag drops a later save (in code, test-proven; browser re-run pending)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-01: a save sent by the unmount flush reports failure only through the hook-level onError (silent cache rollback); the per-call onError/toast never runs after unmount"
    category: other
    reason: "Mechanism confirmed in installed @tanstack/query-core 5.104.2 (mutationObserver.js:158 gates per-call callbacks on hasListeners()). The trigger needs a card to unmount between a blur and its setTimeout 0 AND the PATCH to fail. The PATCH is still sent, so the 02-14 truth holds. Any in-flight save on a card that unmounts had the same silent-failure path before 02-14. Fix: mutateAsync + toast in the flush path, or an unmountedRef checked by the hook-level onError."
    evidence_status: "mechanism read in library source; no reproduction of a lost edit"
  - finding: "WR-02: the deferred blur commit is not flushed on pagehide/visibilitychange, so a blur caused by hiding the tab, followed by closing it inside the background-timer throttle window (~1 s), can lose the edit"
    category: other
    reason: "New window introduced by 02-14 (the old onBlur saved synchronously), but no test or reproduction shows a lost edit. Fix: flush on visibilitychange:hidden and pagehide as well as on unmount."
    evidence_status: "none provided"
human_verification:
  - test: "UAT 3 re-run (G-02-3). Prod build (corepack pnpm build && corepack pnpm start). Open /upload with every photo Done, stop the server, refocus the tab so 'Couldn't refresh' appears with the last data kept. Start the server and keep the tab focused. Repeat on /spines."
    expected: "The alert clears by itself within roughly 3-10 s of the server coming back (the default retry: 3 backoff can delay the first error, then polls run every 3 s). No page interaction needed."
    why_human: "Needs a real browser, a stopped and restarted server and tab refocus. photo-polling.test.ts proves the QueryObserver logic with retry: false only (IN-03)."
  - test: "UAT 5 re-run (G-02-5) on /spines, prod build. First paste in the DevTools console: window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.activeElement?.blur(); }, { capture: true }). On an unedited field type extra characters and press Escape; repeat on the same field; then type, click away and reload. Reload without the snippet and repeat. Also check Enter (Input), Ctrl/Cmd+Enter (Raw text), Revert and Undo revert."
    expected: "Escape brings the saved value back with no Edited badge and no PATCH in the Network tab, both times. The click-away value persists after reload with Edited. Same results without the snippet. Enter, Ctrl/Cmd+Enter, Revert and Undo revert still work."
    why_human: "Real DOM event order and React's event wiring are not exercised: field-commit.test.ts drives the controller through a hand-written fake input (IN-02); Vitest runs in node with no DOM library."
  - test: "UAT 8 (skipped in UAT). After a re-scan that orphans an edited spine, use Re-attach spine... and Dismiss spine."
    expected: "The orphan shows under 'No longer detected (n)'. Re-attach moves the edits and toasts 'Edits moved to spine #n'. Dismiss toasts and moves focus to the next card's first field, or to the section's Re-scan button."
    why_human: "Never exercised by a human: no orphaned edited spine occurred in the UAT re-scan. Dialog flow and focus management need a browser."
  - test: "UAT 11 (skipped in UAT). Render a 20:1 crop and a 4:1 crop, then scroll about 500 spine cards."
    expected: "Both crops render in full (object-contain, max-h-32/min-h-12) and scrolling stays responsive without virtualization."
    why_human: "Backstop visual and performance truths from 02-08; skipped by the owner."
  - test: "UAT 7 and 9 remainders. Re-scan from an /upload error row, the below-640px 36px icon trigger (disabled with a tooltip while analyzing), and 'Use new read' after a re-scan that changes an edited field's read."
    expected: "Same confirm dialog and merge as on /spines. 'Use new read' clears the 'Latest scan reads' hint and the Edited badge."
    why_human: "UAT recorded these sub-steps as not exercised (no failed photo, no changed re-read of an edited field)."
---

# Phase 2: Shelf Scan Verification Report

**Phase Goal:** User drops shelf photos and sees every detected spine as a horizontal crop next to the AI-extracted fields, which they can correct. Each photo costs exactly one Claude call.
**Verified:** 2026-10-20T08:39:37Z
**Status:** human_needed
**Re-verification:** Yes. This follows gap-closure plans 02-13 (G-02-3) and 02-14 (G-02-5), which target UAT tests 3 and 5.

## MVP Mode Note (WARNING, carried forward)

ROADMAP marks Phase 2 `**Mode:** mvp`, but the goal line is not in user-story form, and the plans' story begins "As the", not "As a". I verified against the five roadmap success criteria and the plans' story. To make it canonical, run `/gsd-mvp-phase 2`.

## User Flow Coverage

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Drop photos | One POST per file, queued once | upload-view.tsx queue; api/photos/route.ts; ingest.ts | ✓ (UAT 2 passed) |
| Watch progress | Queued, Analyzing, Done or Error with a reason; recovers after a failed poll | photo-status.ts statusView, error-aware photosRefetchInterval; photo-polling.test.ts | ✓ (UAT 3 re-run: human) |
| See spines | Horizontal crop above the six fields | SpineCard → SpineCrop + SpineField; crop.ts | ✓ (UAT 4 passed) |
| Correct a field | Saves on blur, Escape cancels, survives reload, AI value kept | spine-field.tsx + field-commit.ts; fields.ts never writes ai_value | ✓ (UAT 5 re-run: human) |
| Outcome: one call per photo | Exactly one recorded call; zero on re-upload; re-scan only on request | scan-photo.test calls()===1; ingest dedupe; only ingest.ts and rescan.ts insert vision_runs | ✓ |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: photos move through queued, analyzing, done; failures show with a reason, never dropped | ✓ VERIFIED | Regression check: scan-photo failure-mode tests are in the green suite (500/500). G-02-3 strengthens the live view (see 6-8). |
| 2 | SC2: horizontal crop aligned with the real spine, next to the six fields and per-field confidence | ✓ VERIFIED | Unchanged since the prior pass; UAT 4 passed with real photos. |
| 3 | SC3: one recorded call per photo, raw response persisted, zero calls on re-upload | ✓ VERIFIED | Unchanged; scan-photo and ingest tests green. |
| 4 | SC4: user can edit any field; the edit survives a reload; the AI value is kept | ✓ VERIFIED | UAT 5 confirmed persistence. The G-02-5 Escape defect is fixed in code (truths 11-15). The fields route test still holds ai_value byte-identical. |
| 5 | SC5: explicit re-scan is the only path back to Claude; edits survive on matching spines | ✓ VERIFIED | Unchanged; merge, orphans and reconcile tests green. UAT 7 passed (merge kept edits). |
| 6 | 02-13: /upload with every photo Done keeps polling after a failed poll, and the alert clears on the first success | ✓ VERIFIED | photo-status.ts:112-113 returns POLL_RETRY_MS (3000) when status is 'error'. Wired at photo-status-list.tsx:40-41 with `q.state.status`. "/upload: recovers from a failed poll with every photo done" passes (isError false after the retry). |
| 7 | 02-13: the same recovery on /spines via photoOptions | ✓ VERIFIED | spines-view.tsx:160-161 passes `q.state.status`. The "/spines: recovers..." test passes. |
| 8 | 02-13: no idle polling while polls succeed and nothing is active | ✓ VERIFIED | Returns false for success/pending with idle data. "does not poll while every photo is done..." passes (no fetch in 10 s). |
| 9 | 02-13: polling stays at 1.5 s while any photo is active | ✓ VERIFIED | The ACTIVE_POLL_MS branch runs first and is independent of status. Unit cases cover both success and error. |
| 10 | 02-13: UI-SPEC rule agrees with "retrying every few seconds" | ✓ VERIFIED | 02-UI-SPEC.md:183 now has "3000ms (`POLL_RETRY_MS`) while the last poll failed ... (corrected by G-02-3)"; :358 is unchanged. |
| 11 | 02-14: Escape on an unedited field restores the saved value and sends no PATCH in either event order | ✓ VERIFIED | field-commit.ts: blur() defers with setTimeout 0, and escape() blurs, cancels and then resets. spine-field.tsx:243-266 wires onBlur → blur(commit) and Escape → escape(() => input.blur(), reset). There are 0 skipCommit references. The keydown-first and blur-first tests pass. The harness mirrors the component line for line. Real-DOM order goes to human (UAT 5 re-run). |
| 12 | 02-14: a second Escape behaves the same | ✓ VERIFIED | "blur-first: a second Escape also saves nothing (attempts 2-3)" passes. |
| 13 | 02-14: after any Escape, a click-away saves the typed value | ✓ VERIFIED | escape() leaves nothing armed (cancel nulls timer and pending). The attempt 4 tests pass in both orders. |
| 14 | 02-14: click-away, Enter and Ctrl/Cmd+Enter save once; a save pending at unmount is still sent | ✓ VERIFIED | Enter branches call blur(), so they use the same deferred path. spine-field.tsx:131 has a `useEffect` cleanup that calls flush(). The flush tests pass. @tanstack/react-query's `mutate` executes after unmount (useMutation.js:181-183 does not guard on mount), so the PATCH is sent. Failure reporting in that path is silent (advisory WR-01). |
| 15 | 02-14: polling never changes a focused or dirty field; the edit survives a reload with Edited | ✓ VERIFIED | resolveDisplayedValue is unchanged. After a blur, dirty stays true until the save succeeds, so the draft keeps showing. The spine-review and fields route tests are green. |

**Score:** 15/15 truths verified (0 present, behavior-unverified)

### Deferred Items

None from this verification. The UAT deferred follow-ups (deskewing tilted spines, a sticky filter bar) are already in ROADMAP backlog Phase 999.x. They are not phase-2 truths.

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | WR-01: a save from the unmount flush fails silently | other | The truth ("still sent") holds. The silent failure is narrow (the card must unmount between the blur and setTimeout 0, and the PATCH must fail) and existed before for any in-flight save. No lost edit reproduced. |
| 2 | WR-02: no flush on pagehide/visibilitychange | other | New ~1 s window opened by 02-14; no test or reproduction shows a loss |

Both are on files modified since the prior pass, so they are in scope. I rate them warnings, not blockers: neither falsifies a must-have truth, and neither has a reproduced failure. Recommend fixing both (each fix is small) before Phase 3, or recording them as `deferred` in 02-REVIEW-DISPOSITION.md.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| 02-01..02-12 declared artifacts | Exist, substantive | ✓ VERIFIED | verify.artifacts: 8/8, 4/4, 7/7, 5/5, 4/4, 5/5, 4/4, 6/6, 4/4, 7/7, 5/5, 3/3 (no regression) |
| src/lib/photo-status.ts | photosRefetchInterval(photos, status), POLL_RETRY_MS, ACTIVE_POLL_MS | ✓ VERIFIED | 02-13 3/3 |
| src/lib/photo-polling.test.ts | QueryObserver regression | ✓ VERIFIED | 3 tests, real QueryObserver + fake timers |
| 02-UI-SPEC.md | Corrected line 183 | ✓ VERIFIED | |
| src/lib/field-commit.ts | createFieldCommit | ✓ VERIFIED | 02-14 3/3; blur/escape/focus/flush/isPending |
| src/lib/field-commit.test.ts | Ordering + flush regressions | ✓ VERIFIED | 13 tests |
| src/components/spine-field.tsx | Wired to the controller, no skip flag | ✓ VERIFIED | `useState(createFieldCommit)`, 0 skipCommit |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| 02-01..02-12 (29 links) | | | ✓ WIRED 29/29 |
| photo-status-list.tsx | photo-status.ts | `photosRefetchInterval(q.state.data?.photos, q.state.status)` | ✓ WIRED |
| spines-view.tsx | photo-status.ts | `photosRefetchInterval(q.state.data?.photoOptions, q.state.status)` | ✓ WIRED |
| spine-field.tsx | field-commit.ts | `createFieldCommit` (onFocus, onBlur, Escape, unmount flush) | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| PhotoStatusList | photos, isError | GET /api/photos → listPhotos; status from TanStack query state | Yes | ✓ FLOWING |
| SpinesView | spines, photoOptions, isError | GET /api/spines → getSpines | Yes | ✓ FLOWING |
| SpineField | draft → PATCH | draftRef → commit() → save() → PATCH /api/spines/{id}/fields | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Types | `corepack pnpm typecheck` | exit 0 | ✓ PASS |
| Lint | `corepack pnpm lint` | 181 files, no issues | ✓ PASS |
| Full suite (run once) | `corepack pnpm test` | 35 files, 500/500 | ✓ PASS (the flaky cli timeout test passed this run) |
| Gap tests | `vitest run field-commit.test.ts photo-polling.test.ts photo-status.test.ts` | 37/37 | ✓ PASS |
| WR-01 mechanism | grep query-core mutationObserver.js / react-query useMutation.js | per-call callbacks gated on hasListeners(); mutate unguarded | confirmed (advisory) |
| Gap commits on HEAD | git log | 6af1592, 47fb985, 398691a, 0c81887, 7868087, 8101e06, 1876181 present | ✓ PASS |

### Probe Execution

None declared. No `scripts/*/tests/probe-*.sh` exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INGEST-01 | 03, 05, 07 | Drag and drop one or more photos | ✓ SATISFIED | UAT 2 passed |
| INGEST-02 | 05, 06, 13 | Per-photo status | ✓ SATISFIED | statusView; error-aware polling (G-02-3) |
| INGEST-03 | 03, 07 | Identical re-upload makes zero calls | ✓ SATISFIED | sha256 dedupe; UAT 2 duplicate passed |
| INGEST-04 | 10, 11, 12 | Explicit re-scan only; edits preserved | ✓ SATISFIED | rescan.ts sole path; merge tests; UAT 7 |
| INGEST-05 | 01, 02, 04 | EXIF-rotate/resize; sent image matches crop source | ✓ SATISFIED (override) | freeze-master override |
| VIS-01 | 01, 02, 04, 05 | One call returns every spine | ✓ SATISFIED | calls()===1; UAT 12 owner-approved privacy prohibition |
| VIS-02 | 01, 02, 04 | Fields, bbox, confidence, orientation | ✓ SATISFIED | frozen schema |
| VIS-03 | 04, 05 | Raw persisted first; failures surfaced | ✓ SATISFIED | raw.json before parse |
| VIS-04 | 01, 02, 04 | Local padded crop, rotated horizontal | ✓ SATISFIED | crop.ts; UAT 4 |
| REV-01 | 04, 08, 12, 13 | Crop next to fields | ✓ SATISFIED | SpineCard; /spines recovery |
| REV-02 | 09, 14 | Edits stored separately, AI value kept | ✓ SATISFIED | fields.ts; Escape-safe commit (G-02-5) |

There are no orphaned requirements. REQUIREMENTS.md maps exactly these 11 IDs to Phase 2, and every one is claimed by a plan.

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| INGEST-04 never re-send without an explicit re-scan | test | ✓ enforced (tests green) |
| VIS-03 never silently drop a failure or spine | test | ✓ enforced |
| REV-02 never overwrite Claude's read | test | ✓ enforced |
| VIS-01 privacy and billing | judgment | ✓ human-resolved: UAT 12 passed (owner review) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 8 files touched by 02-13/02-14 | n/a | TBD/FIXME/XXX/TODO/HACK | none found | none |
| src/components/spine-field.tsx | 131 | Unmount flush save fails silently (WR-01) | ⚠️ Warning / 📋 Advisory | Narrow silent-failure path |
| src/lib/field-commit.ts | 28-36 | No flush on page hide (WR-02) | ⚠️ Warning / 📋 Advisory | Narrow loss window on tab hide + close |
| src/lib/field-commit.ts | 51 | isPending() used only by tests (IN-01) | ℹ️ Info | API surface |
| src/lib/photo-polling.test.ts | 36 | retry: false differs from production retry: 3 (IN-03) | ℹ️ Info | Alert takes about 7 s to appear; the human re-run covers it |
| src/components/photo-status-list.tsx | 21-24 | Doc comment omits the 3 s retry (IN-04) | ℹ️ Info | Stale comment |

### Human Verification Required

1. **UAT 3 re-run (G-02-3).** Use a prod build. Restart the server while the tab stays focused, on /upload and on /spines. The alert should clear by itself.
2. **UAT 5 re-run (G-02-5).** Run it with the capture-phase blur snippet and again without it. Escape should send no PATCH, twice. A click-away after that should persist. Enter, Ctrl/Cmd+Enter, Revert and Undo revert should still work.
3. **UAT 8 (never exercised).** Test orphan re-attach and dismiss, including where focus goes after a dismiss.
4. **UAT 11 (skipped).** Check 20:1 and 4:1 crops, and scrolling about 500 cards.
5. **UAT 7 and 9 remainders.** Re-scan from an /upload error row, check the below-640px icon trigger, and try "Use new read".

### Gaps Summary

No blocking gaps. Both UAT failures have code fixes on HEAD:

- **G-02-3.** The polling interval now branches on query status, and both call sites pass that status.
- **G-02-5.** The order-dependent skipCommit flag is replaced by a deferred, cancellable commit, so a stale flag can no longer drop a save.

Real-QueryObserver and controller-ordering tests prove each fix. Typecheck, lint and the full suite (500/500) are green. All 14 plans' artifacts and links pass, and the five roadmap criteria show no regression.

Two things remain open. First, both UAT failures need a real-browser re-run, because neither fix was exercised in a DOM. Second, two UAT tests (8 and 11) were never exercised. Review warnings WR-01 and WR-02 are real but narrow, and no loss has been reproduced. They are recorded as advisory, and I recommend closing or deferring them in 02-REVIEW-DISPOSITION.md.

---

_Verified: 2026-10-20T08:39:37Z_
_Verifier: Claude (gsd-verifier)_
