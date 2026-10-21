---
phase: 03-discogs-match
plan: 01
subsystem: api
tags: [discogs, oauth1, plaintext, rate-limit, fetch, nextjs-route-handlers, vitest]

requires:
  - phase: 01-foundation
    provides: secrets.json storage (readFileMap/writeFileMap, 0600, outside DATA_DIR), proxy Host/Origin guard, settings table, verify-script harness
provides:
  - In-house Discogs client discogsFetch with UA, Accept, timeout, error classes and a GET-only allowlist (POST only /oauth/access_token)
  - Process-wide pacing gate on globalThis (discogsGate, intervalForLimit, parseRetryAfter)
  - PLAINTEXT OAuth signer (percentEncode, buildOAuthHeader, parseFormBody)
  - OAuth token storage in secrets.json outside SECRET_KEYS, pending request-token Map, auth-invalid flag, safe connection DTO
  - startConnect / completeConnect with the A2 docs-form retry
  - POST /api/discogs/connect and GET /api/discogs/callback
  - test/fixtures/fake-discogs.mjs with /__control, scripts/lib/discogs.ts helpers, scripts/verify-discogs.ts steps (b)-(f), (h)
  - NEXT_DIST_DIR support so verify builds go to .next/verify
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-13]

actuals:
  tokens: 20000
  tasks: 3
  commits: 4

plan_head_before: ed358574c459924ddddefd28c29a3c740955bdee
plan_head_after: ac07c7742acaa71d6e8b4463a805f27af96b24d1

tech-stack:
  added: []
  patterns:
    - "discogsFetch(req, deps) with injectable fetchImpl and gate; errors compared by name"
    - "globalThis singletons __discogsGate, __discogsPending, __discogsAuthInvalid"
    - "Fake external service as a node:http child process with a /__control endpoint and a secret-free JSONL log"
    - "Issued fake secrets carry fixed prefixes so verify steps can scan responses for leaks"

key-files:
  created:
    - src/server/discogs/config.ts
    - src/server/discogs/oauth.ts
    - src/server/discogs/gate.ts
    - src/server/discogs/client.ts
    - src/server/discogs/client.test.ts
    - src/server/discogs/auth.ts
    - src/server/discogs/connect.ts
    - src/app/api/discogs/connect/route.ts
    - src/app/api/discogs/callback/route.ts
    - test/fixtures/fake-discogs.mjs
    - scripts/lib/discogs.ts
    - scripts/verify-discogs.ts
  modified:
    - src/server/secrets.ts
    - .env.example
    - next.config.ts
    - tsconfig.json

key-decisions:
  - "auth 'request' signs with an explicitly passed token (request token, or the new access token during identity); auth 'oauth' always uses the stored token, and only 'oauth' 401s set the auth-invalid flag, so a failed connect never marks an existing connection invalid"
  - "The callback reads the request token from oauth_token, falling back to the denied= value (RESEARCH A6), so a denial that names the token only in denied= still consumes the pending entry"
  - "peekPendingConnect returns oauthToken, callback and expiresAt but never the request-token secret; only takePendingConnect hands the secret out"
  - "Builds for verify scripts go to NEXT_DIST_DIR (.next/verify by default in verify-discogs) so the owner's running next start on .next is never rebuilt underneath it"

patterns-established:
  - "Discogs error classes: DiscogsRateLimitedError (resumeAt), DiscogsAuthError, DiscogsNotFoundError, DiscogsRequestError, DiscogsUnavailableError; messages carry method, path and status only"
  - "verify-discogs step helpers (assertSettingsLocation, assertNoLeak, clearConnection, fakeLog) are exported for Plans 03-02 and 03-04"

requirements-completed: [DISC-01, DISC-02]

