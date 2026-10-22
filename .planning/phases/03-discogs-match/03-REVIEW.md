---
phase: 03-discogs-match
reviewed: 2026-10-22T00:26:43Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/components/discogs-matches.test.ts
  - src/components/discogs-matches.tsx
  - src/server/discogs/enqueue.ts
  - src/server/discogs/queries.ts
  - src/server/discogs/reactivated-spine.test.ts
  - src/server/discogs/store.ts
findings:
  critical: 1
  warning: 1
  info: 4
  total: 6
status: issues_found
---

# Phase 03: Code Review Report (incremental, plan 03-14)

**Reviewed:** 2026-10-22T00:26:43Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

> This is an incremental review of gap-closure plan 03-14 (commits 57b3a7d..140383f). It replaces the earlier full-phase review of 112 files. That review's findings were dispositioned in `03-REVIEW-DISPOSITION.md`. The finding IDs below are new and do not match the earlier review's IDs.

## Summary

03-14 adds one shared status rule (`UNSEARCHED_STATUSES` / `NON_BASELINE_STATUSES` in `store.ts`), a baseline fallback in the read model (`effectiveSearch`), and `notSearchedLine`.

**The prior CR-01 is closed for `not_connected` and `skipped`.** I traced every combination of latest search and baseline:

- The card reads `not_searched` exactly when the maintenance selector picks the spine and the `due` precheck passes (`baselineSearch(..)?.input_hash !== current`).
- Both paths hash the same `spine_fields` values through `searchInputs`/`inputHash`.
- The orphan-skip path in `search-spine.ts` releases the dedupe key, so the follow-up `enqueueAutoSearch` cannot collide.
- The vanished-state skip path does not release its key, but superseded and dismissed spines never become active again: `merge.ts` only considers `active`/`orphaned`, and `reattachSpine` only re-activates the orphan.

**The same class of bug is still open for `auth_failed` (CR-01 below).** `auth_failed` is excluded from the baseline. The connect backfill skips the spine whenever that baseline already covers the current inputs. `effectiveSearch` only falls back for `UNSEARCHED_STATUSES`. The result: after a successful reconnect, the card keeps telling the owner to reconnect. The new `store.ts` comment claims auth_failed "is only re-picked by a connect", which is false in this case.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: After a reconnect, an auth_failed search is never re-picked when the baseline covers the inputs, and the card keeps saying "Reconnect Discogs"

**File:** `src/server/discogs/enqueue.ts:149-161`, `src/server/discogs/queries.ts:163-183`, `src/server/discogs/store.ts:53-61`
**Issue:**

`NON_BASELINE_STATUSES` documents auth_failed as "only re-picked by a connect (T-03-17)". The connect backfill (`enqueueMissingSearches({ includeAuthFailed: true })`) does select a spine whose latest auto/again search is `auth_failed`. But the `due` precheck at lines 157-161 and `enqueueAutoSearch` at line 70 then drop that spine whenever `baselineSearch()` has the same hash as the current inputs. `baselineSearch()` is the newest search outside NON_BASELINE, so it skips the auth_failed row.

A reachable path:

1. Auto search A ends `failed` (inputs h1). A is the baseline.
2. The token is revoked on the Discogs side. The app does not know yet, so `discogsReady()` is still true.
3. The owner clicks Retry search. This creates search B (`again`, h1). Discogs answers 401, and B ends `auth_failed`.
4. The owner reconnects. The backfill selects the spine (latest is `auth_failed`), but the baseline A has hash h1, which equals the current inputs, so nothing is queued.
5. The read model's `effectiveSearch` only falls back to the baseline for `UNSEARCHED_STATUSES`. So `searchStateOf` still returns `failed` with `{ kind: 'auth' }`.

The notice line now permanently reads "Search failed: Discogs rejected the connection. Reconnect Discogs in Settings." while the app is connected. Reconnecting again changes nothing. Only the Retry button recovers the spine.

This is the same "the UI promises a remedy the system never performs" defect that 03-14 closed for not_connected/skipped. The shared rule's doc comment asserts an invariant the code does not hold.

**Fix:** Pick one of the two rules and make both the read model and the backfill follow it.

(a) Make the connect backfill actually re-pick auth_failed. When `includeAuthFailed` is set and the latest search is auth_failed, bypass the baseline-hash short-circuit. The dedupe key must also differ from the baseline's, for example by keying on the auth_failed search id:

