---
phase: 01-foundation
verified: 2026-10-19T08:10:00Z
status: human_needed
score: 52/68 must-haves verified (4/4 roadmap success criteria)
covered_files: [".env.example",".gitignore",".nvmrc",".planning/phases/01-foundation/01-01-PLAN.md",".planning/phases/01-foundation/01-01-SUMMARY.md",".planning/phases/01-foundation/01-02-PLAN.md",".planning/phases/01-foundation/01-02-SUMMARY.md",".planning/phases/01-foundation/01-03-PLAN.md",".planning/phases/01-foundation/01-03-SUMMARY.md",".planning/phases/01-foundation/01-04-PLAN.md",".planning/phases/01-foundation/01-04-SUMMARY.md",".planning/phases/01-foundation/01-05-PLAN.md",".planning/phases/01-foundation/01-05-SUMMARY.md",".planning/phases/01-foundation/01-06-PLAN.md",".planning/phases/01-foundation/01-06-SUMMARY.md","README.md","biome.json","components.json","drizzle.config.ts","drizzle/0000_init.sql","drizzle/meta/0000_snapshot.json","drizzle/meta/_journal.json","mise.toml","next.config.ts","package.json","pnpm-lock.yaml","pnpm-workspace.yaml","scripts/lib/jobs.ts","scripts/lib/server.ts","scripts/package.json","scripts/verify-claude-cli.ts","scripts/verify-guard.ts","scripts/verify-hmr.ts","scripts/verify-portability.ts","scripts/verify-restart.ts","scripts/verify-secrets.ts","scripts/verify-skeleton.ts","src/app/api/dev/jobs/route.test.ts","src/app/api/dev/jobs/route.ts","src/app/api/status/route.ts","src/app/error.tsx","src/app/favicon.ico","src/app/globals.css","src/app/layout.tsx","src/app/page.tsx","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/loading.tsx","src/app/settings/page.tsx","src/app/spines/page.tsx","src/app/upload/page.tsx","src/components/app-header.tsx","src/components/claude-cli-card.tsx","src/components/dev-job-trigger.tsx","src/components/model-select.tsx","src/components/nav-link.tsx","src/components/secret-field.tsx","src/components/status-indicator.tsx","src/components/storage-paths.tsx","src/components/test-claude-button.tsx","src/components/theme-provider.tsx","src/components/ui/alert-dialog.tsx","src/components/ui/alert.tsx","src/components/ui/badge.tsx","src/components/ui/button.tsx","src/components/ui/card.tsx","src/components/ui/empty.tsx","src/components/ui/field.tsx","src/components/ui/input.tsx","src/components/ui/label.tsx","src/components/ui/select.tsx","src/components/ui/separator.tsx","src/components/ui/skeleton.tsx","src/components/ui/sonner.tsx","src/components/ui/spinner.tsx","src/components/ui/tooltip.tsx","src/instrumentation.ts","src/lib/status-types.ts","src/lib/utils.ts","src/proxy.test.ts","src/proxy.ts","src/server/boot.ts","src/server/claude/cli.test.ts","src/server/claude/cli.ts","src/server/config.ts","src/server/db/client.ts","src/server/db/schema.ts","src/server/ids.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/noop.ts","src/server/jobs/lease.test.ts","src/server/jobs/lease.ts","src/server/jobs/queue.test.ts","src/server/jobs/queue.ts","src/server/jobs/types.ts","src/server/jobs/worker.test.ts","src/server/jobs/worker.ts","src/server/proc/run.ts","src/server/secrets.test.ts","src/server/secrets.ts","src/server/settings.test.ts","src/server/settings.ts","src/server/storage/paths.test.ts","src/server/storage/paths.ts","test/fixtures/fake-claude.mjs","test/helpers/temp-data-dir.ts","test/stubs/server-only.ts","tsconfig.json","vitest.config.ts"]
covered_digest: "v3:sha256:3b66717d137694335e7019818803f50d0b2ea9aa9a62d3b60db89e2e4c01c7b1"
behavior_unverified: 14
overrides_applied: 0
behavior_unverified_items:
  - truth: "01-03: Replace swaps the mask well for a focused empty input; Cancel/Escape restores it and refocuses Replace; Clear opens a confirm dialog and removes only that value"
    test: "On /settings with a saved key: click Replace, press Escape, then Replace > Cancel, then Clear > confirm"
    expected: "Focus lands in the input, then back on Replace; after Clear only that field shows Not set"
    why_human: "Client focus/dialog state machine; no component or browser test exists"
  - truth: "01-03: Save and Clear show a Spinner with Saving…/Clearing… and stay disabled until resolved"
    test: "Click Save credentials and Clear"
    expected: "Spinner + label, button disabled while pending"
    why_human: "useActionState pending UI; no browser test"
  - truth: "01-03: Validation errors render inline (FieldError, aria-invalid, aria-describedby); secrets.json I/O errors render a destructive Alert, never a toast"
    test: "Submit a value with a space; make secrets.json unwritable and save"
    expected: "Inline field error; destructive Alert with documented copy"
    why_human: "Server returns are unit-tested (actions.test.ts); the client rendering is not"
  - truth: "01-04: Test Claude is disabled with a tooltip unless the CLI is installed and subscription-logged-in"
    test: "Run with CLAUDE_BIN pointing nowhere; hover/focus the disabled button"
    expected: "Disabled button, tooltip shown (copy is now 'Install the Claude CLI and log in with your Claude subscription first', changed by WR-06)"
    why_human: "Client tooltip render"
  - truth: "01-04: Pending Test shows Spinner with Testing…; model Select disabled while its save is pending"
    test: "Click Test Claude; change Vision model"
    expected: "Testing… spinner, disabled controls while pending"
    why_human: "Client pending state"
  - truth: "01-04: Test results render in role=status aria-live=polite with CircleCheck/CircleX; persist until next test or model change"
    test: "Click Test Claude (real CLI, subscription login)"
    expected: "Success line naming the model; cleared on model change"
    why_human: "testClaude() is unit-tested with the fake CLI; the click-to-render path is not"
  - truth: "01-05: Queue test job moves the header from Working · 1 queued to Worker idle"
    test: "pnpm dev, /settings > Queue test job, watch the header"
    expected: "Working · 1 queued, then Worker idle within ~5 s"
    why_human: "/api/status counts are e2e-verified; the polling indicator render is not"
  - truth: "01-05: Light/dark follows the OS setting"
    test: "Toggle OS theme with the app open"
    expected: "Palette switches without reload"
    why_human: "next-themes defaultTheme=system is present; visual"
  - truth: "01-05: Status indicator loading state (muted dot, Checking worker…)"
    test: "Hard-reload any page, observe header before first poll"
    expected: "Checking worker…"
    why_human: "Client-only transient state"
  - truth: "01-05: Status indicator error state (Status unavailable + retry tooltip, keeps polling every 5 s)"
    test: "Stop the server with the page open, then restart"
    expected: "Status unavailable, then recovers on its own"
    why_human: "Client polling behavior"
  - truth: "01-05: Status counts copy (Worker idle / Working · n queued / · f failed / Worker stopped)"
    test: "Queue a job with failTimes 5 via the dev route; observe header"
    expected: "· 1 failed appended once it fails"
    why_human: "Client render of counts"
  - truth: "01-05: Below 640px the wordmark collapses to an icon and status text is sr-only; header stays one 56px row at 360px"
    test: "DevTools at 360px"
    expected: "Single-row header, no overflow"
    why_human: "Visual layout"
  - truth: "01-05: app/error.tsx shows documented copy and Try again"
    test: "Force a server render error on a page and click Try again"
    expected: "'This page didn't load' with Try again that re-fetches"
    why_human: "Error boundary render; no test"
  - truth: "01-05: Only 400/500 weights; palette matches UI-SPEC incl. --success/--warning"
    test: "Inspect light and dark themes against UI-SPEC Color table"
    expected: "Matches"
    why_human: "No font-semibold/bold found by grep; palette match is visual"
