---
phase: 03-discogs-match
reviewed: 2026-10-21T18:34:24Z
depth: standard
files_reviewed: 112
files_reviewed_list:
  - .env.example
  - drizzle/0002_discogs_match.sql
  - drizzle/meta/0002_snapshot.json
  - drizzle/meta/_journal.json
  - next.config.ts
  - scripts/lib/discogs.ts
  - scripts/lib/scan.ts
  - scripts/report-discogs-live.ts
  - scripts/verify-discogs-backfill.ts
  - scripts/verify-discogs-search.ts
  - scripts/verify-discogs.ts
  - scripts/verify-scan.ts
  - scripts/verify-skeleton.ts
  - src/app/api/discogs/callback/route.ts
  - src/app/api/discogs/connect/route.ts
  - src/app/api/discogs/disconnect/route.test.ts
  - src/app/api/discogs/disconnect/route.ts
  - src/app/api/discogs/finish/route.ts
  - src/app/api/discogs/searches/[id]/route.ts
  - src/app/api/discogs/searches/[id]/thumb/[releaseId]/route.ts
  - src/app/api/discogs/test/route.test.ts
  - src/app/api/discogs/test/route.ts
  - src/app/api/discogs/thumb/[id]/route.test.ts
  - src/app/api/discogs/thumb/[id]/route.ts
  - src/app/api/files/[...path]/route.ts
  - src/app/api/spines/[id]/candidates/route.test.ts
  - src/app/api/spines/[id]/candidates/route.ts
  - src/app/api/spines/[id]/search/route.test.ts
  - src/app/api/spines/[id]/search/route.ts
  - src/app/api/status/route.ts
  - src/app/settings/actions.test.ts
  - src/app/settings/actions.ts
  - src/app/settings/page.tsx
  - src/components/callback-url-field.tsx
  - src/components/candidate-list.tsx
  - src/components/candidate-row.tsx
  - src/components/connect-discogs-button.tsx
  - src/components/discogs-card.tsx
  - src/components/discogs-connect-notice.tsx
  - src/components/discogs-matches.tsx
  - src/components/discogs-not-connected-alert.tsx
  - src/components/discogs-search-dialog.tsx
  - src/components/disconnect-discogs-button.tsx
  - src/components/paste-code-form.tsx
  - src/components/photo-section.tsx
  - src/components/search-state-badge.tsx
  - src/components/secret-field.tsx
  - src/components/spine-card.tsx
  - src/components/spines-view.tsx
  - src/components/status-indicator.tsx
  - src/components/test-discogs-button.tsx
  - src/components/ui/collapsible.tsx
  - src/lib/candidate-format.test.ts
  - src/lib/candidate-format.ts
  - src/lib/discogs-ref.test.ts
  - src/lib/discogs-ref.ts
  - src/lib/discogs-types.ts
  - src/lib/photo-status.test.ts
  - src/lib/photo-status.ts
  - src/lib/scan-types.ts
  - src/lib/spine-review.test.ts
  - src/lib/status-text.test.ts
  - src/lib/status-text.ts
  - src/lib/status-types.ts
  - src/server/db/schema.ts
  - src/server/discogs/auth.test.ts
  - src/server/discogs/auth.ts
  - src/server/discogs/client.test.ts
  - src/server/discogs/client.ts
  - src/server/discogs/config.ts
  - src/server/discogs/connect.test.ts
  - src/server/discogs/connect.ts
  - src/server/discogs/enqueue.test.ts
  - src/server/discogs/enqueue.ts
  - src/server/discogs/gate.test.ts
  - src/server/discogs/gate.ts
  - src/server/discogs/inputs.test.ts
  - src/server/discogs/inputs.ts
  - src/server/discogs/oauth.test.ts
  - src/server/discogs/oauth.ts
  - src/server/discogs/queries.test.ts
  - src/server/discogs/queries.ts
  - src/server/discogs/search.test.ts
  - src/server/discogs/search.ts
  - src/server/discogs/status.test.ts
  - src/server/discogs/status.ts
  - src/server/discogs/store.test.ts
  - src/server/discogs/store.ts
  - src/server/discogs/thumbs.test.ts
  - src/server/discogs/thumbs.ts
  - src/server/jobs/handlers/fetch-release.test.ts
  - src/server/jobs/handlers/fetch-release.ts
  - src/server/jobs/handlers/index.ts
  - src/server/jobs/handlers/search-spine.test.ts
  - src/server/jobs/handlers/search-spine.ts
  - src/server/jobs/queue.test.ts
  - src/server/jobs/queue.ts
  - src/server/jobs/types.ts
  - src/server/jobs/worker.test.ts
  - src/server/jobs/worker.ts
  - src/server/scan/queries.ts
  - src/server/scan/store.ts
  - src/server/secrets.ts
  - src/server/storage/paths.test.ts
  - src/server/storage/paths.ts
  - test/fixtures/discogs/release.json
  - test/fixtures/discogs/search-empty.json
  - test/fixtures/discogs/search-hit.json
  - test/fixtures/fake-discogs.mjs
  - test/setup/isolate-secrets.ts
  - tsconfig.json
  - vitest.config.ts
