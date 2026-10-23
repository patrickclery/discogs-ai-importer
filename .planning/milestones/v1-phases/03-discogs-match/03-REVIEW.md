---
phase: 03-discogs-match
reviewed: 2026-10-22T01:08:37Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/app/api/discogs/test/route.ts
  - src/app/api/discogs/test/route.test.ts
  - src/components/discogs-matches.tsx
  - src/components/discogs-matches.test.ts
  - src/server/discogs/enqueue.ts
  - src/server/discogs/enqueue.test.ts
  - src/server/discogs/reactivated-spine.test.ts
  - src/server/discogs/store.ts
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 03: Code Review Report (incremental, plan 03-15)

**Reviewed:** 2026-10-22T01:08:37Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

> This is an incremental review of gap-closure plan 03-15 (diff base `44c578c`, commits 0c2c76f..de8c576). It replaces the 03-14 incremental review. The finding IDs below are new. Prior findings are listed with their disposition under "Prior findings".

## Summary

03-15 adds an `afterAuthFailed` replay to `enqueueAutoSearch`, makes `enqueueMissingSearches` replay-aware, runs the includeAuthFailed backfill on every passing Test connection, and gates "Fields changed" and Search again through `showsFieldsChanged`. All 61 tests in the four touched suites pass.

These are the specific questions I traced:

- **Request loop:** none. A replay needs `includeAuthFailed`, which only `completeConnect` (connect.ts:126) and a passing Test connection (route.ts:91) pass. The Test connection route is only called from the button click (`test-discogs-button.tsx:52`). The maintenance hook still passes `false` (handlers/index.ts:39). If a replay gets a 401, `markAuthInvalid()` runs, `discogsReady()` goes false, and every later queued job finishes `auth_failed` without making a request (search-spine.ts:149-151). So the most it costs is one request per rejected spine for each owner action.
- **Duplicate jobs:** none. After a replay, the spine's latest search is the new queued row, so a second connect or test does not select it. The re-check inside the transaction (`latestSearch` id and status, enqueue.ts:97-105) covers a backfill racing a worker that finishes the same spine. `tx.immediate()` serializes a connect and a test that run at the same time.
- **Dedupe-key collision:** none. The replay key ends with the rejected search's ULID, and `finishUnauthed` released that search's own key (search-spine.ts:119-125). Dedupe keys are unique for the life of the job (`ON CONFLICT(dedupe_key)`, queue.ts:71), but a given rejected search can only be the latest once. The only code that deletes a search row is the A-03-11 branch, and it deletes the row it just created.
- **Restart:** the backfill now works. The copy is still wrong (WR-02).
- **Not-searched copy:** consistent. `showsFieldsChanged` gates both the notice and the action, and the body line on each kind of not-searched card names the remedy that actually applies to it.

**Prior findings:**

- **CR-01 (03-14):** resolved. The connect and test replay, the store.ts doc comment, and the end-to-end tests A, B and C all hold.
- **WR-01 (03-14):** resolved.
- **IN-01, IN-02, IN-04:** still open. They are carried forward below.
- **IN-03:** partly fixed, because enqueue.ts now names `NON_BASELINE_STATUSES`. It is carried forward.

The remaining defects are two cases where the card still tells the owner to "Reconnect Discogs in Settings" even though that is not the fix.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: An orphaned or non-CD spine whose search was rejected is never replayed, and its card still says "Reconnect Discogs in Settings" after a successful reconnect

**File:** `src/server/discogs/enqueue.ts:191-193` (`WHERE s.state = 'active' AND d.media_kind = 'cd'`), `src/server/discogs/enqueue.ts:107-112` (the replay is always `kind: 'auto'`), `src/server/jobs/handlers/search-spine.ts:136-141`
**Issue:** The replay only reaches active CD spines. Here is a path that breaks the plan's prohibition "MUST NOT keep telling the owner to reconnect Discogs on a spine card after a successful reconnect":

1. A CD spine is auto-searched and reaches `done`.
2. A rescan orphans the spine.
3. The owner edits the title. The card offers Search again (`matchesAction`; `enqueueExplicitSearch` accepts orphaned spines, enqueue.ts:277).
4. The token has been revoked, so the `again` search gets a 401 and ends `auth_failed`.
5. The owner reconnects. The selector skips the spine because it is not active, and the card stays `failed` / `{ kind: 'auth' }`.

The card then reads "Search failed: Discogs rejected the connection. Reconnect Discogs in Settings." forever, even though the app is connected and the owner just reconnected. An active spine whose current detection is no longer a CD hits the same problem.

Widening the selector would not help on its own. The replay is `kind: 'auto'`, and the handler skips an auto search for an orphaned spine, so the card would just read Not searched.

Only Retry search recovers the card. That is the same "UI promises a remedy the system never performs" pattern as the old CR-01, on a narrower path.
**Fix:** Pick one of these.

(a) In the read model, once the app is connected, show a non-replayable `auth_failed` latest search as the baseline's outcome, or as a plain failure with the copy "Retry the search". This needs the connected flag passed into `discogsForSpines`/`searchStateOf`, or a separate `failure.kind` such as `'auth_stale'` that the card renders differently when `connected` is true.

