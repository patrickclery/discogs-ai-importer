---
phase: 03-discogs-match
verified: 2026-10-22T00:35:00Z
status: gaps_found
score: 4/5 must-haves verified
covered_files: [".planning/phases/03-discogs-match/03-01-PLAN.md", ".planning/phases/03-discogs-match/03-01-SUMMARY.md", ".planning/phases/03-discogs-match/03-02-PLAN.md", ".planning/phases/03-discogs-match/03-02-SUMMARY.md", ".planning/phases/03-discogs-match/03-03-PLAN.md", ".planning/phases/03-discogs-match/03-03-SUMMARY.md", ".planning/phases/03-discogs-match/03-04-PLAN.md", ".planning/phases/03-discogs-match/03-04-SUMMARY.md", ".planning/phases/03-discogs-match/03-05-PLAN.md", ".planning/phases/03-discogs-match/03-05-SUMMARY.md", ".planning/phases/03-discogs-match/03-06-PLAN.md", ".planning/phases/03-discogs-match/03-06-SUMMARY.md", ".planning/phases/03-discogs-match/03-07-PLAN.md", ".planning/phases/03-discogs-match/03-07-SUMMARY.md", ".planning/phases/03-discogs-match/03-08-PLAN.md", ".planning/phases/03-discogs-match/03-08-SUMMARY.md", ".planning/phases/03-discogs-match/03-09-PLAN.md", ".planning/phases/03-discogs-match/03-09-SUMMARY.md", ".planning/phases/03-discogs-match/03-10-PLAN.md", ".planning/phases/03-discogs-match/03-10-SUMMARY.md", ".planning/phases/03-discogs-match/03-11-PLAN.md", ".planning/phases/03-discogs-match/03-11-SUMMARY.md", ".planning/phases/03-discogs-match/03-12-PLAN.md", ".planning/phases/03-discogs-match/03-12-SUMMARY.md", ".planning/phases/03-discogs-match/03-13-PLAN.md", ".planning/phases/03-discogs-match/03-13-SUMMARY.md", ".planning/phases/03-discogs-match/03-14-PLAN.md", ".planning/phases/03-discogs-match/03-14-SUMMARY.md", "src/app/api/discogs/callback/route.ts", "src/app/api/discogs/connect/route.ts", "src/app/api/discogs/test/route.ts", "src/app/api/spines/[id]/candidates/route.ts", "src/app/api/spines/[id]/search/route.ts", "src/components/candidate-row.tsx", "src/components/discogs-card.tsx", "src/components/discogs-matches.test.ts", "src/components/discogs-matches.tsx", "src/components/discogs-not-connected-alert.tsx", "src/components/discogs-search-dialog.tsx", "src/lib/candidate-format.ts", "src/lib/discogs-ref.ts", "src/server/discogs/auth.ts", "src/server/discogs/client.ts", "src/server/discogs/connect.ts", "src/server/discogs/enqueue.ts", "src/server/discogs/gate.ts", "src/server/discogs/oauth.ts", "src/server/discogs/queries.ts", "src/server/discogs/reactivated-spine.test.ts", "src/server/discogs/search.ts", "src/server/discogs/store.ts", "src/server/discogs/thumbs.ts", "src/server/jobs/handlers/fetch-release.ts", "src/server/jobs/handlers/index.ts", "src/server/jobs/handlers/search-spine.ts", "src/server/jobs/worker.ts", "src/server/scan/orphans.ts", "src/server/scan/store.ts"]
covered_digest: "v3:sha256:65655fca44d54ad21044023c050e66f1cb1e78dec8858a6f7389a01a2ae4941d"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Re-activated spine whose auto search ended skipped while orphaned (old CR-01): re-attach then maintenance hook queues a new auto search; re-scan merge queues one in the same transaction; a covered baseline shows its real outcome instead of 'waiting its turn'"
  gaps_remaining:
    - "Once a photo's spines are extracted, each music spine gets candidate releases automatically (ROADMAP SC2 / DISC-03), now via the auth_failed reconnect path (new CR-01)"
  regressions: []
