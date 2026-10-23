---
phase: 03-discogs-match
plan: 04
subsystem: ui
tags: [discogs, oauth1, settings, paste-code, nextjs-route-handlers, vitest]

requires:
  - phase: 03-discogs-match
    provides: "Plan 03-01: pending-connect store, completeConnect, PLAINTEXT signer, fake Discogs with authorize 'code'; Plan 03-02: DiscogsCard, TestDiscogsButton (TEST_BUTTON_ID), verify-discogs (a), (j0), (j1)"
provides:
  - POST /api/discogs/finish (paste-code exchange against the pending connect; 415/400 empty/410 expired/401 rejected/503 busy/502 failed/200 username)
  - PasteCodeForm on the Settings card while a connect is pending
  - DiscogsConnectNotice (?discogs= toast and Alerts) and CallbackUrlField (Host-built callback URL with Copy)
  - readPendingConnect() and noteRejectedCode() with MAX_REJECTED_CODES = 5 in auth.ts
  - auth/connect/oauth unit tests; verify-discogs steps (g), (i), (j), (k), (l)
affects: [03-05, 03-06, 03-13]

actuals:
  tokens: 14900
  tasks: 3
  commits: 3

plan_head_before: 88d75e4ddbbce43251028d27a7a04553d06ac705
plan_head_after: 8688f9374ade7ed1a5615d91fbe4001522699907

tech-stack:
  added: []
  patterns:
    - "Non-consuming read of the pending entry (readPendingConnect) so a rejected pasted code leaves it for another try"
    - "Route failure reasons are fixed plain-language strings, never error messages, which can name /oauth/... paths"
    - "verify visibleText(): scripts, styles and tags stripped, entities decoded, before the forbidden-word sweep"

key-files:
  created:
    - src/app/api/discogs/finish/route.ts
    - src/components/paste-code-form.tsx
    - src/components/discogs-connect-notice.tsx
    - src/components/callback-url-field.tsx
    - src/server/discogs/auth.test.ts
    - src/server/discogs/connect.test.ts
    - src/server/discogs/oauth.test.ts
  modified:
    - src/server/discogs/auth.ts
    - src/components/discogs-card.tsx
    - src/app/settings/page.tsx
    - scripts/verify-discogs.ts

key-decisions:
  - "The finish route reads the pending entry without consuming it (new readPendingConnect) and deletes it only on success or at the 5th rejected code, because takePendingConnect would make a mistyped code fatal"
  - "The finish route answers 503 busy without a request while the gate is paused, matching connect and test, so a pasted code never waits behind a long pause"
  - "The paste-code form also shows during a Reconnect (connected, reconnect needed, connect pending), since a Reconnect can end on a code page too"
  - "The callback URL comes from callbackUrlFor(Host) in connect.ts, so the page and the connect route share one Host check; with no usable Host the well is not rendered"

patterns-established:
  - "FinishResult type exported from the finish route for client typing"

requirements-completed: [DISC-01]

coverage:
  - id: D1
    description: "A connect that ends on a discogs.com code page is finished by pasting the code; a wrong code answers rejected and keeps the connect pending; a reused code is expired"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(g) (l)"
        status: pass
      - kind: unit
        ref: "src/server/discogs/connect.test.ts#POST /api/discogs/finish"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pending connects live 14:59, gone at 15:00, single use, dropped at the 5th rejected code; clear removes three keys in one write; the connection DTO carries no secret"
    requirement: DISC-01
    verification:
      - kind: unit
        ref: "src/server/discogs/auth.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "completeConnect retries once with the docs signature, fails after a second 401, saves nothing without a username, records via 'code'; the PLAINTEXT signer double-encodes and adds token/verifier only when given"
    requirement: DISC-01
    verification:
      - kind: unit
        ref: "src/server/discogs/connect.test.ts#completeConnect"
        status: pass
      - kind: unit
        ref: "src/server/discogs/oauth.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "No /settings HTML, RSC payload, /api/status or Discogs route body carries the consumer secret, a token, a token secret or the code, while pending or connected"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(i)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Settings shows no technical words in not-connected, connected, reconnect-needed and each ?discogs= Alert state; the denied/expired/error Alert titles render; the callback URL for this port is shown"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(j) (k)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Connected toast once and URL replaced with /settings, Copy button and its toast, focus to Test connection after Finish connecting, narrow-window wrapping of the callback URL and username, real discogs.com deny/approve"
    requirement: DISC-01
    verification: []
    human_judgment: true
    rationale: "Client-side toasts, clipboard, focus and layout at narrow widths are visual checks; real discogs.com behaviour is the Plan 03-13 owner checkpoint (Task 2 human-check, end-of-phase)"

duration: 7min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 04: Paste-Code Fallback, Connect Notices and Callback URL Summary

