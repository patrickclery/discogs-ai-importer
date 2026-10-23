---
phase: "02"
slug: "shelf-scan"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-21"
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed after execution by /gsd-validate-phase (State B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (node env, recorded Claude fixtures via `test/fixtures/fake-claude.mjs`) plus `scripts/verify-*.ts` end-to-end scripts (each ends with `<name> OK`) |
| **Config file** | `vitest.config.ts` (spike: `vitest.spike.config.ts`, live, not part of the suite) |
| **Quick run command** | `corepack pnpm vitest run <path>` |
| **Full suite command** | `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` |
| **E2E commands** | `VERIFY_SKIP_BUILD=1 node scripts/verify-scan.ts`, `verify-scan-recovery.ts`, `verify-rescan.ts`, `verify-skeleton.ts`, `verify-claude-cli.ts` |
| **Estimated runtime** | ~11 seconds (full Vitest suite, 63 files / 938 tests); e2e scripts ~1–3 minutes total |

---

## Sampling Rate

- **After every task commit:** Run the task's quick Vitest path
- **After every plan wave:** Run the full suite command plus the e2e scripts the plan touches
- **Before `/gsd-verify-work`:** Full suite and all five e2e scripts must be green
- **Max feedback latency:** ~11 seconds (unit); e2e scripts are wave-level

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-02 | 01 | 1 | VIS-01, INGEST-05 | — | N/A | spike (live) | `SPIKE_STEPS=one corepack pnpm spike:vision` | ✅ | ✅ green (recorded) |
| 02-02-03 | 02 | 2 | VIS-02, VIS-04, INGEST-05 | — | N/A | unit | `corepack pnpm vitest run src/server/images src/server/vision src/server/claude/cli.test.ts` | ✅ | ✅ green |
| 02-03-01 | 03 | 2 | INGEST-01, INGEST-03 | — | Single stored copy per SHA-256 | unit + e2e | `corepack pnpm vitest run src/server/scan/ingest.test.ts && node scripts/verify-scan.ts` | ✅ | ✅ green |
| 02-03-02 | 03 | 2 | INGEST-01 | — | Non-photos refused; >10 MB intact | e2e + unit | `node scripts/verify-scan.ts && corepack pnpm vitest run src/server/images/detect.test.ts` | ✅ | ✅ green |
| 02-04-02 | 04 | 3 | VIS-01, VIS-02, VIS-04, REV-01 | — | Frozen schema | unit + e2e | `corepack pnpm vitest run src/server/vision/schema.test.ts && node scripts/verify-scan.ts` | ✅ | ✅ green |
| 02-05-01 | 05 | 4 | VIS-01, VIS-03 | — | Raw stored before parse; one call | unit | `corepack pnpm vitest run src/server/jobs/handlers/scan-photo.test.ts src/server/vision/reasons.test.ts` | ✅ | ✅ green |
| 02-05-02 | 05 | 4 | VIS-01, INGEST-02 | — | No resend after crash | unit + e2e | `corepack pnpm vitest run src/server/scan/reconcile.test.ts src/server/jobs && node scripts/verify-scan-recovery.ts` | ✅ | ✅ green |
| 02-05-03 | 05 | 4 | INGEST-01 | — | Bad uploads refused with reason | unit | `corepack pnpm vitest run src/server/vision/density.test.ts src/server/images/detect.test.ts src/app/api/photos/route.test.ts` | ✅ | ✅ green |
| 02-06-01 | 06 | 4 | INGEST-02 | — | N/A | e2e | `node scripts/verify-scan.ts && node scripts/verify-skeleton.ts && node scripts/verify-claude-cli.ts` | ✅ | ✅ green |
| 02-06-02 | 06 | 4 | INGEST-02 | — | N/A | unit | `corepack pnpm vitest run src/lib/photo-status.test.ts` | ✅ | ✅ green |
| 02-07-01 | 07 | 5 | INGEST-01 | — | N/A | e2e | `node scripts/verify-skeleton.ts && node scripts/verify-scan.ts` | ✅ | ✅ green |
| 02-07-02 | 07 | 5 | INGEST-01, INGEST-03 | — | N/A | unit | `corepack pnpm vitest run src/lib/upload-queue.test.ts` | ✅ | ✅ green |
| 02-07-03 | 07 | 5 | INGEST-01 | — | N/A | e2e | `node scripts/verify-skeleton.ts && node scripts/verify-claude-cli.ts` | ✅ | ✅ green |
| 02-08-01 | 08 | 5 | REV-01 | — | N/A | e2e | `node scripts/verify-scan.ts && node scripts/verify-skeleton.ts` | ✅ | ✅ green |
| 02-08-02 | 08 | 5 | REV-01 | — | N/A | e2e | `node scripts/verify-skeleton.ts && node scripts/verify-scan.ts` | ✅ | ✅ green |
| 02-09-01 | 09 | 6 | REV-02 | — | ai_value never written | e2e | `node scripts/verify-scan.ts` | ✅ | ✅ green |
| 02-09-02 | 09 | 6 | REV-02 | — | Edits stored apart from AI read | unit | `corepack pnpm vitest run src/lib/spine-review.test.ts src/app/api/spines` | ✅ | ✅ green |
| 02-10-01 | 10 | 7 | INGEST-04 | — | Re-scan is the only resend | e2e | `node scripts/verify-rescan.ts` | ✅ | ✅ green |
| 02-10-02 | 10 | 7 | INGEST-04 | — | Edits preserved on match | unit | `corepack pnpm vitest run src/server/scan` | ✅ | ✅ green |
| 02-10-03 | 10 | 7 | INGEST-04 | — | Active run refused | unit | `corepack pnpm vitest run rescan/route.test.ts` | ✅ | ✅ green |
| 02-11-01 | 11 | 8 | INGEST-04 | — | N/A | e2e | `node scripts/verify-rescan.ts` | ✅ | ✅ green |
| 02-11-02 | 11 | 8 | INGEST-04 | — | Dismiss keeps stored edits | unit + e2e | `corepack pnpm vitest run src/server/scan/orphans.test.ts reattach/route.test.ts && node scripts/verify-rescan.ts` | ✅ | ✅ green |
| 02-12-01 | 12 | 9 | REV-01 | — | N/A | e2e | `node scripts/verify-scan.ts && node scripts/verify-rescan.ts` | ✅ | ✅ green |
| 02-12-02 | 12 | 9 | REV-01 | — | N/A | unit | `corepack pnpm vitest run src/lib/spine-review.test.ts` | ✅ | ✅ green |
| 02-12-03 | 12 | 9 | INGEST-04, REV-01 | — | N/A | unit | `corepack pnpm vitest run src/lib/spine-review.test.ts` | ✅ | ✅ green |
| 02-13-01 | 13 | 1 | INGEST-02 | — | N/A | unit | `corepack pnpm vitest run src/lib/photo-polling.test.ts src/lib/photo-status.test.ts` | ✅ | ✅ green |
| 02-13-02 | 13 | 1 | INGEST-02, REV-01 | — | N/A | unit | `corepack pnpm vitest run src/lib/photo-status.test.ts` | ✅ | ✅ green |
| 02-14-01 | 14 | 1 | REV-02 | — | Escape never saves | unit | `corepack pnpm vitest run src/lib/field-commit.test.ts` | ✅ | ✅ green |
| 02-14-02 | 14 | 1 | REV-02 | — | Deferred save not lost on unmount | unit | `corepack pnpm vitest run src/lib/field-commit.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Checkpoint and package-pin tasks (02-01-01, 02-02-01/02 live spike runs, 02-04-01 freeze decision) are human decisions or live-API calls, recorded in their SUMMARYs; they have no repeatable automated check by design.

### Requirement Coverage

| Requirement | Covered by |
|-------------|-----------|
| INGEST-01 | `upload-queue.test.ts`, `detect.test.ts`, `photos/route.test.ts`, `verify-scan.ts` |
| INGEST-02 | `photo-status.test.ts`, `photo-polling.test.ts`, `reconcile.test.ts`, `verify-scan-recovery.ts` |
| INGEST-03 | `ingest.test.ts` (sequential + concurrent identical bytes), `verify-scan.ts` (duplicate flag, same photoId) |
| INGEST-04 | `match.test.ts`, `merge.test.ts`, `levenshtein.test.ts`, `orphans.test.ts`, `rescan/route.test.ts`, `verify-rescan.ts` |
| INGEST-05 | `normalize.test.ts` (EXIF before resize), `resize.test.ts` |
| VIS-01 | `scan-photo.test.ts` (one recorded call), `reconcile.test.ts`, `verify-scan.ts` |
| VIS-02 | `schema.test.ts` (frozen JSON schema), `parse.test.ts` |
| VIS-03 | `scan-photo.test.ts` (raw first, refused/cut-off → Error), `reasons.test.ts` |
| VIS-04 | `crop.test.ts` (padding, clamping, `ORIENTATION_ANGLE` to horizontal) |
| REV-01 | `spine-review.test.ts`, `verify-scan.ts`, `verify-skeleton.ts` |
| REV-02 | `fields/route.test.ts` (ai_value byte-identical), `field-commit.test.ts`, `spine-review.test.ts` |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Status alert recovers after the server stops and restarts | INGEST-02 | Needs a real browser, a restarted server and tab refocus; `photo-polling.test.ts` covers the logic with `retry: false` only | Upload a photo, stop the server, wait for the alert, start the server, refocus the tab: the alert clears |
| Escape and click-away on a spine field in a real browser | REV-02 | Real DOM event order is not exercised; Vitest runs in node with a hand-written fake input | Edit a field, press Escape: nothing saves. Edit again, click away: it saves and survives reload |
| Re-attach an orphaned, edited spine | INGEST-04 | Dialog flow and focus need a browser; no orphan occurred in UAT | Edit a spine, re-scan so it is no longer detected, re-attach it: the edit carries over |
| Drag-and-drop onto /upload | INGEST-01 | Browser drag events | Drag two photos onto the drop area: both appear and reach Done |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-21
