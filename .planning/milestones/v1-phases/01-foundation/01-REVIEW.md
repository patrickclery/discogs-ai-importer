---
phase: 01-foundation
reviewed: 2026-10-19T06:32:58Z
depth: standard
files_reviewed: 65
files_reviewed_list:
  - .env.example
  - .gitignore
  - biome.json
  - next.config.ts
  - package.json
  - pnpm-workspace.yaml
  - drizzle/0000_init.sql
  - scripts/lib/jobs.ts
  - scripts/lib/server.ts
  - scripts/verify-claude-cli.ts
  - scripts/verify-guard.ts
  - scripts/verify-hmr.ts
  - scripts/verify-portability.ts
  - scripts/verify-restart.ts
  - scripts/verify-secrets.ts
  - scripts/verify-skeleton.ts
  - src/app/api/dev/jobs/route.ts
  - src/app/api/status/route.ts
  - src/app/error.tsx
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/settings/actions.ts
  - src/app/settings/page.tsx
  - src/app/settings/loading.tsx
  - src/app/spines/page.tsx
  - src/app/upload/page.tsx
  - src/components/app-header.tsx
  - src/components/claude-cli-card.tsx
  - src/components/dev-job-trigger.tsx
  - src/components/model-select.tsx
  - src/components/nav-link.tsx
  - src/components/secret-field.tsx
  - src/components/status-indicator.tsx
  - src/components/storage-paths.tsx
  - src/components/test-claude-button.tsx
  - src/components/theme-provider.tsx
  - src/instrumentation.ts
  - src/lib/status-types.ts
  - src/lib/utils.ts
  - src/proxy.ts
  - src/server/boot.ts
  - src/server/config.ts
  - src/server/ids.ts
  - src/server/secrets.ts
  - src/server/secrets.test.ts
  - src/server/settings.ts
  - src/server/settings.test.ts
  - src/server/storage/paths.ts
  - src/server/storage/paths.test.ts
  - src/server/db/client.ts
  - src/server/db/schema.ts
  - src/server/jobs/types.ts
  - src/server/jobs/queue.ts
  - src/server/jobs/queue.test.ts
  - src/server/jobs/lease.ts
  - src/server/jobs/lease.test.ts
  - src/server/jobs/worker.ts
  - src/server/jobs/handlers/index.ts
  - src/server/jobs/handlers/noop.ts
  - src/server/claude/cli.ts
  - src/server/claude/cli.test.ts
  - src/server/proc/run.ts
  - test/fixtures/fake-claude.mjs
  - test/helpers/temp-data-dir.ts
  - test/stubs/server-only.ts
findings:
  critical: 1
  warning: 6
  info: 6
  total: 13
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-19T06:32:58Z
**Depth:** standard
**Files Reviewed:** 65
**Status:** issues_found

## Summary

I reviewed the Phase 1 foundation: the loopback guard, secrets storage, settings, the durable SQLite job queue with its lease and worker, the Claude CLI integration and child-process runner, the Settings UI and the verify harness. Generated shadcn `src/components/ui/**`, the lockfile and the migration meta were out of scope.

The secret handling is sound. No raw value reaches a DTO, an action return, a log line or the child env, and the file writes are atomic with mode 0600. The child-process runner is also sound: it passes an argv array with no shell and validates the model id, so I found no command-injection path.

There are three main concerns:

1. **Claude CLI working directory.** The CLI runs from the shared, world-writable `/tmp`, which contradicts the D-18 claim that "no project settings are loaded".
2. **Origin guard ignores the port.** The guard compares hostnames only, so any other `localhost` origin passes it.
3. **At-least-once execution leaks.** Three queue paths can run a job twice or strand it in `running`. Phase 2 relies on "duplicate paid calls impossible by construction", so these matter.

## Critical Issues

### CR-01: Claude CLI runs from shared `/tmp`, so planted project settings, hooks and CLAUDE.md are loaded

**File:** `src/server/claude/cli.ts:10-14, 88-96`
**Issue:** `run()` spawns `claude` with `cwd: os.tmpdir()`, which resolves to `/tmp` on this machine. That directory is world-writable and shared by every user and process. Claude Code loads `CLAUDE.md`, `.claude/settings.json`, `.claude/settings.local.json` and `.mcp.json` from its cwd, and `-p` mode skips the workspace-trust prompt.

Anyone who can create `/tmp/.claude/settings.json` can therefore inject hooks. Those hooks run arbitrary commands as the owner on every Test Claude click, and in Phase 2 on every vision job. Anyone who can write `/tmp/CLAUDE.md` can inject prompt text into every vision read.

Separately, nothing restricts user-level settings: the owner's `~/.claude` hooks, plugins and permission mode (including bypass) all apply to the headless call. The comment "no project CLAUDE.md or settings are loaded" is therefore false. Phase 2 will pass attacker-influenced content (spine text in photos) into this same call.