**If discogs.com shows a code instead of coming back, the owner pastes it on Settings. `POST /api/discogs/finish` runs the same exchange against the pending connect. Every `?discogs=` return now ends in a toast or a plain-language Alert, and the callback URL for the owner's port sits in a copyable well. Unit tests pin the pending store, the exchange fallback and the signer, and a canary sweep shows no secret reaches the browser.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-21T01:30:04Z
- **Completed:** 2026-10-21T01:37:26Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- `POST /api/discogs/finish`: JSON-only body capped at 200 characters, code trimmed. It answers 400 `empty`, 410 `expired`, 401 `rejected` (the entry is kept and counted, then dropped at the 5th rejection), 503 `busy` while paused, 502 `failed` with a plain reason, or 200 `{ username }`. It never echoes the code.
- `PasteCodeForm` shows under Connect only while a connect is pending. It has FieldError plus `aria-invalid` for empty/expired/rejected/other, the "Connecting…" spinner, the Connected toast, and moves focus to Test connection.
- `DiscogsConnectNotice` (inside Suspense): the connected toast fires once, then `router.replace('/settings')`. denied, expired and error show the UI-SPEC Alerts. `CallbackUrlField` shows a mono `break-all` well, a 36 px Copy button with a "Callback URL copied" toast, and the description.
- Card order is notice, Reconnect Alert, credentials, callback URL, then the account section.
- 36 new unit tests. An 11-mutation check shows each one fails the suite. verify-discogs passes (a) through (l).

## Task Commits

1. **Task 1: Tracer, paste the code and connect** - `cfda647` (feat)
2. **Task 2: Connect notices and the callback URL** - `6364453` (feat)
3. **Task 3: Limits pinned and canary sweep** - `8688f93` (test)

## Files Created/Modified
- `src/app/api/discogs/finish/route.ts` - paste-code finish route
- `src/components/paste-code-form.tsx` - Code from Discogs field
- `src/components/discogs-connect-notice.tsx` - ?discogs= toast and Alerts
- `src/components/callback-url-field.tsx` - callback URL well with Copy
- `src/server/discogs/auth.ts` - `readPendingConnect`, `noteRejectedCode`, `MAX_REJECTED_CODES`, `rejections` on the entry
- `src/components/discogs-card.tsx` - notice, callback URL, paste-code form, `callbackUrl` prop, username wraps
- `src/app/settings/page.tsx` - Host via `headers()` from next/headers into `callbackUrlFor`
- `src/server/discogs/{auth,connect,oauth}.test.ts` - unit tests
- `scripts/verify-discogs.ts` - steps (g), (i), (j), (k), (l); `visibleText`, `postFinish`

## Decisions Made
- `readPendingConnect` reads the entry without consuming it. `takePendingConnect` would have made a single typo end the connect.
- The finish route answers busy while the gate is paused, the same as connect and test.
- The paste-code form also shows during a Reconnect that is pending.
- The callback URL reuses `callbackUrlFor` (one Host check shared with the connect route).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Non-consuming read of the pending entry**
- **Found during:** Task 1
- **Issue:** The 03-01 API had only `peekPendingConnect` (no secret) and `takePendingConnect` (consumes the entry). The plan's "keep the pending entry for another try" can't be built on those.
- **Fix:** Added `readPendingConnect(token)`, which is server-only and used only by the finish route. Export names from 03-01 are unchanged.
- **Files modified:** src/server/discogs/auth.ts
- **Commit:** cfda647

**2. [Rule 2 - Plain language] Fixed failure reasons in the finish route**
- **Found during:** Task 1
- **Issue:** Discogs error messages carry method and path (e.g. `/oauth/access_token`). Shown in "Couldn't start connecting: {reason}", they would put "oauth" and "token" on screen, which the phase prohibition forbids.
- **Fix:** 502 reasons are fixed plain strings. Busy is a 503 with a plain reason. Invalid bodies get a fixed message, so nothing pasted is echoed.
- **Commit:** cfda647

**3. [Rule 2 - Coverage] Extra verify checks**
- (g) also posts a wrong code (401, nothing stored) and a reused code (410). (j) also sweeps `?discogs=denied/expired/error` and asserts each Alert title renders. (i) also sweeps the actual saved token and secret values, not only the fake prefixes.
- **Commits:** cfda647, 6364453, 8688f93

---

**Total deviations:** 3 auto-fixed (all Rule 2). **Impact:** No scope creep. The file list is as planned.

## TDD Gate Compliance

Task 3 (`tdd="true"`) tests behaviour that Task 1 and Plan 03-01 had already implemented. All 36 tests therefore passed on the first run (unexpected GREEN, which the plan anticipated with "run them red where the code differs"). In place of a RED run, 11 mutations were applied one at a time and each failed 1-3 tests:
- auth: rejection cap `>=` changed to `>`, TTL `>` changed to `>=` in take, TTL `>` changed to `>=` in peek, clear that keeps the username
- finish route: no trim, no delete on success, no `noteRejectedCode`
- connect: no docs retry, `via` hard-coded
- oauth: `!'()*` not encoded, verifier always added

Each file was restored with `git checkout -- <file>`. There is only one `test(03-04)` commit (8688f93), which follows the feat commits, so no RED-before-GREEN commit order exists.

## Issues Encountered
- The connect route's own `failed` reason (Plan 03-01) still passes Discogs error messages through. A message such as "Discogs did not return a request token" could show "token" in the Connect button's inline error. This is out of scope for this plan, and (j) does not reach it because it only appears after a failed click. Noted for the phase verifier.

## User Setup Required
None.

## Next Phase Readiness
- The owner checkpoint in Plan 03-13 settles A1 on port 3001, through either the callback or the paste-code path. `discogs_connect_via` records which one was used.
- Plans 03-05 and 03-06 are unaffected: `getDiscogsAuth()` and `isAuthInvalid()` are unchanged.

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 7 created files exist. Commits cfda647, 6364453 and 8688f93 are on HEAD. Plan verification: `pnpm test` 577/577, typecheck, lint, verify-discogs OK (a)-(l), and verify-secrets OK (NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1).