gaps:
  - truth: "Once a photo's spines are extracted, each music spine gets candidate releases automatically (ROADMAP SC2 / DISC-03); finishing a connect backfills every active CD spine whose latest search ended auth_failed (03-07 must-have)"
    status: partial
    reason: "New CR-01 from 03-REVIEW.md is confirmed in code and by a probe run. If a spine's baseline search already covers its current inputs (typically: the auto search ended failed and the owner pressed Retry while the token was revoked, so the Retry ended auth_failed), then reconnecting does not re-search it. The connect backfill selects the spine, but the `due` precheck and enqueueAutoSearch drop it because baselineSearch() skips the auth_failed row and finds the covering baseline. effectiveSearch only falls back for UNSEARCHED_STATUSES, so the card keeps saying 'Search failed: Discogs rejected the connection. Reconnect Discogs in Settings.' while the app is connected. That breaks the 03-07 truth and the alert's promise ('Reconnect … and the CDs here are looked up again'), and the card state is not truthful (D-11). The Retry search button is still offered and works, so the spine can be recovered by hand."
    artifacts:
      - path: "src/server/discogs/enqueue.ts"
        issue: "Lines 157-161 (`due` precheck) and line 70 (enqueueAutoSearch) short-circuit when the baseline hash equals the current inputs, even when the latest search is auth_failed and includeAuthFailed is set"
      - path: "src/server/discogs/queries.ts"
        issue: "effectiveSearch (lines ~163-183) falls back to the baseline only for UNSEARCHED_STATUSES, so a connected spine with a latest auth_failed search reads failed/auth"
      - path: "src/server/discogs/store.ts"
        issue: "Lines 53-56 doc comment says auth_failed 'is only re-picked by a connect', which the code does not do in this case"
    missing:
      - "Pick one rule. Either (a) when includeAuthFailed is set and the latest search is auth_failed, bypass the baseline-hash short-circuit and use a dedupe key that differs from the baseline's (e.g. include the auth_failed search id), or (b) once connected, let effectiveSearch show the baseline's outcome over an auth_failed latest search. Then fix the store.ts comment to match."
      - "A regression test: failed (h1), then a Retry that ends auth_failed (h1), then a reconnect (completeConnect backfill, and the Test connection path from WR-04). The test must show the card no longer says Reconnect and that a search is queued (rule a) or the baseline's state is shown (rule b)"
      - "Recommended in the same change: WR-01. A not_searched card should not offer 'Fields changed' / 'Search again' together with 'waiting its turn'"
---

# Phase 3: Discogs Match Verification Report

**Phase Goal:** User connects their Discogs account and, for each music spine, sees candidate releases they can recognize. Manual search and paste-ID cover the cases auto-search misses, and every request respects the rate limit.
**Verified:** 2026-10-22T00:35:00Z
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plan 03-14

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User completes the Discogs OAuth 1.0a flow from the app and sees the connected username | VERIFIED (regression check) | connect/callback/finish/test routes are present. `connect.ts:120-126` saves the auth and then backfills. No changes since the last pass. |
| 2 | Each music spine gets candidates automatically (catno → artist+title+format → free text) and each candidate shows cover, year, country, label, catno, format | FAILED (partial) | The old CR-01 is **closed**. `search-spine.ts:136-141` releases the key on an orphan skip. The baseline excludes skipped, the selector uses `UNSEARCHED_STATUSES_SQL`, and `effectiveSearch` covers the baseline case. `reactivated-spine.test.ts` drives the real handler, Re-attach, re-scan and the `maintenance` array, and passes. **New CR-01 is confirmed:** a probe run (below) shows an auth_failed Retry over a covering baseline is not re-searched after reconnect. The card stays `failed/auth` ("Reconnect Discogs in Settings") while connected. See Gaps. |
| 3 | Large batches never lose work to rate limiting; requests are paced and a 429 backs off and resumes on its own | VERIFIED (regression check) | The only `api.discogs.com` base is in `config.ts`. Every `discogsFetch` goes through `gate.acquire` (`client.ts:206`). The callers are search-spine, fetch-release, connect and the test route. Tests pass. |
| 4 | After editing a spine's fields, user can re-run its search and see updated candidates | VERIFIED (regression check) | `matchesAction` → 'again' → `/api/spines/{id}/search` → `enqueueExplicitSearch`. Tests pass. WR-01 (below) is a copy and race wart, not a break. |
| 5 | For any spine, user can run a manual Discogs search or paste a release URL/ID and get that release as a candidate | VERIFIED (regression check) | `DiscogsSearchDialog` is mounted at `discogs-matches.tsx:307`, and the candidates/search routes are present. Tests pass. |

