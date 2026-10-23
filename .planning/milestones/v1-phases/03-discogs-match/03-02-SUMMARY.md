---
phase: 03-discogs-match
plan: 02
subsystem: ui
tags: [discogs, settings, oauth1, nextjs-route-handlers, shadcn, vitest]

requires:
  - phase: 03-discogs-match
    provides: "Plan 03-01: connect/callback routes, discogsFetch, discogsGate, auth.ts connection DTO and auth-invalid flag, fake Discogs and verify-discogs harness"
provides:
  - Settings "Discogs" card (DiscogsCard) replacing the Phase 1 "Discogs app" card, with connection badge, connected view and reconnect Alert
  - ConnectDiscogsButton (CONNECT_BUTTON_ID), TestDiscogsButton (TEST_BUTTON_ID), DisconnectDiscogsButton
  - POST /api/discogs/test (ok/username or kind rejected|unreachable|busy|other) and POST /api/discogs/disconnect (local only)
  - clearSecretAction also clears the Discogs sign-in; Clear confirm copy amended while connected
  - clearAuthInvalid() in auth.ts (a successful test clears Reconnect needed)
  - verify-discogs steps (a), (j0), (j1) and the settingsText helper
affects: [03-03, 03-04, 03-13]

actuals:
  tokens: 13600
  tasks: 3
  commits: 4

plan_head_before: b5df2cad3c22f4c86e0ce7390ab19b129071f24a
plan_head_after: 7c8408693b8661d2e37b2e47ef355286ac8c77d4

tech-stack:
  added: []
  patterns:
    - "Route tests spy on the real discogsFetch via a partial vi.mock and inject a stubbed fetchImpl, so classification and markAuthInvalid stay the client's own"
    - "Focus after a server refresh: poll with requestAnimationFrame for the target id (bounded to 3 s)"
    - "verify steps read Settings as tag-stripped text (settingsText) and run assertNoLeak on the raw HTML"

key-files:
  created:
    - src/components/connect-discogs-button.tsx
    - src/components/discogs-card.tsx
    - src/components/test-discogs-button.tsx
    - src/components/disconnect-discogs-button.tsx
    - src/app/api/discogs/test/route.ts
    - src/app/api/discogs/test/route.test.ts
    - src/app/api/discogs/disconnect/route.ts
    - src/app/api/discogs/disconnect/route.test.ts
  modified:
    - src/app/settings/page.tsx
    - src/app/settings/actions.ts
    - src/app/settings/actions.test.ts
    - src/components/secret-field.tsx
    - src/server/discogs/auth.ts
    - scripts/verify-discogs.ts

key-decisions:
  - "A successful Test connection clears the in-memory auth-invalid flag (new clearAuthInvalid), so the Reconnect needed badge cannot contradict 'Connection works'"
  - "Clearing a consumer value clears the pending connect too, not only the three token keys: a request token issued for the old key can only fail"
  - "Connect failures for busy and credentials_missing use the UI-SPEC 'Other' template with plain-language reasons instead of the raw error code"
  - "The settings page reads key statuses and the connection DTO in one guarded call; a SecretsFileError keeps the existing destructive Alert, now inside DiscogsCard"

patterns-established:
  - "CONNECT_BUTTON_ID and TEST_BUTTON_ID live in the client components, so focus targets never require importing the server card"

requirements-completed: [DISC-01]