human_verification:
  - test: "Theme: switch OS light/dark with the app open"
    expected: "App follows the OS without reload; colors match UI-SPEC"
    why_human: "Visual"
  - test: "Layout at 360px and 1280px: header, Upload/Spines empty states, every Settings card, Data folder card, Vision model select"
    expected: "No horizontal overflow; header one 56px row; long paths wrap; a long save error does not widen the card past max-w-2xl"
    why_human: "Backstop truths (insufficient_spec) - visual only"
  - test: "Test Claude click with the real CLI on your subscription (one tiny call)"
    expected: "Testing… spinner, then success naming the model in the aria-live region; disabled with tooltip when CLI missing/logged out"
    why_human: "Real CLI + client render; automated runs used the fake CLI only"
  - test: "Settings Replace/Cancel/Escape/Clear UX and Save/Clear pending + error rendering"
    expected: "Focus moves correctly, confirm dialog clears one value, inline errors and destructive Alert render as specified"
    why_human: "Client interaction state; no browser tests"
  - test: "Header status indicator: Checking worker… -> Working · 1 queued -> Worker idle; Status unavailable when server stops"
    expected: "Transitions as described; recovers on restart"
    why_human: "Client polling render"
  - test: "Prohibition (unresolved, 01-01): Next.js telemetry is not disabled for the owner's own pnpm dev/start (only the verify harness sets NEXT_TELEMETRY_DISABLED)"
    expected: "Owner decides: opt out (e.g. `next telemetry disable` or env in package scripts) or accept"
    why_human: "Unresolved prohibition - owner decision, flagged not passed"
  - test: "Prohibition (judgment, 01-03): Discogs consumer key/secret are never sent anywhere in Phase 1"
    expected: "Confirm - LLM-judge verdict (non-authoritative): holds; getSecret() has zero callers in src"
    why_human: "Judgment-tier prohibition requires human resolution"