coverage:
  - id: D1
    description: "A connect started through the app goes to (fake) discogs.com, returns through the callback on the server's own port and saves the three token keys to secrets.json with mode 0600"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(b) (c)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Denied, made-up, replayed and failed callbacks end at denied, expired or error and store nothing; the docs-form exchange connects after exactly one retry"
    requirement: DISC-01
    verification:
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(e) (f) (h)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every Discogs request carries the project User-Agent and Accept header, waits on one paced gate, and 429/401/404/422/5xx/TypeError map to their error classes with a 60 s default pause"
    requirement: DISC-02
    verification:
      - kind: unit
        ref: "src/server/discogs/client.test.ts"
        status: pass
      - kind: e2e
        ref: "node scripts/verify-discogs.ts#(d)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The client cannot write to the owner's Discogs account: POST (other than /oauth/access_token), PUT, DELETE and PATCH throw before fetch"
    requirement: DISC-01
    verification:
      - kind: unit
        ref: "src/server/discogs/client.test.ts#read-only allowlist (phase prohibition)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Connect against the real Discogs account (callback honored, A1; exchange signature form, A2)"
    requirement: DISC-01
    verification: []
    human_judgment: true
    rationale: "Only provable against live discogs.com with the owner's app credentials; scheduled for Plan 03-13's owner checkpoint"

duration: 11min
completed: 2026-10-21
status: complete
---

# Phase 3 Plan 01: Discogs Connect and Paced Client Summary

**OAuth 1.0a PLAINTEXT connect through a callback built from the request's Host header, with tokens saved to secrets.json outside the editable form, behind a read-only native-fetch Discogs client and one globalThis pacing gate.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-21T00:56:48Z
- **Completed:** 2026-10-21T01:08:07Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- `discogsFetch` sends the project User-Agent and Accept header, waits on the gate, calls `observe(headers)` on every response and classifies every answer. It refuses any write before fetch is called.
- Connect flow: `POST /api/discogs/connect` returns the authorize URL. `GET /api/discogs/callback` exchanges the token (retrying once in the docs' `consumer_secret&` form), reads `/oauth/identity` and saves the token, secret and username in one atomic 0600 write. It always answers a 303 to one of four fixed `/settings?discogs=` targets.
- The fake Discogs server and `verify-discogs` steps (b)-(f) and (h) prove every outcome without touching the network or the owner's secrets.json. A 24-test unit suite pins the client.

## Task Commits

1. **Task 1: Tracer, connect through the callback** - `0b98f54` (feat)
2. **Task 2: Client classification and read-only allowlist** - `9dcda09` (test), `f453796` (style: import order)
3. **Task 3: Denied, expired, replayed and docs-form callbacks** - `ac07c77` (test)

## Files Created/Modified
- `src/server/discogs/config.ts` - User-Agent, Accept, and the api/web/image bases with https or loopback-only overrides
- `src/server/discogs/oauth.ts` - RFC 3986 encoding, PLAINTEXT header, form-body parser
- `src/server/discogs/gate.ts` - pacing gate (interval from X-Discogs-Ratelimit, doubles under 10% remaining), pause, Retry-After parsing
- `src/server/discogs/client.ts` - discogsFetch and the five error classes
- `src/server/discogs/client.test.ts` - 24 tests: classification, pacing, allowlist, no canary in messages
- `src/server/discogs/auth.ts` - token storage, pending Map (15 min, single use), auth-invalid flag, connection DTO
- `src/server/discogs/connect.ts` - startConnect, completeConnect, callbackUrlFor
- `src/app/api/discogs/connect/route.ts` - JSON-only POST, 409/503/401/502 bodies
- `src/app/api/discogs/callback/route.ts` - GET callback, fixed 303 targets
- `src/server/secrets.ts` - updateSecretsFile, readSecretsFileKey (SECRET_KEYS unchanged)
- `test/fixtures/fake-discogs.mjs` - node:http stand-in with /__control (authorize, accessSignature, revoked, reset)
- `scripts/lib/discogs.ts` - startFakeDiscogs, discogsEnv, connectTrace, connectViaApi
- `scripts/verify-discogs.ts` - end-to-end steps (b)-(f), (h)
- `.env.example` - DISCOGS_API_BASE / WEB_BASE / IMAGE_BASE as test-only
- `next.config.ts`, `tsconfig.json` - NEXT_DIST_DIR support (see Deviations)

## Decisions Made
- `auth: 'request'` signs with an explicitly passed token and `auth: 'oauth'` with the stored one. Only a 401 on the stored token sets the auth-invalid flag, so a connect whose identity check fails never marks an existing connection invalid.
- The callback falls back to the `denied=` value for the request token (A6), so a denial still consumes its pending entry.
- `peekPendingConnect()` never returns the request-token secret. Plan 03-04's paste-code route should `takePendingConnect(peek.oauthToken)` to get it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Verify builds would have overwritten the owner's live `.next`**
- **Found during:** Task 1
- **Issue:** The owner's prod server (`next start -p 3001`) serves this checkout's `.next`. `verify-discogs` must build new routes, and rebuilding `.next` under a running `next start` breaks the routes and chunks it has not loaded yet.
- **Fix:** `next.config.ts` reads `distDir` from `NEXT_DIST_DIR`, accepted only as `.next` or `.next/<name>`. `verify-discogs` defaults to `.next/verify`. The two `.next/verify/**/types` includes are committed in `tsconfig.json`, because `next build` otherwise rewrites the file. Other verify scripts can share that build with `NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1`.
- **Files modified:** next.config.ts, tsconfig.json, scripts/verify-discogs.ts
- **Verification:** the prod `.next/BUILD_ID` was unchanged after the build, and `127.0.0.1:3001/api/status` returned 200 throughout.
- **Committed in:** 0b98f54

**2. [Rule 2 - Coverage] Step (h) also checks the identity-failure path**
- **Found during:** Task 3
- **Issue:** The truth "an exchange or identity failure goes to /settings?discogs=error" had no verify step.
- **Fix:** Step (h) also connects with `/__control { revoked: true }` and asserts `error`, with no token keys stored.
- **Committed in:** ac07c77

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 coverage)
**Impact on plan:** No scope creep. The plan's public API and file list are as specified, plus next.config.ts and tsconfig.json.