**Fix:** Run from a private, empty directory and pin the setting sources and tools explicitly:
```ts
// once per process
const CLAUDE_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'dai-claude-')); // 0700, owned by us
// or a fixed dir under DATA_DIR/.. created with mode 0o700 and verified owner/empty

function run(args: string[], timeoutMs: number) {
  return runProcess({ command: claudeBin(), args, env: buildClaudeEnv(), cwd: CLAUDE_CWD, timeoutMs });
}

export function buildTestArgs(model: string): string[] {
  return ['-p', TEST_PROMPT, '--output-format', 'json', '--model', model,
    '--no-session-persistence', '--strict-mcp-config',
    '--setting-sources', 'user',   // never project/local
    '--tools', '',                 // test call needs no tools
    '--permission-mode', 'default'];
}
```
Also add a unit test asserting that cwd is not `os.tmpdir()` and that these flags are present.

## Warnings

### WR-01: The Origin check compares hostname only, so any `localhost:*` page can POST to route handlers

**File:** `src/proxy.ts:35-39`
**Issue:** `hostnameOfOrigin()` discards the scheme and port. `Origin: http://localhost:5173` belongs to any other local dev server, a malicious npm package's server, or any local app with an XSS bug, and it passes the guard. Next's built-in Server Action origin check covers actions, but route handlers have no such protection.

