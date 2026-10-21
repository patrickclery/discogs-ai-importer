---
phase: 03-discogs-match
fixed_at: 2026-10-21T19:42:46Z
review_path: .planning/phases/03-discogs-match/03-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-10-21T19:42:46Z
**Source review:** .planning/phases/03-discogs-match/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (CR-01, WR-01..WR-05; Info out of scope)
- Fixed: 6
- Skipped: 0

**Verification:** `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` ran in the **main checkout** (`workflow.use_worktrees: false`, no worktree was created). Result: 63 files, 938 tests passed, 0 expected-fail. Every `it.fails` pin for CR-01 and WR-01..WR-05 is now a plain `it`.

## Fixed Issues

### CR-01: A spine whose auto search ended `skipped` is never auto-searched again

**Files modified:** `src/server/jobs/handlers/search-spine.ts`, `src/server/discogs/enqueue.ts`, `src/server/jobs/handlers/search-spine.test.ts`, `src/server/discogs/enqueue.test.ts`
**Commit:** 6219ea8
**Applied fix:**
- An orphaned spine's auto search now finishes `skipped` **and releases its dedupe key**.
- `skipped` is excluded from the enqueue baseline.
- The backfill re-picks a spine whose latest search is `skipped`.

Superseded and dismissed spines keep their key, since they never become active again. The `it.each` row for orphaned/auto was dropped from the key-kept table, and the 4 CR-01 pins were flipped.
**Status:** fixed: requires human verification (state-machine logic)

### WR-01: Three different "baseline" rules plus a permanent auto dedupe key

**Files modified:** `src/server/discogs/store.ts`, `src/server/discogs/enqueue.ts`, `src/server/discogs/queries.ts`, `src/server/discogs/enqueue.test.ts`, `src/server/discogs/queries.test.ts`
**Commit:** 1e0d5b7 (plus d193867, a stale-comment cleanup)
**Applied fix:**
- Added one shared `NON_BASELINE_STATUSES_SQL` (`not_connected`, `auth_failed`, `skipped`), used by `baselineSearch`, the new `baseline` CTE in `LATEST_SQL` and `fieldsChangedSince`. `fieldsChangedSince` now compares against `baseline_hash`.
- The backfill skips spines whose baseline already matches the current inputs before it opens the IMMEDIATE transaction.
- The auto dedupe key is now `search:auto:{spine}:{hash}:{baselineId|none}`, so returning to inputs used earlier (A, then C, then back to A) can search again.
- Added a regression test for the A-C-A case.
**Status:** fixed: requires human verification (state-machine logic)

### WR-02: A rate-limit pause can make a running search time out and spend an attempt

**Files modified:** `src/server/discogs/client.ts`, `src/server/jobs/worker.test.ts`
**Commit:** 0bfbbe4
**Applied fix:** `discogsFetch` throws `DiscogsRateLimitedError` before `gate.acquire` when the request carries a signal (only job handlers pass one) and the gate is paused. Both handlers already defer on that error. Route requests still wait as before.
**Status:** fixed: requires human verification

### WR-03: Saving a new consumer key while connected keeps the old token

**Files modified:** `src/app/settings/actions.ts`, `src/app/settings/actions.test.ts`, `src/components/secret-field.tsx`
**Commit:** f5724e2
**Applied fix:**
- `saveDiscogsCredentials` compares the effective values (`getSecret`) before and after the save. When the value changes, it calls `clearDiscogsAuth()` and `clearPendingConnect()`.
- Re-saving the same value, or a value that an env var overrides, keeps the sign-in. A test was added for this.
- While connected, the field now warns that saving a different value disconnects.

### WR-04: A successful Test connection leaves every `auth_failed` spine failed

**Files modified:** `src/app/api/discogs/test/route.ts`, `src/app/api/discogs/test/route.test.ts`
**Commit:** 79ed515
**Applied fix:** When the test passes and Reconnect needed was set, the route clears the flag and runs `enqueueMissingSearches({ includeAuthFailed: true })`. That call is guarded by try/catch and logged on failure.

### WR-05: /spines reports "connected" while explicit searches are refused

**Files modified:** `src/server/discogs/queries.ts`, `src/lib/scan-types.ts`, `src/app/api/spines/[id]/search/route.ts`, `src/app/api/spines/[id]/search/route.test.ts`, `src/components/discogs-not-connected-alert.tsx`, `src/components/spines-view.tsx`, `src/components/photo-section.tsx`, `src/components/discogs-matches.tsx`
**Commit:** d53219d
**Applied fix:**
- `discogsConnection()` now returns `connected` (signed in and not refused, the same check as `discogsReady()`) plus `needsReconnect`.
- The page alert and the card line say "Reconnect Discogs" when a reconnect is needed.
- Retry / Search again is disabled while not connected.
- The search route's 409 message says "Reconnect Discogs in Settings first" when a refused sign-in is stored.

The UI copy needs a manual check.

---

_Fixed: 2026-10-21T19:42:46Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