coverage:
  - id: D1
    description: "Settings shows Connect Discogs before connecting and 'Connected as fake-owner' after a connect through the app"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(a)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Test connection signs exactly one /oauth/identity with the stored token and the project User-Agent, and maps 401, network, 429 and pause to rejected, unreachable and busy without leaking a secret"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(j0)"
        status: pass
      - kind: unit
        ref: "src/app/api/discogs/test/route.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Disconnect deletes the three token keys and any pending connect locally; a broken secrets.json gives a 500 without its content; Settings returns to Not connected"
    requirement: DISC-01
    verification:
      - kind: unit
        ref: "src/app/api/discogs/disconnect/route.test.ts"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(j1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "After a rejected signed request, Settings shows Reconnect needed, the 'Discogs stopped accepting this app' Alert and Reconnect Discogs"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(j1)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Clearing the consumer key or secret while connected also disconnects; clearing while not connected still succeeds"
    requirement: DISC-01
    verification:
      - kind: unit
        ref: "src/app/settings/actions.test.ts#clearSecretAction on the consumer key while connected also disconnects"
        status: pass
    human_judgment: false
  - id: D6
    description: "Disconnect dialog behaviour, the toast, focus moving to Connect Discogs, and the amended Clear confirm sentence shown in the browser"
    requirement: DISC-01
    verification: []
    human_judgment: true
    rationale: "Focus movement and dialog behaviour are visual and keyboard checks (the plan's human-check, end-of-phase)"

duration: 8min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 02: Settings Discogs Card Summary

**The Settings "Discogs" card connects through discogs.com and then shows "Connected as {username}" with a profile link. From the same card the owner can test the connection through the paced gate, disconnect locally, and reconnect after Discogs rejects the app. Clearing a consumer value disconnects too.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-21T01:10:16Z
- **Completed:** 2026-10-21T01:18:21Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- `DiscogsCard` replaces the "Discogs app" card in second position. It has a connection badge (Not connected / Connected / Reconnect needed) and the existing credentials form. Before connecting it shows the account text and Connect Discogs. After connecting it shows the username link, the next-step line, Test connection and Disconnect Discogs. It receives only `getDiscogsConnection()`.
- `POST /api/discogs/test` answers `{ ok, username }` or `{ ok: false, kind }` with a reason of at most 160 characters. While the gate is paused it answers busy without sending a request. `POST /api/discogs/disconnect` clears the three token keys and any pending connect.
- A rejected sign-in shows the reconnect Alert, which holds the card's only accent button. Clearing a consumer value also disconnects, and the Clear confirm says so while connected.
- verify-discogs passes steps (a) through (j1) against the fake. 541/541 unit tests pass.

## Task Commits

1. **Task 1: Tracer, connect from Settings** - `34ccf6a` (feat)
2. **Task 2: Test connection** - `eca1057` (feat)
3. **Task 3: Disconnect, reconnect, clear-also-disconnects** - `a1e9c4a` (test, RED), `7c84086` (feat, GREEN)

## Files Created/Modified
- `src/components/connect-discogs-button.tsx` - Connect/Reconnect button: disabled tooltip, pending copy, inline failure lines
- `src/components/discogs-card.tsx` - the card: badge, account section, connected footer, reconnect Alert
- `src/components/test-discogs-button.tsx` - Test connection with the inline result; refreshes the page on rejected or ok
- `src/components/disconnect-discogs-button.tsx` - AlertDialog confirm, toast, inline error, focus to Connect
- `src/app/api/discogs/test/route.ts` (+ test) - identity check through the gate
- `src/app/api/discogs/disconnect/route.ts` (+ test) - local disconnect
- `src/app/settings/page.tsx` - renders DiscogsCard; one guarded read of statuses and connection
- `src/app/settings/actions.ts` (+ test) - clearSecretAction also clears the sign-in and the pending connect
- `src/components/secret-field.tsx` - `connected` prop and the amended Clear confirm sentence
- `src/server/discogs/auth.ts` - `clearAuthInvalid()`
- `scripts/verify-discogs.ts` - steps (a), (j0), (j1) and `settingsText`

## Decisions Made
- A successful test clears the auth-invalid flag. Otherwise "Connection works" could sit next to a "Reconnect needed" badge.
- The clear action also drops the pending connect. A request token issued for the old consumer key can only fail.
- For `busy` and `credentials_missing`, Connect shows plain-language reasons in the "Couldn't start connecting: {reason}. Try again." template instead of the raw codes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A successful Test connection left Reconnect needed on**
- **Found during:** Task 2
- **Issue:** The auth-invalid flag had no clear path except saving a new sign-in or disconnecting. A test that succeeded would show "Connection works" next to "Reconnect needed".
- **Fix:** Added `clearAuthInvalid()` to `auth.ts` (a file outside this plan's list). The test route calls it on success, and the button refreshes the page.
- **Files modified:** src/server/discogs/auth.ts, src/app/api/discogs/test/route.ts
- **Commit:** eca1057 (unit test "a success clears Reconnect needed" in a1e9c4a)

**2. [Rule 2 - Coverage] verify step (j1) renders the reconnect and disconnect states**
- **Found during:** Task 3
- **Issue:** The plan covered Reconnect needed and Disconnect with unit tests only. No check proved that Settings actually renders them.
- **Fix:** Step (j1) uses the fake's `revoked` mode. A rejected test must make Settings show "Reconnect needed", the Alert and Reconnect Discogs. Then `POST /api/discogs/disconnect` must remove the token keys and return Settings to Not connected.
- **Files modified:** scripts/verify-discogs.ts
- **Commit:** 7c84086

**3. [Rule 2 - Correctness] Clear also drops the pending connect**
- **Found during:** Task 3
- **Issue:** After a consumer value is cleared, a half-finished connect was still pending against the old key.
- **Fix:** `clearSecretAction` also calls `clearPendingConnect()`.
- **Commit:** 7c84086

---

**Total deviations:** 3 auto-fixed (1 bug, 2 coverage/correctness)
**Impact on plan:** No scope creep. `connect-discogs-button.tsx` is listed for Task 3 but needed no change there, because Task 1 already gave it the `label` and `id` props.

## TDD Gate Compliance

- **RED** (`a1e9c4a`): the target was `actions.test.ts > clearSecretAction on the consumer key while connected also disconnects`, run with vitest `--reporter=tap-flat`. The classifier returned `RED_EVIDENCE_OK` (target_test_failed); the record is `.planning/phases/03-discogs-match/tdd-evidence/03-02-red.json`. Semantic check: the target ran and failed on its planned assertion (`expected 'fake-owner' to be null`, meaning the sign-in survived the clear), and the consumer-secret test failed the same way. Two other files were not used as evidence:
  - `disconnect/route.test.ts` failed to load because the route did not exist yet.
  - `test/route.test.ts` passed: Task 2 had already built that route, so it was GREEN unexpectedly. Its `a success clears Reconnect needed` case pins the Rule 1 fix above.
- **GREEN** (`7c84086`): 25/25 tests pass across the three files.
- **REFACTOR:** none needed.

## Issues Encountered
- The first RED record was rejected as `invalid_record` (Malformed TAP). Vitest prints a multi-line object `actual:` at column 0. The assertion now compares `getDiscogsAuth()?.username ?? null`, which keeps the output on one line, and the rerun classified OK.

## User Setup Required
None.

## Next Phase Readiness
- Plan 03-04 can add `DiscogsConnectNotice`, `CallbackUrlField` and `PasteCodeForm` inside `DiscogsCard`. The UI-SPEC body order is: notice, reconnect Alert, credentials, callback URL, account section. After "Finish connecting" it should move focus to `TEST_BUTTON_ID` (exported from test-discogs-button.tsx). Its canary sweep (step (i)) can reuse `settingsText`.
- Plan 03-03 is unaffected. It reads `isAuthInvalid()`, and a successful test now clears that flag.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 8 created files exist; commits 34ccf6a, eca1057, a1e9c4a, 7c84086 are on HEAD. Plan verification: `pnpm test` 541/541, typecheck and lint clean, verify-discogs OK with (a)-(f), (h), (j0), (j1), verify-secrets OK (NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1). The owner's prod `.next/BUILD_ID` was unchanged throughout.
