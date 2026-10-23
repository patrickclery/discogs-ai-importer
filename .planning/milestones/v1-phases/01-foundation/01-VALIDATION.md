---
phase: "01"
slug: "foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-21"
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconstructed after execution by /gsd-validate-phase (State B).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (node env, per-test temp data folder) plus `scripts/verify-*.ts` end-to-end scripts (each ends with `<name> OK`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `corepack pnpm vitest run <path>` |
| **Full suite command** | `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` |
| **Estimated runtime** | ~6 seconds (Phase 1 unit files); e2e scripts ~1–3 minutes total |

---

## Sampling Rate

- **After every task commit:** Run `corepack pnpm vitest run <touched dir>`
- **After every plan wave:** Run the full suite command plus the e2e scripts the wave touched
- **Before `/gsd-verify-work`:** Full suite and all seven `verify-*` scripts green
- **Max feedback latency:** 10 seconds (unit); e2e scripts run per wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | FOUND-02 | — | N/A (decision checkpoint: SQLite + Drizzle) | decision | — | n/a | ✅ green |
| 01-01-02 | 01 | 1 | FOUND-01 | — | Exact-pinned, vetted packages | human-verify | — | n/a | ✅ green |
| 01-01-03 | 01 | 1 | FOUND-01, FOUND-02, FOUND-04 | — | Binds 127.0.0.1 only | e2e | `node scripts/verify-skeleton.ts` | ✅ | ✅ green |
| 01-05-01 | 05 | 2 | FOUND-04 | — | N/A | build | `corepack pnpm build` | ✅ | ✅ green |
| 01-05-02 | 05 | 2 | FOUND-01, FOUND-04 | — | N/A | e2e + unit | `node scripts/verify-skeleton.ts`; `vitest run src/app/api/status/route.test.ts src/app/api/dev/jobs/route.test.ts` | ✅ | ✅ green |
| 01-06-01 | 06 | 2 | FOUND-01 | Host/Origin guard | Other hostnames and cross-site POSTs refused | e2e + unit | `node scripts/verify-guard.ts`; `vitest run src/proxy.test.ts` | ✅ | ✅ green |
| 01-06-02 | 06 | 2 | FOUND-04 | — | N/A | unit | `vitest run src/server/jobs/queue.test.ts` | ✅ | ✅ green |
| 01-06-03 | 06 | 2 | FOUND-01, FOUND-02 | Secrets never committed | `.env.example` has empty values, tracked | config check | `test "$(cat .nvmrc)" = 24 …`; `.env.example` grep | ✅ | ✅ green |
| 01-02-01 | 02 | 3 | FOUND-04, FOUND-02 | Path confinement | Job files only inside the data folder | unit | `vitest run src/server/jobs/queue.test.ts src/server/storage/paths.test.ts` | ✅ | ✅ green |
| 01-02-02 | 02 | 3 | FOUND-04 | — | One worker per data folder | unit | `vitest run src/server/jobs/lease.test.ts src/server/jobs/worker.test.ts` | ✅ | ✅ green |
| 01-02-03 | 02 | 3 | FOUND-02, FOUND-04 | — | N/A | e2e | `node scripts/verify-restart.ts`; `node scripts/verify-hmr.ts`; `VERIFY_SKIP_BUILD=1 node scripts/verify-portability.ts` | ✅ | ✅ green |
| 01-03-01 | 03 | 3 | FOUND-03 | Secret masking | Secrets masked in UI/API; env overrides | unit | `vitest run src/server/secrets.test.ts src/app/settings/actions.test.ts` | ✅ | ✅ green |
| 01-03-02 | 03 | 3 | FOUND-03, FOUND-02 | Canary leak | No secret in API responses or `git status` | e2e | `node scripts/verify-secrets.ts` | ✅ | ✅ green |
| 01-04-01 | 04 | 4 | FOUND-03 | Subscription gate | Warns when ANTHROPIC_API_KEY set; private cwd | unit | `vitest run src/server/claude/cli.test.ts` | ✅ | ✅ green |
| 01-04-02 | 04 | 4 | FOUND-03 | — | N/A | unit | `vitest run src/server/settings.test.ts` | ✅ | ✅ green |
| 01-04-03 | 04 | 4 | FOUND-03, FOUND-04 | — | Headless call via subscription only | unit + e2e | `vitest run src/server/claude/cli.test.ts`; `node scripts/verify-claude-cli.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Audit run 2026-10-21: 11 Phase 1 unit files, 153/153 tests passed; all seven `verify-*` scripts printed `OK`.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Settings secret UX (Replace, Cancel, Escape, Clear confirm; Saving…/Clearing… spinners; inline errors and the error box) | FOUND-03 | Client focus and dialog state; no browser tests | On Settings with a saved key, click Replace, press Escape, then Replace and Cancel, then Clear and confirm. Submit a value with a space. |
| Test Claude button: spinner, then a success line naming the model; disabled with a tooltip when the CLI is missing | FOUND-03 | Real CLI plus client render | Click Test Claude. Then point CLAUDE_BIN at a missing path and hover the button. |
| Header status: Checking worker…, then Working · 1 queued, then Worker idle; Status unavailable when the server stops | FOUND-04 | Client polling render | Click Queue test job on Settings and watch the header. Stop and restart the server. |
| Light/dark follows the OS; colors match UI-SPEC | FOUND-01 | Visual | Switch the OS theme with the app open. |
| Layout at 360px and 1280px | FOUND-01 | Visual | Narrow the window: the header stays one row and long paths wrap. |
| Error page shows "This page didn't load" and Try again works | FOUND-01 | Error boundary render | Force a render error and click Try again. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-21
