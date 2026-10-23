---
phase: 01-foundation
plan: 03
subsystem: settings
tags: [secrets, settings, server-actions, shadcn, security]

requires:
  - phase: 01-01
    provides: dataRoot(), scripts/lib/server.ts harness, .gitignore (D-11)
  - phase: 01-05
    provides: /settings page shell, shadcn primitives, Toaster
  - phase: 01-06
    provides: proxy.ts Origin guard, Vitest harness, useTempDataDir()
provides:
  - src/server/secrets.ts (SECRET_KEYS, SECRET_ENV_NAMES, secretsFile, getSecret, listSecretStatus, saveSecrets, clearSecret, mask, SecretsFileError)
  - src/app/settings/actions.ts (ActionState, saveDiscogsCredentials, clearSecretAction)
  - SecretField / DiscogsCredentials, StoragePaths, settings loading skeleton
  - scripts/verify-secrets.ts canary leak proof
affects: [01-04, phase-3]

tech-stack:
  added: []
  patterns:
    - "Secrets read per call (env > file > null); masked DTOs are the only thing rendered"
    - "Atomic secrets write: unique temp file in the same dir (mode 0600) + renameSync + chmod"
    - "Action results handled once per new state object via useEffectEvent"
    - "Copy that tests grep for is rendered as one string expression (no React text-node split)"

key-files:
  created:
    - src/server/secrets.ts
    - src/server/secrets.test.ts
    - src/app/settings/actions.ts
    - src/app/settings/actions.test.ts
    - src/components/secret-field.tsx
    - src/components/storage-paths.tsx
    - src/app/settings/loading.tsx
    - scripts/verify-secrets.ts
  modified:
    - src/app/settings/page.tsx

key-decisions:
  - "secretsFile() throws SecretsFileError('SECRETS_FILE must be outside DATA_DIR') so /settings shows the read-error Alert instead of crashing"
  - "JSON.parse errors are never surfaced (they quote file content); SecretsFileError carries generic copy"
  - "Saving with no fields present returns formError 'Nothing to save. Paste a value first.' (copy not in UI-SPEC)"
  - "verify-secrets follows Next 16's one-time 307 cache-busting redirect to read the real RSC payload"

requirements-completed: [FOUND-02]  # FOUND-03 Discogs half done; Claude CLI half is Plan 01-04

coverage:
  - id: S1
    description: "Env > file precedence, mask bounds, masked DTO, atomic 0600 write, idempotency, concurrency, malformed file, DATA_DIR refusal, action validation and I/O copy"
    requirement: FOUND-03
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/secrets.test.ts src/app/settings/actions.test.ts (18 tests)"
        status: pass
    human_judgment: false
  - id: S2
    description: "No canary in /settings HTML or RSC, /api/status, /api/dev/jobs, /upload, /spines, .next/static; env override renders From env; foreign Origin POST 403; file 0600 and unchanged; gitignore"
    requirement: FOUND-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-secrets.ts"
        status: pass
    human_judgment: false
  - id: S3
    description: "Replace/Cancel/Escape focus, Clear dialog, toasts, skeleton flash, path wrapping"
    requirement: FOUND-03
    verification:
      - kind: manual
        ref: "Task 2 human-check (deferred to end-of-phase verify)"
        status: pending
    human_judgment: true

actuals:
  tokens: 12400
  tasks: 2
  commits: 3
plan_head_before: e32008634009cc2c0eb6eb12466d3ee1605baec3
plan_head_after: c224a0f19ee92daeadf20213326b6776ee2ce1f1

duration: 5min
completed: 2026-10-19
status: complete
---

# Phase 1 Plan 03: Discogs Credentials and Secrets Storage Summary

**Discogs consumer key/secret saved to a 0600, atomically written secrets.json outside DATA_DIR, with env overrides, a SecretField state machine that only ever shows `…last4` masks, and a canary e2e proving no value leaks into HTML, RSC, APIs or the client bundle.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2/2
- **Files:** 9 (8 created, 1 modified)

## Task Commits

1. **Task 1 (TDD):** RED `7e75e10` (failing secrets/actions tests), GREEN `5c14ace` (secrets.ts, actions.ts, SecretField, Discogs app card)
2. **Task 2:** `c224a0f` (StoragePaths, loading.tsx, Data folder card, verify-secrets)

## TDD Gate Compliance

RED commit `7e75e10` failed on missing modules; GREEN `5c14ace` passed all 18 tests. No refactor commit needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] RSC payload request returned 307**
- **Found during:** Task 2 (verify-secrets step c)
- **Issue:** Next 16 redirects RSC requests without a matching `_rsc` cache-busting param.
- **Fix:** `getRsc()` follows the single 307 and asserts a `text/x-component` response before scanning.
- **Commit:** c224a0f

**2. [Rule 3 - Blocking] Biome `useAriaPropsSupportedByRole` on StoragePaths wells**
- **Fix:** Dropped `aria-labelledby` from the plain div wells; the Label sits directly above each well.
- **Commit:** c224a0f

**3. [Rule 2 - Correctness] Data folder card when SECRETS_FILE is inside DATA_DIR**
- **Fix:** Page renders "Not available (SECRETS_FILE must be outside DATA_DIR)" in the secrets path well instead of throwing.
- **Commit:** c224a0f

**Process note:** commits went to `master` directly, as the orchestrator instructed (sequential mode).

## Verification

- `corepack pnpm test`: 5 files, 61 tests passed
- `corepack pnpm lint`: clean. `corepack pnpm typecheck`: passed
- `node scripts/verify-secrets.ts` (with fresh build): `verify-secrets OK`
- Regression: `verify-skeleton OK`, `verify-guard OK`
- Ad-hoc render check under `next start`: unset (2x Not set, one shared Save credentials), partial (Saved `…1234` + Not set with its own Save credentials), malformed file (read-error Alert) all as specified
- All acceptance greps pass (server-only 1, 0o600 2, renameSync 1, DATA_DIR copy 1, defaultValue 0, NEXT_PUBLIC_ 0, listSecretStatus() 1, await connection() 1, break-all 1, Data folder copy 1, Skeleton 5)

## Known Stubs

None.

## Open Items

- Human check (focus movement on Replace/Cancel/Escape, Clear dialog, toasts, skeleton, long-path wrapping at 360px) deferred to end-of-phase verify.
- Plan 01-04 edits page.tsx (adds the Claude CLI card first) and imports SECRET_ENV_NAMES.

## Self-Check: PASSED