findings:
  critical: 1
  warning: 5
  info: 5
  total: 11
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-21T18:34:24Z
**Depth:** standard
**Files Reviewed:** 112
**Status:** issues_found

## Summary

I reviewed the Phase 3 Discogs match work: OAuth PLAINTEXT connect, the pacing gate, the client, search and release handlers, the enqueue and dedupe logic, the read model, the thumb cache, the routes and the UI. I prioritized non-test source and skimmed the tests.

The security posture is solid:
- The client is read-only by construction.
- Redirects are refused.
- The image host is allowlisted.
- Host and Origin are limited by the proxy.
- Secrets never reach DTOs or logs.
- The 0600 atomic writes are correct.
- The OAuth header encoding matches RFC 5849.

The defects are in the search lifecycle state machine:
- A spine whose auto search ended `skipped` can never be searched automatically again.
- The "baseline" search is defined three different ways, so the dedupe key, the backfill and the read model disagree.
- A rate-limit pause can time a job out and spend an attempt, which D-06 forbids.
- Credential and auth-state changes leave stale state behind.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A spine whose auto search ended `skipped` is never auto-searched again, while the UI says it is "waiting its turn"

**File:** `src/server/discogs/enqueue.ts:35-49`, `src/server/discogs/enqueue.ts:131-143`, `src/server/jobs/handlers/search-spine.ts:132-139`
**Issue:** Here is how it happens:
1. `runSearchSpine` finishes an auto search `skipped` when the spine is orphaned (or superseded or dismissed) at run time.
2. It does not release the job's dedupe key (only `finishUnauthed` calls `releaseDedupeKey`).
3. An orphaned spine becomes `active` again through re-attach (`orphans.ts:114`) or a re-scan merge (`merge.ts:134`, in the same transaction as `enqueueAutoSearchesForPhoto`).

From then on:
- `baselineHash()` excludes only `not_connected` and `auth_failed`. The `skipped` row counts as the baseline, so with unchanged inputs `enqueueAutoSearch` returns `false`. Even if the baseline were ignored, the unreleased `search:auto:{spine}:{hash}` key would refuse the insert.
- `enqueueMissingSearches` selects only `ls.id IS NULL OR not_connected [OR auth_failed]`, so the maintenance safety net never picks the spine up.
- The read model maps `skipped` to `not_searched`, and `discogs-matches.tsx:742` renders `NOT_SEARCHED_LINE` ("It's waiting its turn"). That is false: nothing will ever queue it.
- `matchesAction` offers neither Retry nor Search again, because the state is not `failed` and `fieldsChanged` is false for a `skipped` baseline (`queries.ts:125`).

This is realistic. Discogs runs at about 1 request per second, so a re-scan during a long backlog orphans spines whose auto jobs are still queued.

**Fix:** Treat `skipped` like `not_connected`: release the key, exclude it from the baseline, and let the backfill pick it up.
```ts
// search-spine.ts
if (!spine || VANISHED_STATES.has(spine.state) || (spine.state === 'orphaned' && search.kind === 'auto')) {
  finish('skipped');
  releaseDedupeKey(ctx.job.id);
  return;
}
// enqueue.ts baselineHash
AND status NOT IN ('not_connected', 'auth_failed', 'skipped')
// enqueue.ts enqueueMissingSearches
AND (ls.id IS NULL OR ls.status IN ('not_connected', 'skipped')
  OR (@includeAuthFailed = 1 AND ls.status = 'auth_failed'))
```

## Warnings

### WR-01: Three different "baseline" rules plus a permanent auto dedupe key cause stuck spines, a write lock on every lease tick, and stale candidates shown as current

