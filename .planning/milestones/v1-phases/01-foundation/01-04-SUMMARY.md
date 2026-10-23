---
phase: 01-foundation
plan: 04
subsystem: claude-cli
tags: [claude-cli, subprocess, settings, security, d-18]

requires:
  - phase: 01-01
    provides: getDb(), settings table, scripts/lib/server.ts harness
  - phase: 01-03
    provides: SECRET_ENV_NAMES, settings actions, /settings page
  - phase: 01-05
    provides: /upload empty state, shadcn primitives (select, tooltip, spinner, alert)
  - phase: 01-06
    provides: Vitest harness, useTempDataDir()
provides:
  - src/server/proc/run.ts (runProcess, RunResult) for Phase 2's vision job
  - src/server/claude/cli.ts (claudeBin, buildClaudeEnv, getClaudeCliStatus, clearClaudeCliStatusCache, isClaudeReady, TEST_PROMPT, buildTestArgs, testClaude)
  - src/server/settings.ts (VISION_MODELS, DEFAULT_VISION_MODEL, VisionModelSchema, getSetting, setSetting, getVisionModel, setVisionModel)
  - saveVisionModel / testClaudeAction server actions
  - ClaudeCliCard, ModelSelect, TestClaudeButton; /upload readiness gate
  - test/fixtures/fake-claude.mjs and scripts/verify-claude-cli.ts
affects: [phase-2]

tech-stack:
  added: []
  patterns:
    - "Every claude spawn: runProcess (argv, no shell, detached group, timeout/abort, SIGTERM then SIGKILL) + buildClaudeEnv() + cwd os.tmpdir()"
    - "CLI JSON is zod-parsed to an allow-list of fields; identity fields dropped at parse time"
    - "Verify scripts that do not test the CLI pin CLAUDE_BIN to a missing path so pages are deterministic"

key-files:
  created:
    - src/server/proc/run.ts
    - src/server/claude/cli.ts
    - src/server/claude/cli.test.ts
    - src/server/settings.ts
    - src/server/settings.test.ts
    - src/components/claude-cli-card.tsx
    - src/components/model-select.tsx
    - src/components/test-claude-button.tsx
    - test/fixtures/fake-claude.mjs
    - scripts/verify-claude-cli.ts
  modified:
    - src/app/settings/page.tsx
    - src/app/settings/actions.ts
    - src/app/upload/page.tsx
    - scripts/verify-skeleton.ts
    - scripts/verify-secrets.ts

key-decisions:
  - "buildClaudeEnv also strips ANTHROPIC_AUTH_TOKEN (another API-billing path), not only ANTHROPIC_API_KEY"
  - "getClaudeCliStatus accepts an optional timeoutMs (default 10 s) so the hang case is testable fast"
  - "When the CLI is not installed the Login row is hidden rather than shown as Unknown"
  - "testClaude names the modelUsage key matching the requested model first, then the first key"
  - "testClaude rejects model ids that are not lowercase id-shaped before spawning (flag injection guard)"

requirements-completed: [FOUND-03, FOUND-04]

coverage:
  - id: S1
    description: "runProcess ENOENT, timeout + group kill, SIGKILL escalation, abort, maxBuffer, exact env; buildClaudeEnv scrub; status modes ok/logged-out/api-key/status-hang/missing; apiKeyInEnv; cache"
    requirement: FOUND-03
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/claude/cli.test.ts (28 tests)"
        status: pass
    human_judgment: false
  - id: S2
    description: "Vision model persisted, validated, survives reopen; saveVisionModel action"
    requirement: FOUND-03
    verification:
      - kind: unit
        ref: "corepack pnpm vitest run src/server/settings.test.ts (9 tests)"
        status: pass
    human_judgment: false
  - id: S3
    description: "Card states (Installed/Subscription/warning/API billing/Not logged in/Not installed), Upload gate, scrubbed child env and cwd, no identity or key in pages"
    requirement: FOUND-03
    verification:
      - kind: e2e
        ref: "node scripts/verify-claude-cli.ts"
        status: pass
    human_judgment: false
  - id: S4
    description: "Real CLI Test Claude through the subscription in the browser; layout at 360px and 1280px"
    requirement: FOUND-03
    verification:
      - kind: manual
        ref: "Task 3 human-check (deferred to end-of-phase verify)"
        status: pending
    human_judgment: true