---

# Phase 1: Foundation Verification Report

**Phase Goal:** The owner can launch the app locally with one command and save their credentials. All state lives in one portable data folder, and background work survives restarts and hot reloads.
**Verified:** 2026-10-19T08:10:00Z
**Status:** human_needed
**Re-verification:** No (initial verification, after the 01-REVIEW-FIX round)

## Goal Achievement

All four roadmap success criteria are proven by end-to-end scripts that I ran myself against a fresh build. The only open items are browser-only UI behaviors and two prohibition sign-offs.

### Roadmap Success Criteria

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | One command, opens at 127.0.0.1:<port>, unreachable from LAN | ✓ VERIFIED | `package.json` dev/start use `-H 127.0.0.1`; verify-skeleton (d): `ss` shows only `127.0.0.1:PORT`, connect to LAN IPv4 = ECONNREFUSED (no SKIP); verify-guard: foreign Host/Origin 403 |
| SC2 | Save Discogs creds, check Claude CLI on subscription, masked after reload, env override, no leak in API or git status | ✓ VERIFIED | verify-secrets (c-i): canary absent from HTML, RSC, /api/*, .next/static; env override; 0600; gitignored. verify-claude-cli (c-h) with the fake CLI: Subscription/API billing/Not logged in/Not installed; env scrubbed; private cwd. `git ls-files` has no secrets.json, data/ or *.db |
| SC3 | Copy data folder elsewhere, same state | ✓ VERIFIED | verify-portability: SIGTERM leaves no -wal/-shm; copy to new abs path + delete original gives identical counts and stored file; 11 text columns contain no old abs path; escape write refused |
| SC4 | Job queued before kill completes exactly once; HMR never starts a second worker | ✓ VERIFIED | verify-restart (A): SIGKILL mid-job gives J1 attempts 2, J2/J3 1, 3 rows; (B) backoff/terminal fail; (C) two-process lease takeover. verify-hmr: same bootId, starts=1, same PIDs after editing worker.ts/page.tsx/instrumentation.ts; post-reload job runs once |

### Plan Must-Have Truths (64)

| Plan | Verified | Not verified | Notes |
|------|----------|--------------|-------|
| 01-01 (10) | 10 | 0 | verify-skeleton a-i (build leaves DATA_DIR absent, migrated app.db, dev route 404 without APP_TEST_HOOKS); paths.test (empty DATA_DIR); exact pins + lockfile; `cn@0.5.0` is shadcn-ui/cn, owner-approved |
| 01-02 (10) | 10 | 0 | verify-restart, verify-hmr, verify-portability; queue/lease/worker tests (dedupe, ULID order, timeout abort, final-attempt recovery, resolveData guards) |
| 01-03 (17) | 13 | 3 PBU + 1 insufficient_spec | Server side fully tested (secrets.test, actions.test, verify-secrets). Mask ≤16 backstop has explicit test evidence. Replace/Escape/Clear, pending spinners and error rendering are client-only. Error-width backstop is visual |
| 01-04 (12) | 8 | 3 PBU + 1 insufficient_spec | cli.test (49 cases) + verify-claude-cli cover detection, auth states, env scrub, process-group kill, Test Claude results, model persistence, Upload gate. Tooltip, pending and result rendering are client-only; 360/1280 backstop is visual |
| 01-05 (10) | 2 | 8 PBU | Shell, redirect, empty states, Developer card gating (verify-skeleton e2/h2) and pinned shadcn deps verified; indicator states, theme, 640px collapse, error page and palette need a browser |
| 01-06 (5) | 5 | 0 | verify-guard + proxy.test; Vitest harness (123 pass); mise.toml node 24 / pnpm 12.14.0, .nvmrc 24; README and .env.example present |

**Score:** 52/68 truths verified (14 present but behavior-unverified, 2 insufficient_spec)

### Prohibitions

| Plan | Statement (short) | Tier | Disposition |
|------|-------------------|------|-------------|
| 01-01 | No telemetry/unsolicited outbound traffic | unresolved | ⚠️ Flagged: Next telemetry is on for owner runs (only `scripts/lib/server.ts` disables it). Owner decision |
| 01-02 | No job runs more than max_attempts | test | ✓ Enforced: queue.test "claim/recover three times…", verify-restart (B) |
| 01-03 | Discogs secrets never sent outbound in Phase 1 | judgment | ⚠️ Non-authoritative LLM verdict: holds (`getSecret` has zero callers). Human sign-off needed |
| 01-04 | No app secret passed to claude child | test | ✓ Enforced: cli.test env-scrub cases; verify-claude-cli (d) fake CLI log |
| 01-04 | Never bill the API account | test | ✓ Enforced: cli.test WR-06 cases, no minimal-mode flag; readiness requires a subscription login |

### Required Artifacts and Key Links

`gsd-tools verify.artifacts`: 46/46 pass across the 6 plans. `verify.key-links`: 24/24 wired. A manual check confirms the settings page renders ClaudeCliCard (ModelSelect, TestClaudeButton), DiscogsCredentials, StoragePaths and the dev-gated DevJobTrigger. `instrumentation.ts` dynamically imports `bootServer` on the nodejs runtime only, and the DB and worker singletons live on `globalThis`.

### Behavioral Spot-Checks and Probe Execution

| Check | Result | Status |
|-------|--------|--------|
| `corepack pnpm test` (single full run) | 10 files, 123 tests passed | ✓ PASS |
| `corepack pnpm lint` / `typecheck` | clean / clean | ✓ PASS |
| `node scripts/verify-skeleton.ts` (fresh build) | verify-skeleton OK | ✓ PASS |
| `VERIFY_SKIP_BUILD=1` verify-guard / -secrets / -claude-cli / -portability / -restart | all OK | ✓ PASS |
| `node scripts/verify-hmr.ts` | verify-hmr OK; sources restored, `git status` clean | ✓ PASS |
| Leftover Next processes after the runs | none | ✓ PASS |

No live `claude -p` call was made: verify-claude-cli uses `test/fixtures/fake-claude.mjs`, and the other scripts point CLAUDE_BIN at a nonexistent path.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| FOUND-01 | 01-01, 01-05, 01-06 | ✓ SATISFIED | SC1 evidence |
| FOUND-02 | 01-01, 01-02, 01-03, 01-06 | ✓ SATISFIED | SC3 evidence; subdirs photos/vision/crops/thumbs/backups created at boot |
| FOUND-03 | 01-03, 01-04 | ✓ SATISFIED (UI UX pending human) | SC2 evidence |
| FOUND-04 | 01-01, 01-02, 01-04, 01-05, 01-06 | ✓ SATISFIED | SC4 evidence |

No orphaned requirement IDs: REQUIREMENTS.md maps exactly FOUND-01 to FOUND-04 to Phase 1.

### Review-Fix Regression Check (01-REVIEW-FIX.md)

The CR-01 and WR-01 to WR-06 fixes are present and tested. Each has a dedicated test: cli.test private-cwd and hardening flags, proxy.test with the other-port Origin case, the noop test-writes confinement, queue.test WR-03 grace, worker.test WR-05 reaper, lease.test WR-04 live-holder deferral, and cli.test WR-06 subscription gate. All six e2e scripts still pass after the fixes, so I found no regression.

One intentional deviation: WR-06 changed the Test Claude tooltip copy from the planned "Install and log in to the Claude CLI first" to "Install the Claude CLI and log in with your Claude subscription first". That matches the stricter subscription gate and is not a gap.

### Anti-Patterns Found

None. I found no TBD, FIXME or XXX markers in src, scripts, test or config. I found no TODO, HACK or placeholder stubs either.

### Human Verification Required

1. **Theme.** Switch the OS between light and dark while the app is open. The app should follow without a reload, and the palette should match UI-SPEC.
2. **Layout at 360px and 1280px.** Check the header (one 56px row, wordmark collapses to an icon), the Upload and Spines empty states, all Settings cards and the Data folder card. Long paths should wrap, and a long save error must not widen the card.
3. **Test Claude with the real CLI** on your subscription. You should see the Testing… spinner, then a success line naming the model. With the CLI missing or logged out, the button should be disabled and show a tooltip.
4. **Settings secret UX.**
   - Replace focuses the input. Escape and Cancel restore the mask and refocus Replace.
   - Clear opens a confirm dialog and removes only that value.
   - Saving… and Clearing… show spinners.
   - Field errors render inline, and an I/O error renders as a destructive Alert.
5. **Header status.** It should go from Checking worker… to Working · 1 queued to Worker idle after Queue test job. When the server is stopped it should show Status unavailable, then recover.
6. **Error page.** A forced render error shows "This page didn't load", and Try again works.
7. **Telemetry (unresolved prohibition).** Decide whether to disable Next telemetry for your own runs.
8. **Discogs secret prohibition (judgment).** Confirm that nothing in Phase 1 sends the Discogs credentials anywhere. `getSecret` has no callers.

### Gaps Summary

No blocking gaps. The backend goal is fully proven by tests and scripts I ran myself: one-command localhost launch, saved and masked credentials with an env override, a portable data folder, and a restart- and HMR-safe single worker. What remains is browser-only UI behavior and two prohibition sign-offs.

---

_Verified: 2026-10-19T08:10:00Z_
_Verifier: Claude (gsd-verifier)_