**File:** `src/server/discogs/enqueue.ts:35-49,61-87,126-155`, `src/server/discogs/queries.ts:120-129`
**Issue:** The baseline search is defined three ways:
- `baselineHash` skips `not_connected` and `auth_failed`.
- `fieldsChangedSince` skips `not_connected` and `skipped` but counts `auth_failed`.
- `enqueueMissingSearches` selects on the latest row's raw status.

Meanwhile `search:auto:{spine}:{hash}` keys are never released after a `done`, `no_match` or `failed` run.

Concrete sequence:
1. Inputs A, search done (key A held).
2. Inputs C, re-scan, search done (key C held).
3. Inputs D, re-scan, enqueued. The owner disconnects, so D ends `not_connected`.
4. The owner edits the fields back to A and reconnects.

On every lease tick after that, the maintenance hook selects the spine (latest is `not_connected`) and opens an IMMEDIATE transaction. `baselineHash` returns C, which is not A, so it inserts a search row. `enqueue` hits the held key A, so it deletes the row and returns false. This repeats forever. The write lock is taken each tick, which contradicts the "write lock only when needed" comment at line 145.

The card meanwhile shows C's candidates as current with no "Fields changed" hint, because `fieldsChangedSince` sees a `not_connected` latest and returns false.

**Fix:** Use one shared SQL fragment for the baseline (the latest auto or again search whose status is not in `('not_connected','auth_failed','skipped')`) in `baselineHash`, `fieldsChangedSince`/`LATEST_SQL` and the backfill selector. In the backfill, skip spines where that baseline's `input_hash` already equals the current hash, so a no-op never takes the write lock. Also consider keying the auto dedupe on the search row (`search:auto:{spineId}:{hash}:{baselineSearchId}`), so returning to earlier inputs can search again.

### WR-02: A rate-limit pause can make a running search time out and spend an attempt (violates D-06)

**File:** `src/server/discogs/client.ts:195`, `src/server/discogs/gate.ts:118-130`, `src/server/jobs/handlers/index.ts:19-27`
**Issue:**
- `discogsFetch` awaits `gate.acquire()`, and that call sleeps through any pause (up to `RETRY_AFTER_MAX_MS` = 300 s).
- A route-originated request (Test connection, Connect, the paste-code finish) can get a 429 and pause the gate while a `search_spine` job (`timeoutMs: 90_000`) or `fetch_release` job (60 s) is between cascade stages.
- The job's signal aborts on timeout and `acquire` throws the abort reason.
- The handler's `default` branch records it as an error and rethrows, so the worker counts a failed attempt. After three attempts the spine reads "Search failed", even though Discogs only asked the app to wait.

**Fix:** Do not let worker requests block on a pause. Throw a rate-limited error up front so the handler defers:
```ts
// client.ts, before gate.acquire
const paused = gate.pausedUntil();
if (paused !== null && req.signal) {
  throw new DiscogsRateLimitedError(`${label} deferred: paused`, paused);
}
```
Alternatively, cap the time `acquire` will wait at the remaining job budget.

### WR-03: Saving a new consumer key while connected keeps the old token, but clearing the key disconnects

**File:** `src/app/settings/actions.ts:508-532` (vs. `534-550`)
**Issue:** `clearSecretAction` calls `clearDiscogsAuth()` because "the sign-in is bound to the consumer key", but `saveDiscogsCredentials` overwrites the key or secret and leaves the old access token in place. What happens next:
- The next signed request pairs the new consumer key with a token issued to the old one, gets a 401, and calls `markAuthInvalid()`. The first queued search finishes `auth_failed`.
- Every later search short-circuits to `auth_failed` with no request, until a reconnect.
- The Settings card still says "Connected" until that first 401 arrives.

**Fix:** In `saveDiscogsCredentials`, when a saved value differs from the stored one, call `clearDiscogsAuth()` and `clearPendingConnect()`, matching the clear path. Also have the secret-field copy warn that saving disconnects.

### WR-04: A successful Test connection clears "Reconnect needed" but leaves every `auth_failed` spine failed

**File:** `src/app/api/discogs/test/route.ts:83-85`, `src/server/jobs/handlers/index.ts:39`
**Issue:** After a 401 (possibly transient, or a token that works again), searches finish `auth_failed`. When Test connection succeeds, `clearAuthInvalid()` removes the banner, but:
- The maintenance hook runs with `includeAuthFailed: false`.
- Only `completeConnect` re-queues `auth_failed` spines.

