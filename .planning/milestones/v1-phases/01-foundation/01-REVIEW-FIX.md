---
phase: 01-foundation
fixed_at: 2026-10-19T07:50:00Z
review_path: .planning/phases/01-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 1: Code Review Fix Report

**Fixed at:** 2026-10-19T07:50:00Z
**Source review:** .planning/phases/01-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, WR-01 to WR-06). The six Info findings were out of scope.
- Fixed: 7
- Skipped: 0

All fixes were made in place on `master`, in the main checkout, with no worktree. Every gate below ran in that checkout.

## Verification

| Gate | Result |
|------|--------|
| `corepack pnpm test` | 10 files, 123 tests passed (98 before) |
| `corepack pnpm lint` | clean |
| `corepack pnpm typecheck` | clean |
| `scripts/verify-guard.ts` | OK (new other-port Origin, same-site and text/plain cases) |
| `scripts/verify-restart.ts` | OK |
| `scripts/verify-claude-cli.ts` | OK (asserts private cwd and hardening flags) |
| `scripts/verify-portability.ts` | OK |
| `scripts/verify-skeleton.ts`, `verify-secrets.ts`, `verify-hmr.ts` | OK |

The scripts stopped every server they started, and no Next process remained afterwards.

I ran one live `claude -p` smoke test before CR-01, with `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` unset, using `claude-haiku-4-5` and the final hardened flag set:

- **Result:** exit 0, `"result":"OK"`, `is_error:false`.
- **Context loaded:** 3.6K input tokens, so no CLAUDE.md and no tools were loaded.
- **Working directory:** the private cwd was still empty afterwards.

## Fixed Issues

### CR-01: Claude CLI runs from shared `/tmp`, so planted project settings, hooks and CLAUDE.md are loaded

