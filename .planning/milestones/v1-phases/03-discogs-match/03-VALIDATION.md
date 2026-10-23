---
phase: "03"
slug: "discogs-match"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: true) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-21"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed after execution by /gsd-validate-phase (State B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (node env, `pool: forks`, `server-only` stubbed, SECRETS_FILE isolated per test) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `corepack pnpm vitest run <path>` |
| **Full suite command** | `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` |
| **Estimated runtime** | ~11 seconds (tests) |

Integration scripts against `test/fixtures/fake-discogs.mjs` (`scripts/verify-discogs*.ts`) supplement vitest; they are not counted as automated coverage here.

---

## Sampling Rate

- **After every task commit:** Run `corepack pnpm vitest run <touched dir>`
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | DISC-01, DISC-02 | — | Secrets never in responses | unit | `vitest run src/server/discogs/{auth,connect,oauth,client}.test.ts` | ✅ | ✅ green |
| 03-01-02 | 01 | 1 | DISC-02 | — | Client is read-only (method allowlist) | unit | `vitest run src/server/discogs/client.test.ts` | ✅ | ✅ green |
| 03-01-03 | 01 | 1 | DISC-01 | — | Callback single-use, expired/denied handled | route | `vitest run src/app/api/discogs/callback src/server/discogs/connect.test.ts` | ✅ | ✅ green |
| 03-02-01 | 02 | 2 | DISC-01 | — | N/A | route | `vitest run src/app/api/discogs/connect` | ✅ | ✅ green (UI manual) |
| 03-02-02 | 02 | 2 | DISC-01 | — | N/A | route | `vitest run src/app/api/discogs/test` | ✅ | ✅ green |
| 03-02-03 | 02 | 2 | DISC-01 | — | New consumer key drops old token | route/action | `vitest run src/app/api/discogs src/app/settings/actions.test.ts` | ✅ | ✅ green |
| 03-03-01 | 03 | 2 | DISC-02, DISC-03 | — | N/A | unit | `vitest run src/server/discogs src/server/jobs/handlers/search-spine.test.ts` | ✅ | ✅ green |
| 03-04-01 | 04 | 3 | DISC-01 | — | N/A | unit | `vitest run src/server/discogs/connect.test.ts` | ✅ | ✅ green |
| 03-04-02 | 04 | 3 | DISC-01 | — | N/A | manual | — | — | manual |
| 03-04-03 | 04 | 3 | DISC-01 | — | Pending limits, no secret leaks | unit | `vitest run src/server/discogs/{auth,connect,oauth}.test.ts` | ✅ | ✅ green |
| 03-05-01 | 05 | 3 | DISC-02 | — | N/A | unit | `vitest run src/server/jobs src/server/discogs` | ✅ | ✅ green |
| 03-05-02 | 05 | 3 | DISC-02 | — | N/A | unit | `vitest run src/server/discogs/gate.test.ts` | ✅ | ✅ green |
| 03-06-01 | 06 | 3 | DISC-04 | — | Path-safe thumb cache | route | `vitest run src/server/discogs/thumbs.test.ts src/app/api/discogs/thumb` | ✅ | ✅ green |
| 03-06-02 | 06 | 3 | DISC-02 | — | Status has no secrets | route | `vitest run src/lib/status-text.test.ts src/server/discogs/status.test.ts src/app/api/status` | ✅ | ✅ green |
| 03-07-01 | 07 | 4 | DISC-03 | — | N/A | unit | `vitest run src/server/discogs/connect.test.ts src/server/discogs/enqueue.test.ts` | ✅ | ✅ green |
| 03-07-02 | 07 | 4 | DISC-03 | — | N/A | unit | `vitest run src/server/discogs src/server/jobs/handlers/search-spine.test.ts` | ✅ | ✅ green |
| 03-08-01 | 08 | 4 | DISC-03, DISC-04 | — | N/A | unit | `vitest run src/server/discogs/queries.test.ts src/components/discogs-matches.test.ts src/server/jobs/handlers/scan-photo.test.ts` | ✅ | ✅ green (UI manual) |
| 03-09-01 | 09 | 5 | DISC-03, DISC-04 | — | N/A | route | `vitest run src/app/api/spines` | ✅ | ✅ green (toggle manual) |
| 03-09-02 | 09 | 5 | DISC-04 | — | N/A | unit | `vitest run src/lib/candidate-format.test.ts src/server/discogs/queries.test.ts` | ✅ | ✅ green |
| 03-09-03 | 09 | 5 | DISC-03 | — | N/A | unit | `vitest run src/lib/photo-status.test.ts src/lib/photo-polling.test.ts` | ✅ | ✅ green (alert manual) |
| 03-10-01 | 10 | 6 | DISC-05 | — | N/A | unit/route | `vitest run src/server/discogs/queries.test.ts src/app/api/spines` | ✅ | ✅ green |
| 03-10-02 | 10 | 6 | DISC-05 | — | No stacked searches | route | `vitest run "src/app/api/spines/[id]/search" src/server/discogs/enqueue.test.ts` | ✅ | ✅ green |
| 03-11-01 | 11 | 7 | DISC-06 | — | Foreign/unknown search id refused | route | `vitest run src/app/api/discogs/searches src/server/discogs/fetch-release.test.ts` | ✅ | ✅ green |
| 03-11-02 | 11 | 7 | DISC-06 | — | Master links rejected | unit | `vitest run src/lib/discogs-ref.test.ts` | ✅ | ✅ green |
| 03-12-01 | 12 | 8 | DISC-06 | — | N/A | unit/route | `vitest run src/server/jobs/handlers/search-spine.test.ts src/app/api/discogs/searches` | ✅ | ✅ green |
| 03-12-02 | 12 | 8 | DISC-06 | — | N/A | unit/route | `vitest run src/server/discogs/{fetch-release,store}.test.ts src/app/api/spines` | ✅ | ✅ green |
| 03-13-01 | 13 | 9 | DISC-01..04 | — | N/A | report | `node scripts/report-discogs-live.ts` | ✅ | manual |
| 03-13-02 | 13 | 9 | DISC-01..04 | — | N/A | manual | — | — | manual |
| 03-13-03 | 13 | 9 | DISC-01..04 | — | N/A | report | `node scripts/report-discogs-live.ts` | ✅ | manual |
| 03-14-01 | 14 | 1 | DISC-03 | — | N/A | unit | `vitest run src/server/discogs/reactivated-spine.test.ts` | ✅ | ✅ green |
| 03-14-02 | 14 | 1 | DISC-03 | — | N/A | unit | `vitest run src/components/discogs-matches.test.ts src/server/discogs/reactivated-spine.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Formerly red rows (CR-01, WR-01..WR-05) were fixed per 03-REVIEW-FIX.md; their `it.fails` pins are now plain `it` and pass.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Connecting a real Discogs account | DISC-01 | Needs discogs.com and your login | In Settings, click Connect Discogs, approve on Discogs. You land back in Settings and see "Connected as" with your username. Try the paste-code option once too. |
| Settings card states | DISC-01 | UI | Disconnect, then reconnect. The card switches between Connect, Connected as, and Reconnect without a reload. |
| Matching on your real shelf | DISC-02, DISC-03 | Real API and rate limits | Upload a shelf photo. Each disc moves from Queued to Searching to a list of matches without reloading the page. |
| Nothing written to your collection | DISC-02 | Must check on discogs.com | Note your collection count before and after a run. It does not change. |
| Covers on match cards | DISC-04 | Visual | Each match shows its cover; matches with no cover show a grey disc icon. |
| Show all / Show fewer | DISC-04 | Visual | On a disc with many matches, click Show all, then Show fewer. The list grows and shrinks. |
| Header countdown when slowed down | DISC-02 | Timing, visual | During a big batch the header shows how many searches are waiting and a short wait message if Discogs slows you down. |
| Search Discogs… dialog | DISC-06 | Interactive | Open the dialog, search by text and by pasted release link. Results scroll, buttons stay visible, a picked result shows as "Added manually". Pasting a master link shows a plain message. |
| Reconnect clears "Reconnect Discogs" on a disc whose Retry ended auth_failed | DISC-03 | Escalated: code bug (03-REVIEW.md CR-01, plan 03-14 re-review); a test would be red until fixed | Revoke the app on discogs.com, click Retry on a failed disc, then reconnect in Settings. The disc should be searched again or show its last real result, not "Reconnect Discogs in Settings". |
| Narrow window and wording | All | Visual / copy | Shrink the window: nothing overlaps. No screen says "token", "OAuth" or "429". |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-21 — all 15 gaps closed (7 by new tests, 8 by review fixes)

## Validation Audit 2026-10-21

| Metric | Count |
|--------|-------|
| Gaps found | 15 |
| Resolved | 7 |
| Escalated | 8 |

## Validation Audit 2026-10-21

| Metric | Count |
|---|---|
| Gaps found | 8 |
| Resolved | 8 |
| Escalated | 0 |

## Validation Audit 2026-10-22

| Metric | Count |
|---|---|
| Gaps found | 3 |
| Resolved | 2 |
| Escalated | 1 |