So the cards keep showing "Search failed: Discogs rejected the connection. Reconnect Discogs in Settings." The Settings page says the connection works and there is no reconnect affordance. The owner has to press Retry on each card.

**Fix:** When the test succeeds and the flag was set, re-run the connect backfill:
```ts
if (isAuthInvalid()) {
  clearAuthInvalid();
  try { enqueueMissingSearches({ includeAuthFailed: true }); } catch (err) { console.error('[discogs] test backfill failed:', err); }
}
```

### WR-05: /spines reports "connected" while explicit searches are refused as not connected

**File:** `src/server/discogs/queries.ts:350-361`, `src/app/api/spines/[id]/search/route.ts:121-126`
**Issue:** The two checks disagree:
- `discogsConnection()` sets `connected` to `getDiscogsAuth() !== null` and ignores `isAuthInvalid()`.
- The search route gates on `discogsReady()`, which requires `!isAuthInvalid()`.

While a Reconnect is needed, the card hides the not-connected notice and enables "Retry search" and "Search Discogs…". Clicking either returns 409 "Connect Discogs in Settings first", which the UI shows as "Couldn't start the search: Connect Discogs in Settings first." That contradicts the visible state, and the dialog's disabled tooltip never shows.

**Fix:** Expose `needsReconnect` in `SpinesResponse.discogs`, or compute `connected` with `discogsReady()`. Then render a "Reconnect Discogs in Settings" notice and disable the actions.

## Info

### IN-01: Orphaned JSDoc block

**File:** `src/components/discogs-matches.tsx:622-626`
**Issue:** The "Whole seconds until `until`…" doc comment belongs to `useSecondsUntil`, which was moved to `use-seconds-until.ts`. It now sits directly above `NoticeLine`'s own JSDoc.
**Fix:** Delete lines 622-626.

### IN-02: Duplicated handler scaffolding and route boilerplate

**File:** `src/server/jobs/handlers/search-spine.ts:52-73,107-125`, `src/server/jobs/handlers/fetch-release.ts:36-86`, `src/server/discogs/connect.ts:24`, `src/app/api/discogs/callback/route.ts:15`
**Issue:**
- `NotCurrentError`, `message`, `errName`, `VANISHED_STATES`, `REASON_MAX`, `finish` and `finishUnauthed` are copied verbatim between the two handlers.
- The pre-flight checks (spine state, auth, pause) are duplicated too, which is how CR-01's missing key release would have to be fixed twice.
- `HOST_RE` is duplicated.
- The same content-type, JSON and strict-body preamble is repeated in 6 routes.

**Fix:** Extract a shared `discogsPreflight(search, ctx)` and the error helpers into `src/server/jobs/handlers/discogs-common.ts`, and add a `readJsonBody(req, schema)` route helper.

### IN-03: Owner-facing reasons cut with UTF-16 `.slice`

**File:** `src/server/jobs/handlers/search-spine.ts:115`, `src/server/jobs/handlers/fetch-release.ts:77`, `src/server/discogs/store.ts:121,139`
**Issue:** `.slice(0, REASON_MAX)` can split a surrogate pair. Elsewhere the code deliberately uses `capCodePoints`.
**Fix:** Use `capCodePoints(out.error, REASON_MAX)`.

### IN-04: The paste-code route counts non-code 401s as rejected codes

**File:** `src/app/api/discogs/finish/route.ts:91-95`, `src/server/discogs/connect.ts:87-94,106-111`
**Issue:** Any `DiscogsAuthError` is treated as a rejected code and uses up one of the 5 guesses. That includes a 401 from `/oauth/identity` after a successful exchange (the request token is already spent on Discogs' side) and the "consumer credentials are not set" error (status `null`). The owner is told "Copy it again", which cannot work. `completeConnect` also retries the exchange with `''` on the status-null error, which is pointless.
**Fix:** Retry and count rejections only when `err.status === 401` comes from the exchange call. Surface identity failures as `failed`.

### IN-05: `useNowUntil` duplicates `useSecondsUntil`

**File:** `src/components/status-indicator.tsx` (the `useNowUntil` hook), `src/components/use-seconds-until.ts`
**Issue:** The two countdown hooks are near-identical.
**Fix:** Reuse `useSecondsUntil(pausedUntil, true)`, or have one hook built on the other.

---

_Reviewed: 2026-10-21T18:34:24Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