## TDD Gate Compliance

Task 2 (`tdd="true"`) came after the Task 1 tracer, which had already implemented `client.ts` in full. The new tests therefore passed on the first run (unexpected GREEN). The plan anticipated this ("run it red where Task 1's code is incomplete").

Instead of a RED run, eight separate mutations were applied to `client.ts` and the suite was run against each:
- 60 s → 30 s default pause
- allowlist removed
- `markAuthInvalid` removed
- `observe` removed
- `acquire` removed
- 404 branch removed
- User-Agent removed
- response body leaked into the error message

Every mutation failed 1-5 tests. The file was then restored byte-identical (no git diff). The `test(03-01)` commit (9dcda09) follows the `feat(03-01)` commit (0b98f54), so there is no RED-before-GREEN commit order for this plan.

## Issues Encountered
- One unrelated unit test failed once on the first full `pnpm test` run. Three reruns passed 35/35 files, so this is a pre-existing flake not tied to this plan's files, which had no tests at that point. Not investigated.
- `scripts/verify-scan.ts` calls `runMain` at module top level, so importing its exports (as Plan 03-03 intends for `stepStart`, `upload` and `withDb`) also runs the whole verify-scan. `verify-discogs` uses its own `stepStart` for this reason. Plan 03-03 needs to move those helpers into `scripts/lib/` or guard the `runMain` call.

## User Setup Required
None. The real-account connect is checked in Plan 03-13.

## Next Phase Readiness
- Plan 03-02 can build the Settings card and Connect button on `getDiscogsConnection()` and the connect route's response bodies (`authorizeUrl`, or `credentials_missing` / `busy` / `bad_credentials` / `unreachable` / `failed`). It also adds step (a).
- Plan 03-03 imports `discogsFetch`, `discogsGate` and the error classes, and extends `fake-discogs.mjs` with the search, release and image endpoints. It needs the verify-scan import fix above.
- Plan 03-04 adds the paste-code route on `peekPendingConnect`, `takePendingConnect` and `completeConnect({ via: 'code' })`, plus `/__control { authorize: 'code' }` and step (g).

---
*Phase: 03-discogs-match*
*Completed: 2026-10-21*

## Self-Check: PASSED

All 12 created files exist; commits 0b98f54, 9dcda09, f453796, ac07c77 are on HEAD. Plan verification: typecheck, lint, 524/524 unit tests, verify-discogs OK, verify-secrets OK, verify-guard OK (both with NEXT_DIST_DIR=.next/verify VERIFY_SKIP_BUILD=1).
