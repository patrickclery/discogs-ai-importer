---
phase: "4"
slug: "import-review-queue"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-22"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run <touched test files>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~4 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test files>`
- **After every plan wave:** Run `npx vitest run` + `npx biome check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 4 seconds

---

## Per-Task Verification Map

Requirement-level map (each plan's tasks carry their own `<automated>` + `<fails_when>`; all 14 plans executed with per-task commits).

| Requirement | Plans | Test Type | Automated Command | File Exists | Status |
|-------------|-------|-----------|-------------------|-------------|--------|
| IMP-01 (confirm-only write) | 01, 03, 10, 11 | unit + e2e | `corepack pnpm vitest run src/server/discogs/client.test.ts "src/app/api/spines/[id]/import/route.test.ts"` + `node scripts/verify-discogs-import.ts` | ✅ | ✅ green |
| IMP-02 (folder, default Uncategorized) | 01, 06, 10, 11 | unit | `corepack pnpm vitest run src/server/jobs/handlers/add-to-collection.test.ts src/app/api/discogs/folders/route.test.ts` | ✅ | ✅ green |
| IMP-03 (duplicate warnings) | 02, 04, 13 | unit + e2e | `corepack pnpm vitest run src/server/imports/store.test.ts "src/app/api/spines/[id]/import/link-existing/route.test.ts" "src/app/api/spines/[id]/import/another/route.test.ts"` | ✅ | ✅ green |
| IMP-04 (exactly once, instance id) | 01, 02, 04, 07, 09, 10, 11 | unit + e2e (kill/502) | `corepack pnpm vitest run src/server/discogs/collection.test.ts src/server/imports/recovery.test.ts` + `node scripts/verify-discogs-import.ts` | ✅ | ✅ green |
| REV-03 (status filter + counts) | 05, 14 | unit + e2e | `corepack pnpm vitest run src/lib/review-status.test.ts src/server/scan/queries.test.ts` + `VERIFY_SKIP_BUILD=1 node scripts/verify-review-queue.ts` | ✅ | ✅ green |
| REV-04 (retry, retry all) | 03, 09, 12 | unit | `corepack pnpm vitest run "src/app/api/spines/[id]/retry/route.test.ts" src/app/api/spines/retry-failed/route.test.ts` | ✅ | ✅ green |
| REV-05 (not on Discogs) | 07, 08 | unit | `corepack pnpm vitest run "src/app/api/spines/[id]/not-on-discogs/route.test.ts" src/server/scan/not-on-discogs.test.ts src/server/scan/merge.test.ts` | ✅ | ✅ green |

Full suite: `corepack pnpm test` — 83 files, 1543 tests green (2026-10-22). Known load-sensitive timing tests (`src/server/claude/cli.test.ts`, `src/server/scan/match.test.ts`, pre-Phase-4) can fail under heavy CPU load and pass on re-run.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (fake Discogs collection in `test/fixtures/fake-discogs.mjs`, `scripts/verify-discogs-import.ts`, `scripts/verify-review-queue.ts` were created within the plans).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First real import lands in Uncategorized on discogs.com | IMP-01, IMP-02 | Only the owner can write to their real Discogs account | See 04-09-SUMMARY.md: on port 3001 add one CD, then check discogs.com |
| Stopping the app mid-import makes no duplicate on the real account | IMP-04 | Needs the real account; tests use the fake | See 04-09-SUMMARY.md: add a second CD, stop the app straight away, restart, check it appears once |
| Visual states (dialog, panels, empty states, 360px layout) | IMP-03, REV-03, REV-05 | Visual layout checks | End-of-phase UAT |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 4s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-22

## Validation Audit 2026-10-22

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