actuals:
  tokens: 15000
  tasks: 3
  commits: 6
plan_head_before: 3c0b40fb5237c7291c854b0ea672357113c97e1e
plan_head_after: cb68e537106e0fc500a171c2d3744a7ea2bd0fd1

duration: 7min
completed: 2026-10-19
status: complete
---

# Phase 1 Plan 04: Claude CLI Setup Summary

**Settings now leads with a Claude CLI card (install, subscription login, ANTHROPIC_API_KEY warning, persisted Opus/Sonnet vision model, Test Claude via one headless `claude -p`), backed by a process-group-killing runner and a scrubbed child env that Phase 2's vision job will reuse.**

## Performance

- **Duration:** ~7 min
- **Tasks:** 3/3
- **Files:** 15 (10 created, 5 modified)

## Task Commits

1. **Task 1 (TDD):** RED `1499808`, GREEN `37565ea` (run.ts, cli.ts status, fake CLI, Claude CLI card)
2. **Task 2 (TDD):** RED `8731e72`, GREEN `d70dbd3` (settings.ts, saveVisionModel, ModelSelect)
3. **Task 3 (TDD):** RED `47777cf`, GREEN `cb68e53` (testClaude, testClaudeAction, TestClaudeButton, Upload gate, verify-claude-cli)

## TDD Gate Compliance

Each RED commit failed (missing modules / `testClaude is not a function`); each GREEN commit passed. No refactor commits needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Also strip ANTHROPIC_AUTH_TOKEN from the child env**
- **Issue:** The token is a second way the CLI authenticates against the API, which would bypass the subscription (T-01-18).
- **Fix:** `buildClaudeEnv` removes it with ANTHROPIC_API_KEY; tests and the fake log cover it.
- **Commit:** 37565ea

**2. [Rule 3 - Blocking] verify-skeleton asserted Open Settings on /upload unconditionally**
- **Issue:** With the readiness gate, a machine with a logged-in real CLI renders no Open Settings, so verify-skeleton would fail.
- **Fix:** verify-skeleton (and verify-secrets, for hermeticity) start the server with `CLAUDE_BIN=/nonexistent/dai-claude-cli`.
- **Commit:** cb68e53

**3. [Rule 2 - Correctness] Small interface extensions**
- `getClaudeCliStatus` takes an optional `timeoutMs`; `clearClaudeCliStatusCache()` is exported for `testClaudeAction`; `VisionModelSchema` is exported for the action. `testClaude` refuses non-id-shaped model strings before spawning.
- **Commits:** 37565ea, d70dbd3, cb68e53

## Verification

- `corepack pnpm test`: 7 files, 98 tests passed. `lint` clean. `typecheck` passed.
- `node scripts/verify-claude-cli.ts` (fresh build): `verify-claude-cli OK` (4 server runs, fake CLI got no ANTHROPIC_API_KEY or Discogs var, cwd = tmpdir, no fake email/org in 8 responses).
- Regression: `verify-skeleton OK`, `verify-secrets OK`, `verify-guard OK`.
- One live smoke test of the exact argv with ANTHROPIC_API_KEY unset: `claude -p ... --model claude-sonnet-5-5` returned `result/success`, `is_error false`, `"OK"`, modelUsage `[claude-sonnet-5-5]` in ~5.5 s.
- All acceptance greps pass (runProcess 1, shell: true 0, server-only 1+1, SECRET_ENV_NAMES/ANTHROPIC_API_KEY present, getClaudeCliStatus in page, saveVisionModel 1, app:vision-model-changed 1, testClaude 1, testClaudeAction 1, isClaudeReady( 1, aria-live 1); fixture committed 100755.

## Known Stubs

None.

## Open Items

- Human check (real CLI Test Claude in the browser, layout at 360px and 1280px) deferred to end-of-phase verify.

## Self-Check: PASSED