```ts
// enqueueMissingSearches: due check
const due = rows.some((s) =>
  (opts.includeAuthFailed && latestStatus(db, s.id) === 'auth_failed') ||
  baselineSearch(db, s.id)?.input_hash !== inputHash(loadSpineInputs(db, s.id)),
);
// enqueueAutoSearch(db, spineId, { force: true }) when the latest is auth_failed,
// dedupeKey: `search:auto:${spineId}:${hash}:${latest.id}`
```

or (b) once connected, let `effectiveSearch` show the baseline's outcome over an auth_failed latest search, the same way it does for UNSEARCHED_STATUSES. Then fix the `store.ts:53-56` comment so it says what actually happens.

Add a row to the invariant table in `discogs-matches.test.ts` covering `failed(current), auth_failed(current)` followed by a connect.

## Warnings

### WR-01: A not-searched card can show "Fields changed" and "Search again" while it also says the spine is waiting its turn

**File:** `src/components/discogs-matches.tsx:99-112,196-199,212-222`; `src/server/discogs/queries.ts:381`
**Issue:**

Take a spine whose latest search is skipped or not_connected, with a baseline on other inputs. The test table row `no_match(other), skipped(other2)` is this case. The read model gives `state: 'not_searched'` and `fieldsChanged: true` (because `fieldsChangedSince` compares against the baseline). The card then shows three signals at once:

- the notice line "Fields changed since last search."
- the header button "Search again" (`matchesAction` returns `'again'`)
- the body line "Not looked up yet. It's waiting its turn…"

The maintenance hook auto-queues this spine within one lease tick, about 5 s. If the owner clicks Search again after that tick, `enqueueExplicitSearch` returns `busy` and the card shows "Couldn't start the search: …". The two messages contradict each other, and the button races the hook.

The table row does not pin `action`, so this case is untested.

**Fix:** When the card state is `not_searched`, the auto search is imminent, so do not offer the "fields changed" notice or the `again` action. In `matchesAction`, return `null` for `d.state === 'not_searched'`, and make `NoticeLine` skip `FIELDS_CHANGED_LINE` in that state. Alternatively, have `discogsForSpines` report `fieldsChanged: false` when the effective search is unsearched. Then add `action: null` to the `no_match(other), skipped(other2)` row.

## Info

### IN-01: `latestAutoSearch` is dead production code whose doc names it the baseline

**File:** `src/server/discogs/store.ts:234-247`
**Issue:** Only `store.test.ts` calls it. Its doc says "(the D-08 / D-14 baseline)", but it does not apply `NON_BASELINE_STATUSES`. That contradicts the "one shared rule" claim in this same file. Any future caller that trusts the doc would bring CR-01 back.
**Fix:** Delete it along with its test. Otherwise, rename it to `latestAutoOrAgainSearch` and remove "baseline" from the comment.

### IN-02: The invariant test's "waiting line" half is a tautology

**File:** `src/components/discogs-matches.test.ts:280-284`
**Issue:** `notSearchedLine({ state: 'active', mediaKind: 'cd' }, true) === NOT_SEARCHED_LINE` is a constant `true`, so `waitingLine` reduces to `card.state === 'not_searched'`. The table never feeds the fixture spine's real `state`/`mediaKind` into `notSearchedLine`, and it has no orphaned or non-CD rows. So the claim "waiting its turn exactly when the hook will queue it" is only checked for active CD spines.
**Fix:** Build the argument from the spine's DTO (for example `getSpineDto(s0)`). Add rows for an orphaned spine and an unsure-media spine, both of which should expect `queues: false` and no waiting line.

### IN-03: The unsearched membership check and the status lists in doc comments are repeated by hand

**File:** `src/server/discogs/queries.ts:167-170,199-201`; `src/server/discogs/enqueue.ts:36-38,57-59`; `src/server/discogs/queries.ts:143-145`
**Issue:** The check `(UNSEARCHED_STATUSES as readonly SearchStatus[]).includes(...)` is written out twice. Three doc comments still spell out "not_connected, auth_failed or skipped" by hand. If the shared rule changes, these comments will silently drift from it.
**Fix:** Export `isUnsearched(status)` from `store.ts` and use it in both places. In the comments, refer to `NON_BASELINE_STATUSES` instead of listing the values.

### IN-04: Test helpers are duplicated across the two new test suites

**File:** `src/server/discogs/reactivated-spine.test.ts:35-71`; `src/components/discogs-matches.test.ts:88-121`
**Issue:** `useTempSecrets` and `connect` are copied with small differences: only one of them saves and restores `DISCOGS_API_BASE`. They will drift apart.
**Fix:** Move both into `test/helpers/` next to `useTempDataDir`.

---

_Reviewed: 2026-10-22T00:26:43Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