**Score:** 4/5 truths verified (0 present, behavior-unverified)

### 03-14 Plan Must-Haves

| Truth | Status | Evidence |
|-------|--------|----------|
| Re-attach path: skipped, key released, maintenance queues exactly one search that runs to candidates | VERIFIED | `reactivated-spine.test.ts` "CR-01: queued auto search, orphaned, skipped, re-attached…" passes |
| Re-scan path in the same `persistRunResult` transaction | VERIFIED | Test "an orphan found again by a later re-scan…" passes |
| Skipped/not_connected latest over a covering baseline shows the baseline's outcome, and the hook queues nothing | VERIFIED | `effectiveSearch` plus the test "a re-activated spine whose baseline already searched…" |
| "Waiting its turn" iff the hook queues (active connected CD) | VERIFIED | Invariant table in `discogs-matches.test.ts`. IN-02: its waiting half is tautological for non-CD/orphaned rows, but `notSearchedLine` handles those by construction |
| One shared status rule in `store.ts`; no literal unsearched lists in enqueue/queries | VERIFIED | `UNSEARCHED_STATUSES` / `NON_BASELINE_STATUSES` / `statusListSql`. The remaining `'auth_failed'` literals are single statuses, not the shared list. **But** the rule's doc claim about auth_failed is false (new CR-01) |
| Same-ms ULID ordering; whitespace-only counts as covered; empty → not searched; Re-attach before run → done | VERIFIED | Covered by the passing tests |
| Backstop: re-attach on the Spines page shows Queued → Searching → result | insufficient_spec | Human item 8 |

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| 03-01: no writes to the owner's Discogs account | test | VERIFIED (`isAllowed()` allowlist test). The owner's live collection check is still open |
| 03-11: no pasted release added without being shown and picked | test | VERIFIED (candidates POST requires stored results) |
| 03-04: no technical words in on-screen copy | judgment | Non-authoritative pass. **unverified-prohibition, human review recommended** |
| 03-08: no preselect/auto-confirm | judgment | Non-authoritative pass. **unverified-prohibition, human review recommended** |
| 03-14: no "waiting its turn" on a spine never looked up automatically | judgment | Non-authoritative pass. In the WR-01 case the hook does queue the spine. **unverified-prohibition, human review recommended** |
| 03-14: maintenance hook never re-queues failed/auth_failed or covered spines | judgment | Non-authoritative pass. The selector passes `includeAuthFailed: false` (`handlers/index.ts:39`) and the precheck skips covered spines |
| 03-14: no auto search for non-active spines | judgment | Non-authoritative pass. The selector requires `s.state = 'active'` |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/server/discogs/reactivated-spine.test.ts` | VERIFIED | 4 end-to-end tests that use the real `maintenance` array |
| `src/server/discogs/{store,queries,enqueue}.ts` | VERIFIED (new CR-01 defect) | Shared rule wired. The auth_failed path is wrong |
| `src/components/discogs-matches.tsx` (`notSearchedLine`) | VERIFIED | Used by the Body not_searched branch |
| Earlier-phase artifacts (client, gate, oauth, connect, handlers, thumbs, components) | VERIFIED (regression) | Present and wired |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| Re-attach (`orphans.ts`) → maintenance → auto search | WIRED (old CR-01 closed) |
| `completeConnect` / Test connection → `enqueueMissingSearches({includeAuthFailed:true})` → auth_failed spine with a covering baseline | NOT WIRED (new CR-01) |
| `persistRunResult` → `enqueueAutoSearchesForPhoto` | WIRED (`scan/store.ts:218`) |
| Card → `DiscogsSearchDialog` | WIRED (`discogs-matches.tsx:307`) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (run once) | `npx vitest run` | 64 files, 956/956 passed | PASS |
| New CR-01 reproduction | scratch probe `/tmp/claude-1000/-home-patrick-github-com-patrickclery-discogs-ai-importer/edb6cd98-3b01-47d2-b234-1ee9db554b7b/scratchpad/probe/probe.test.ts` (auto search → no_match h1; `again` → 401 → auth_failed; clearAuthInvalid + saveDiscogsAuth + `enqueueMissingSearches({includeAuthFailed:true})`; then maintenance) | backfill created 4 jobs for other spines, **none for s0**; card `{"state":"failed","failure":{"kind":"auth"},"action":"retry"}` before and after maintenance | FAIL (gap confirmed) |
| Debt markers in the 6 files touched by 03-14 | grep TBD/FIXME/XXX/TODO/HACK | none | PASS |

### Requirements Coverage

| Req | Plans | Status | Evidence |
|-----|-------|--------|----------|
| DISC-01 | 03-01, 02, 04, 13 | SATISFIED | SC1 |
| DISC-02 | 03-01, 03, 05, 06, 13 | SATISFIED | SC3 |
| DISC-03 | 03-03, 07, 08, 09, 13, 14 | PARTIAL | SC2. The old gap is closed and the new CR-01 is open. REQUIREMENTS.md marks DISC-03 `[x] Complete`, which is premature |
| DISC-04 | 03-06, 08, 09, 13 | SATISFIED | Owner has not yet confirmed covers on screen (human item 1) |
| DISC-05 | 03-10 | SATISFIED | SC4 |
| DISC-06 | 03-11, 12 | SATISFIED | SC5 |

No orphaned requirements.

### Anti-Patterns / Review Findings

| Finding | Severity | Impact on goal |
|---------|----------|----------------|
| CR-01 (new) auth_failed over a covering baseline is never re-picked on reconnect, and the card says "Reconnect Discogs" while connected | BLOCKER | Breaks the 03-07 connect-backfill truth and truthful state. Narrower than the old CR-01: the Retry button is shown and works |
| WR-01 a not_searched card can show "Fields changed", "Search again" and "waiting its turn" at once; clicking after the hook tick gives a "busy" error | Warning | Confusing copy and a race. The spine is still auto-searched within about 5 s |
| IN-01 to IN-04 (dead `latestAutoSearch`, tautological test half, hand-copied status lists, duplicated helpers) | Info | None |

## Human Verification Required

These are still needed after the gap is fixed. The app runs at http://127.0.0.1:3001.

1. **Covers show on the match cards.** Each match should show a small cover picture, and a match with no cover should show a grey disc icon, never a broken image.
2. **Nothing was added to your Discogs collection.** Your collection count on discogs.com should be the same as before you connected.
3. **Show all.** On a spine with more than 3 matches, click "Show all" and then "Show fewer".
4. **Live updates and the slowdown countdown.** Press Search again. The badge should go from Queued to Searching to a result with no page reload, and the top bar should count down.
5. **Search Discogs… dialog.** Type a search, pick a result and add it. Paste a release link, which should show the release first. Paste a master link, which should ask you to pick a version.
6. **Narrow window.** In the narrowest window, nothing should be cut off.
7. **Plain wording.** Note any technical words on screen.
8. **Re-attach a "No longer detected" spine.** Reload after about 10 seconds. It should show Queued, then Searching, then matches or "Discogs found nothing", and never stay on "waiting its turn".

## Gaps Summary

Plan 03-14 did what it set out to do. Re-activated spines are now searched again or show their real last result, the shared status rule exists, and all 956 tests pass. The phase still misses "each music spine" by one reachable path in the same family. Take a spine whose last real search already covered its inputs (usually a failed search), where the owner presses Retry while the Discogs token is revoked. After a successful reconnect, nothing re-searches it. The card keeps telling the owner to reconnect, which contradicts the 03-07 connect-backfill truth and the app's own "reconnect and the CDs here are looked up again" message. The Retry button still recovers the spine by hand. The fix is to choose one rule (bypass the baseline short-circuit for an auth_failed latest search during a connect, or show the baseline over auth_failed once connected) and add a regression test. Fix WR-01 alongside it.

---

_Verified: 2026-10-22T00:35:00Z_
_Verifier: Claude (gsd-verifier)_