(b) In the connect and test backfill, replay `auth_failed` for orphaned and non-CD spines as an `again` search keyed `search:{searchId}`. That honors the owner's own earlier action (D-06), and the orphan auto-skip does not apply to it:

```ts
// separate select: state IN ('active','orphaned'), latest status auth_failed,
// and NOT (state = 'active' AND media_kind = 'cd'), only when includeAuthFailed
enqueueExplicitSearch(db, { spineId, kind: 'again' });
```

Add an invariant row for an orphaned spine with `done(current), auth_failed(current)` followed by a connect.

### WR-02: After a restart, the card copy "Reconnect Discogs in Settings" points to a button that does not exist

**File:** `src/lib/candidate-format.ts:55-57` (copy), `src/components/discogs-card.tsx:106-115,173-175`, with the behavior change in `src/app/api/discogs/test/route.ts:84-94`
**Issue:** 03-15 makes a passing Test connection the fix for the restart case, where the in-memory rejection flag has been lost (A-03-38, test C). But the card still says "Reconnect Discogs in Settings." After a restart, `needsReconnect` is false. Settings then renders `ConnectedSection` with no Reconnect button (`AccountSection` lines 106-115; `ReconnectAlert` only renders when `needsReconnect`). The owner follows the instruction, opens Settings, and finds Connected with nothing to reconnect.

The fix that actually works, pressing Test connection, is not mentioned anywhere. The only other ways out are Disconnect then Connect, or Retry on each card one at a time. The plan writes this down as an assumption (A-03-38), but it ships a dead-end instruction on the very path this plan set out to fix.
**Fix:** Make the auth failure copy depend on whether a reconnect is actually offered. For example, in `NoticeLine`, when `connected && !needsReconnect` and the failure kind is `auth`, render:

```ts
'Search failed: Discogs rejected the connection earlier. Use Test connection in Settings or retry the search.'
```

Keep the current text for when `needsReconnect` is true. Update the UI-SPEC "Search failed reasons" row to match.

## Info

### IN-01: A stray JSDoc block now sits directly above `showsFieldsChanged`

**File:** `src/components/discogs-matches.tsx:60-64`
**Issue:** The "Whole seconds until `until`, ticking once a second…" comment describes `useSecondsUntil`, which lives in another module. The new `showsFieldsChanged` was inserted right below it. There are now two JSDoc blocks in a row, so an editor may show the wrong one, and the stray block looks like it belongs to the new function.
**Fix:** Delete lines 60-64.

### IN-02 (carried from 03-14 IN-01): `latestAutoSearch` is still dead production code whose comment calls it the baseline

**File:** `src/server/discogs/store.ts:239`
**Issue:** Only `store.test.ts` calls it. It ignores `NON_BASELINE_STATUSES`. Any future caller that trusts its "baseline" comment would bring the CR-01 class of bug back.
**Fix:** Delete it and its test, or rename it to `latestAutoOrAgainSearch` and drop the word "baseline". Note that enqueue.ts now has a private `latestSearch` with the same query, so the two could be merged into one exported helper.

### IN-03 (carried from 03-14 IN-02): The waiting-line half of the invariant check is still a constant

**File:** `src/components/discogs-matches.test.ts:358-361`
**Issue:** `notSearchedLine({ state: 'active', mediaKind: 'cd' }, true) === NOT_SEARCHED_LINE` is always true, and the table still has no orphaned or non-CD rows. That gap is exactly what lets WR-01 above go unnoticed.
**Fix:** Pass in the spine's real DTO `state`/`mediaKind`. Add orphaned and unsure-media rows, including an `auth_failed` row with `connectQueues`.

### IN-04 (carried from 03-14 IN-03, partly fixed): The unsearched check is still written out by hand in queries.ts

**File:** `src/server/discogs/queries.ts:143-145,168-169,200-201`
**Issue:** enqueue.ts now names `NON_BASELINE_STATUSES`. queries.ts still repeats `(UNSEARCHED_STATUSES as readonly SearchStatus[]).includes(...)` twice, and one comment still lists "not connected, auth failed, skipped" by hand.
**Fix:** Export `isUnsearched(status)` from store.ts and use it in both places. Make the comment refer to `NON_BASELINE_STATUSES`.

### IN-05 (carried from 03-14 IN-04, grown): Test helpers are duplicated across three suites

**File:** `src/server/discogs/reactivated-spine.test.ts:52,82,162-228`; `src/components/discogs-matches.test.ts:125,151`; `src/app/api/discogs/test/route.test.ts:87`
**Issue:** `useTempSecrets` and `connect` are still copied across these suites, and 03-15 added more inline helpers (`jsonResponse`, `stubDiscogs`, `accessOk`, `identityOk`). These duplicate the fixtures in `connect.test.ts` (`ACCESS_OK`, `IDENTITY_OK`), so a change to the access-token response format has to be made in two places.
**Fix:** Move `useTempSecrets`, `connect`, `stubDiscogs` and the OAuth response fixtures into `test/helpers/`.

---

_Reviewed: 2026-10-22T01:08:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