`/api/dev/jobs` calls `req.json()` regardless of Content-Type. A no-preflight `text/plain` cross-origin POST is therefore accepted and enqueues a job (see WR-02 for why that matters). Every future mutating route handler in Phase 2 and later inherits the same gap.
**Fix:** Require an exact origin match with the request's own host, or reject cross-site fetches:
```ts
const host = request.headers.get('host');
if (origin !== null && origin !== `http://${host}`) return forbidden();
// and/or: const site = request.headers.get('sec-fetch-site');
// if (site && site !== 'same-origin' && site !== 'none') return forbidden();
```
Also require `content-type: application/json` in JSON route handlers.

### WR-02: The noop `writeFile` dev hook can overwrite `app.db`, `app.db-wal` or `-shm`

**File:** `src/server/jobs/handlers/noop.ts:48-52`, `src/app/api/dev/jobs/route.ts:61-68`
**Issue:** `resolveData(writeFile)` only confines the path to DATA_DIR. The payload `{"writeFile":"app.db"}` replaces the live database file with a ULID string, which corrupts every job and setting. Dev hooks are on by default under `pnpm dev`, and combined with WR-01 a page on another localhost port can trigger this.
**Fix:** Confine test writes to a dedicated subfolder and reject DB files:
```ts
writeFile: z.string().regex(/^[\w.-]+$/).max(100).optional(),
// ...
const abs = resolveData(path.join('test-writes', writeFile));
```

### WR-03: A timed-out handler keeps running while its job is retried, causing duplicate execution and breaking lane concurrency

**File:** `src/server/jobs/worker.ts:86-114`
**Issue:** When the timeout fires, `aborted` rejects and `failOrRetry` requeues the job with a 2 s backoff. The lane then loops and claims more work. Any handler that does not honour `signal` keeps running in the background, and the comment on line 86 explicitly anticipates this.

After the backoff the same job is claimed again, so two executions run concurrently and the lane exceeds `LANE_CONCURRENCY` of 1. For Phase 2's paid Claude calls this breaks CONTEXT's "duplicate paid calls impossible by construction".
**Fix:** Do not release the lane or requeue until `run` actually settles. One option is to await `run` with a hard cap after abort (abort, then wait up to a grace period). If the handler is still alive after that, mark the job `failed` (not `queued`) with "handler did not stop". Phase 2 handlers must pass `ctx.signal` to `runProcess`.

### WR-04: Lease takeover requeues jobs the previous, still-alive holder is executing

**File:** `src/server/jobs/lease.ts:50-54`, `src/server/jobs/worker.ts:155-171`
**Issue:** Process B takes the lease once A's heartbeat is more than 15 s old, for example after an event-loop stall, a suspended laptop or several 5 s `busy_timeout` waits. B immediately runs `recoverRunningJobs()`, which requeues A's in-flight job, and B can then claim it.

A only notices the loss on its next tick, up to 5 s later, and only then aborts. Until it does, both processes execute the same job. The attempt fencing in `complete`/`failOrRetry` protects only the final status write, not the side effect (the paid call).
**Fix:** When stealing from a holder whose pid is still alive, delay recovery: keep the lease but recover only after one more `LEASE_STALE_MS`, or only jobs with `locked_at` older than the longest handler timeout. Also, before starting any paid side effect, have handlers check `heartbeatLease` or a per-job `locked_at` fence.

### WR-05: Jobs strand in `running` inside a live process when `complete()` or `failOrRetry()` throws

**File:** `src/server/jobs/worker.ts:106, 113, 125-131`; `src/server/jobs/queue.ts:283-305`
**Issue:** If `complete` or `failOrRetry` throws, for example `SQLITE_BUSY` after the 5 s busy timeout, the exception escapes `processNext` and `runLane` logs it and continues. The job stays `running`. `recoverRunningJobs` runs only when a process newly acquires the lease, so the job is stuck until restart. Its `dedupe_key` then makes `enqueue` return the stuck row. The `locked_at` column is written but never read, so no reaper exists.
**Fix:** Retry the status write a few times inside `processNext`. Also add a reaper in `tick()` for the holder: requeue or fail `running` jobs whose `locked_at < now - (handler.timeoutMs + grace)` and which are not in the in-flight set.

### WR-06: The readiness gate and env scrub still permit non-subscription billing, contrary to D-18

**File:** `src/server/claude/cli.ts:20-33, 125, 186-189`
**Issue:**
- **Readiness gate.** `isClaudeReady` treats `auth.state === 'other'` (API or console login) as ready, so the Test and Upload gates allow API-billed calls. D-18 says "No Anthropic API key and no API billing"; the UI only warns.
- **Env scrub.** `buildClaudeEnv` strips only `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`. `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX` and `ANTHROPIC_BASE_URL` still pass through. `ANTHROPIC_BASE_URL` also sends the OAuth credential to an arbitrary endpoint.
- **API-key warning.** `apiKeyInEnv` ignores `ANTHROPIC_AUTH_TOKEN`.

**Fix:** Gate readiness on `state === 'subscription'`, or make "other" an explicit opt-in setting. Add `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK` and `CLAUDE_CODE_USE_VERTEX` to the scrub list. Compute `apiKeyInEnv` over all of `API_BILLING_ENV`.

## Info

### IN-01: `processNext` reports `succeeded` even when `complete()` lost the race

**File:** `src/server/jobs/worker.ts:106-107`
**Issue:** The boolean returned by `complete()` is ignored, so a stale completion is reported as `'succeeded'`.
**Fix:** Return `'stale'` (or log) when `complete()` returns false.

### IN-02: Deterministic failures are retried up to `max_attempts`

**File:** `src/server/jobs/worker.ts:98-113`, `src/server/jobs/handlers/noop.ts:40`
**Issue:** The following all go through `failOrRetry` and are retried with backoff:
- a malformed `payload` (`JSON.parse`)
- a Zod `parse` failure
- a "path escapes DATA_DIR" error

In Phase 2 this means up to 3 paid calls for an error that cannot succeed.
**Fix:** Introduce a `PermanentJobError` (matched by name, because of HMR) that routes to `failJob`.

### IN-03: A `dedupe_key` permanently returns the old row, even when it is `failed` or `cancelled`

**File:** `src/server/jobs/queue.ts:56-80`
**Issue:** `enqueue` with an existing key returns `{created:false}` for a terminal failed job, so re-uploading the same photo never re-runs it. This is consistent with D-14's "manual retry", but no retry or reset function exists yet.
**Fix:** Add a `retryJob(id)` that resets `status`, `attempts` and `run_after`, or document that callers must not rely on re-enqueue.

### IN-04: The `secretsFile()` "outside DATA_DIR" check is lexical only

**File:** `src/server/secrets.ts:52-62`
**Issue:** A symlink, or a case-insensitive filesystem (`DATA_DIR=Data`, `SECRETS_FILE=data/secrets.json` on macOS), defeats the `startsWith` check. Only the root `/secrets.json` is gitignored, so a `SECRETS_FILE` elsewhere in the repo is not ignored.
**Fix:** Compare `fs.realpathSync` of both parent directories, case-folding on darwin and win32.

### IN-05: The shared both-unset form cannot save just one credential

**File:** `src/components/secret-field.tsx:398-428`, `src/app/settings/actions.ts:60-66`
**Issue:** Both inputs are always submitted. An empty field arrives as `''`, not `null`, and fails `ValueSchema` with "can't be empty". UI-SPEC says a partially configured state is valid, but it cannot be reached from this form.
**Fix:** In `saveDiscogsCredentials`, treat `''` as "not provided" and skip it. Keep the "Nothing to save" error when both are empty.

### IN-06: The proxy matcher exempts `/_next/image`, and the post-exit group SIGKILL can hit a reused PGID

**File:** `src/proxy.ts:44-46`; `src/server/proc/run.ts:147`
**Issue:**
- **Proxy matcher.** `/_next/image` bypasses the Host guard. Its internal fetch most likely re-enters the proxy with the original Host, but in Phase 2 the image optimizer will sit in front of the spine and photo routes. Guarding it, or setting `images.unoptimized: true`, removes that question entirely. The `.` in `favicon.ico` is also an unescaped regex wildcard.
- **Group SIGKILL.** `killTree(child, 'SIGKILL')` runs after the leader has exited and been reaped. If the group is empty, the pgid can in principle be reused by an unrelated process group (a tiny window).

**Fix:** Drop `_next/image` from the exclusion (or disable optimization), and escape the dot. Sweep the group only when `exitInfo` shows the leader was killed or timed out, or track it before reaping.

---

_Reviewed: 2026-10-19T06:32:58Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