**Files modified:** `src/server/claude/cli.ts`, `src/server/claude/cli.test.ts`, `scripts/verify-claude-cli.ts`
**Commit:** 467d5ee
**Applied fix:**
- **Private working directory.** `claudeWorkDir()` creates a per-process `mkdtemp` directory (mode 0700, owner and mode checked, recreated if it is loosened or removed, and `rmdir`'d on exit). Every spawn now runs there instead of `os.tmpdir()`.
- **New argv builder.** `buildClaudeArgs({prompt, model, readDirs})` adds `--restricted --safe-mode --strict-mcp-config --no-session-persistence --permission-mode dontAsk` to every call:
  - `--restricted` ignores user, project and local settings files, so neither planted nor owner hooks or permission modes apply. It also refuses bypassPermissions and confines file tools to the cwd plus `--add-dir`.
  - `--safe-mode` disables CLAUDE.md from the cwd and every parent directory, along with skills, plugins and hooks.
- **Tools.** The test call passes `--tools ""`, so it has no tools. For Phase 2, `readDirs` emits `--tools Read --allowedTools Read --add-dir <dir>` for each absolute directory. Relative and flag-like values are rejected.
- **Flag check.** I confirmed every flag in `claude --help`.
- **Deviation from the review.** The suggested `--permission-mode default` is not a valid choice, so I used `dontAsk`. `--setting-sources user` would still load the owner's user hooks, so `--restricted` replaces it.

### WR-01: The Origin check compares hostname only, so any `localhost:*` page can POST to route handlers

**Files modified:** `src/proxy.ts`, `src/proxy.test.ts` (new), `src/app/api/dev/jobs/route.ts`, `src/app/api/dev/jobs/route.test.ts` (new), `scripts/verify-guard.ts`
**Commit:** 4832b70
**Applied fix:**
- **Exact origin match.** On non-GET/HEAD requests, the proxy now requires the serialized Origin to equal `http://<Host>` exactly (scheme, host and port). It also refuses `Sec-Fetch-Site` values other than `same-origin` and `none`.
- **JSON content type.** `/api/dev/jobs` POST returns 415 unless the content type is `application/json`.
- **verify-guard.** It now sends a matching Origin for the allowed cases and asserts that other ports, `same-site` and `text/plain` requests are refused.

### WR-02: The noop `writeFile` dev hook can overwrite `app.db`, `app.db-wal` or `-shm`

**Files modified:** `src/server/jobs/handlers/noop.ts`, `src/server/jobs/queue.test.ts`, `scripts/verify-portability.ts`
**Commit:** bc4df8b
**Applied fix:**
- **Write confinement.** `resolveTestWrite()` keeps the existing `resolveData` escape check, so `../escape.txt` still fails with "path escapes DATA_DIR". It then requires the target to be inside `DATA_DIR/test-writes/`.
- **Portability probe.** The probe in verify-portability moved to `test-writes/`.
- **Deviation from the review.** I did not add the suggested edge regex. It would 400 the `../escape.txt` payload that verify-portability step 5 relies on to prove runtime confinement.

### WR-03: A timed-out handler keeps running while its job is retried, causing duplicate execution and breaking lane concurrency

**Files modified:** `src/server/jobs/worker.ts`, `src/server/jobs/queue.ts`, `src/server/jobs/types.ts`, `src/server/jobs/queue.test.ts`
**Commit:** 3236078
**Status:** fixed: requires human verification (job state-machine logic)
**Applied fix:**
- **Abort grace.** After an abort, `processNext` waits up to `ABORT_GRACE_MS` (10 s) for the handler to settle. The lane stays busy during that wait, and the job is not requeued.
- **Handlers that never stop.** If the handler is still running after the grace period, the job is failed for good with the error "handler did not stop after abort (...)".
- **Fencing.** `failJob` now takes an optional `attempt` fence.
- **Handler contract.** The JobHandler contract now documents that handlers must honour `ctx.signal`.

### WR-05: Jobs strand in `running` inside a live process when `complete()` or `failOrRetry()` throws

**Files modified:** `src/server/jobs/worker.ts`, `src/server/jobs/queue.ts`, `src/server/jobs/worker.test.ts` (new)
**Commit:** c826447
**Status:** fixed: requires human verification (job state-machine logic)
**Applied fix:**
- **Retried status writes.** Status writes in `processNext` are retried up to 5 times with backoff (`writeStatus`).
- **Reaper.** On every tick, the lease holder runs `reapStrandedJobs()`. It calls `recoverRunningJobs(now, {lockedBefore, excludeIds})`, which requeues, or fails if exhausted, any `running` job claimed earlier than `strandedAfterMs()` (longest handler timeout + abort grace + lease staleness). The holder's own in-flight jobs are skipped.
- **In-flight tracking.** The in-flight registry now records job ids, under a new `globalThis` key so it survives HMR.
- **Commit order.** I committed this before WR-04 because WR-04's deferred recovery depends on this reaper.

### WR-04: Lease takeover requeues jobs the previous, still-alive holder is executing

**Files modified:** `src/server/jobs/lease.ts`, `src/server/jobs/queue.ts`, `src/server/jobs/types.ts`, `src/server/jobs/worker.ts`, `src/server/jobs/lease.test.ts`, `src/server/jobs/queue.test.ts`, `src/server/jobs/worker.test.ts`
**Commit:** 9dc989f
**Status:** fixed: requires human verification (job state-machine logic)
**Applied fix:**
- **Live-holder detection.** The new `acquireLease()` returns `{acquired, fromLiveHolder}`. `tryAcquireLease` is kept as a boolean wrapper.
- **Deferred recovery.** After a takeover from a holder whose pid is still alive, the new holder recovers only stranded jobs (WR-05 threshold) instead of every `running` job. The per-tick reaper picks up the rest later.
- **Takeover from a dead holder.** Full recovery still runs immediately.
- **Side-effect fence.** `JobContext.isCurrent()` returns true only while the claim is current (`isClaimCurrent`) and the worker still holds the lease (`holdsLease`). Phase 2 handlers must check it right before a paid call.

### WR-06: The readiness gate and env scrub still permit non-subscription billing, contrary to D-18

**Files modified:** `src/server/claude/cli.ts`, `src/server/claude/cli.test.ts`, `src/components/claude-cli-card.tsx`, `src/components/test-claude-button.tsx`, `test/fixtures/fake-claude.mjs`, `scripts/verify-claude-cli.ts`
**Commit:** 7f80bb2
**Applied fix:**
- **Readiness gate.** `isClaudeReady` now requires `auth.state === 'subscription'`.
- **Test Claude.** `testClaude` returns the new `not-subscription` result for an API-billed login and never makes the `-p` call.
- **Env scrub.** `API_BILLING_ENV` now also covers `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK` and `CLAUDE_CODE_USE_VERTEX`.
- **Settings warning.** `apiKeyInEnv` and the new `apiBillingEnv` (names only) are computed over that whole list, and the Settings alert names each variable that is set.
- **verify-claude-cli.** In api-key mode it now asserts that Upload offers "Open Settings".

---

_Fixed: 2026-10-19T07:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
