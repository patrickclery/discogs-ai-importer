---
phase: 03-discogs-match
verified: 2026-10-21T18:40:00Z
status: gaps_found
score: 4/5 must-haves verified
covered_files: [".planning/phases/03-discogs-match/03-01-PLAN.md", ".planning/phases/03-discogs-match/03-01-SUMMARY.md", ".planning/phases/03-discogs-match/03-02-PLAN.md", ".planning/phases/03-discogs-match/03-02-SUMMARY.md", ".planning/phases/03-discogs-match/03-03-PLAN.md", ".planning/phases/03-discogs-match/03-03-SUMMARY.md", ".planning/phases/03-discogs-match/03-04-PLAN.md", ".planning/phases/03-discogs-match/03-04-SUMMARY.md", ".planning/phases/03-discogs-match/03-05-PLAN.md", ".planning/phases/03-discogs-match/03-05-SUMMARY.md", ".planning/phases/03-discogs-match/03-06-PLAN.md", ".planning/phases/03-discogs-match/03-06-SUMMARY.md", ".planning/phases/03-discogs-match/03-07-PLAN.md", ".planning/phases/03-discogs-match/03-07-SUMMARY.md", ".planning/phases/03-discogs-match/03-08-PLAN.md", ".planning/phases/03-discogs-match/03-08-SUMMARY.md", ".planning/phases/03-discogs-match/03-09-PLAN.md", ".planning/phases/03-discogs-match/03-09-SUMMARY.md", ".planning/phases/03-discogs-match/03-10-PLAN.md", ".planning/phases/03-discogs-match/03-10-SUMMARY.md", ".planning/phases/03-discogs-match/03-11-PLAN.md", ".planning/phases/03-discogs-match/03-11-SUMMARY.md", ".planning/phases/03-discogs-match/03-12-PLAN.md", ".planning/phases/03-discogs-match/03-12-SUMMARY.md", ".planning/phases/03-discogs-match/03-13-PLAN.md", ".planning/phases/03-discogs-match/03-13-SUMMARY.md", "src/app/api/discogs/callback/route.ts", "src/app/api/discogs/connect/route.ts", "src/app/api/discogs/test/route.ts", "src/app/api/spines/[id]/candidates/route.ts", "src/app/api/spines/[id]/search/route.ts", "src/components/candidate-row.tsx", "src/components/discogs-card.tsx", "src/components/discogs-matches.tsx", "src/components/discogs-search-dialog.tsx", "src/lib/candidate-format.ts", "src/lib/discogs-ref.ts", "src/server/discogs/auth.ts", "src/server/discogs/client.ts", "src/server/discogs/connect.ts", "src/server/discogs/enqueue.ts", "src/server/discogs/gate.ts", "src/server/discogs/oauth.ts", "src/server/discogs/queries.ts", "src/server/discogs/search.ts", "src/server/discogs/store.ts", "src/server/discogs/thumbs.ts", "src/server/jobs/handlers/fetch-release.ts", "src/server/jobs/handlers/index.ts", "src/server/jobs/handlers/search-spine.ts", "src/server/jobs/worker.ts", "src/server/scan/orphans.ts", "src/server/scan/store.ts"]
covered_digest: "v3:sha256:42018877278e5d37e14e2424731739da1804d37b63bcab8f690e5b7b6c1dba40"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Once a photo's spines are extracted, each music spine gets candidate releases automatically (ROADMAP SC2 / DISC-03)"
    status: partial
    reason: "CR-01 (open, critical) confirmed in code. An auto search that ran while its spine was orphaned finishes `skipped` without releasing its dedupe key. When the spine becomes active again (Re-attach, or a later re-scan merge), nothing ever searches it automatically again: baselineHash() counts the skipped row as the baseline, the search:auto:{spine}:{hash} key is still held, and enqueueMissingSearches() only picks spines with no search or a not_connected/auth_failed latest search. The card shows 'Not looked up yet. It's waiting its turn…', which is false, and offers neither Search again nor Retry (matchesAction returns null for state not_searched with fieldsChanged false). Only the manual Search Discogs… dialog reaches it."
    artifacts:
      - path: "src/server/jobs/handlers/search-spine.ts"
        issue: "Lines 132-139: finish('skipped') without releaseDedupeKey(ctx.job.id)"
      - path: "src/server/discogs/enqueue.ts"
        issue: "baselineHash (line 43) does not exclude 'skipped'; enqueueMissingSearches (lines 136-137) does not select a 'skipped' latest search"
      - path: "src/components/discogs-matches.tsx"
        issue: "Renders NOT_SEARCHED_LINE ('waiting its turn') for a skipped search that will never be queued"
    missing:
      - "Release the dedupe key when an auto search finishes skipped"
      - "Exclude 'skipped' from baselineHash and include it in the enqueueMissingSearches selector, so the connect backfill and the lease-tick safety net pick the spine up"
      - "A regression test: auto search queued, spine orphaned, job runs (skipped), spine re-attached, then the maintenance hook enqueues a new auto search"
      - "Recommended in the same change (same root cause, WR-01): one shared 'baseline search' rule for baselineHash, fieldsChangedSince and the backfill selector"
---

# Phase 3: Discogs Match Verification Report

**Phase Goal:** User connects their Discogs account and, for each music spine, sees candidate releases they can recognize. Manual search and paste-ID cover the cases auto-search misses, and every request respects the rate limit.
**Verified:** 2026-10-21T18:40:00Z
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User completes the Discogs OAuth 1.0a flow from the app and sees the connected username | VERIFIED | `connect.ts` request token → authorize → `POST /oauth/access_token` → `GET /oauth/identity` → `saveDiscogsAuth`. Callback, finish (pasted code) and connect routes exist. `discogs-card.tsx` renders "Connected as {username}" from `getDiscogsConnection()` in `settings/page.tsx`. `connect.test.ts` passes. Live: `report-discogs-live.ts` recorded `discogs_connect_via: callback` and `exchange_form: standard` for patrickclery. |
| 2 | Each music spine gets candidates automatically (catno → artist+title+format → free text); each candidate shows cover, year, country, label, catno, format | FAILED (partial) | Main path works. `scan/store.ts:218` enqueues inside `persistRunResult`. `connect.ts:126` and the maintenance hook backfill. The cascade in `search.ts` is tested ("stops at catno…", "falls through to text…"). `candidate-row.tsx` + `detailsLine()` render the cover and all five details. Live run: 237/237 searched, 200 with candidates. **But CR-01:** a spine whose auto search ended `skipped` while orphaned is never auto-searched again once it is active, and its card falsely says it is waiting its turn. See Gaps. |
| 3 | Large batches never lose work to rate limiting; requests are paced, and a 429 backs off and resumes on its own | VERIFIED | Every Discogs API call goes through `discogsFetch` → `gate.acquire()` (grep: 6 call sites, no other api.discogs.com fetch). A 429 pauses the gate and the handler throws `JobDeferredError`. The worker's `deferJob` restores attempts. `laneGates.discogs` blocks claims while paused. Tests pass: worker.test "JobDeferredError … attempts unchanged", search-spine.test "a 429 throws JobDeferredError…", and client.test 429 pauses (60 s default, Retry-After). Live: about 50/min, 0 failures, no 429 (A3 not observed live). WR-02 noted below. |
| 4 | After editing a spine's fields, user can re-run its search and see updated candidates | VERIFIED | `fieldsChangedSince` → `matchesAction` 'again' → `POST /api/spines/{id}/search {mode:'again'}` → `enqueueExplicitSearch` (job key `search:{searchId}`) → `replaceAutoCandidates`. The search route tests pass (415/400/404/409 and the busy guard). Edge disagreement in WR-01 noted below. |
| 5 | For any spine, user can run a manual Discogs search or paste a release URL/ID and get that release as a candidate | VERIFIED | `discogs-search-dialog.tsx` is mounted from `discogs-matches.tsx:285`. Text goes to the `search_spine` manual branch (25 per page) and a ref goes to `fetch_release`. `parseDiscogsRef` refuses masters on the client and the server (400). `POST /api/spines/{id}/candidates` copies only from stored results. The discogs-ref, fetch-release and candidates route tests pass. |

**Score:** 4/5 truths verified (0 present, behavior-unverified)

Plan-level truths (about 120 across 13 plans) were spot-checked against the files above. No other contradictions were found beyond the review findings listed here.

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| 03-01: MUST NOT write to the owner's Discogs account (GET only, plus the access-token POST) | test | VERIFIED. `isAllowed()` in `client.ts` is enforced before fetch, and the client.test "read-only allowlist" block passes. Owner's live collection-count check is still open (see Human Verification). |
| 03-11: MUST NOT add a pasted release without showing it and getting the owner's pick | test | VERIFIED. `fetch_release` writes only `results_json`. The candidates POST requires a finished search of the same spine plus a releaseId found in its stored results, and route tests cover 404/409/400. |
| 03-04: No "token / OAuth / verifier / queue / job / lane / 429 / rate limit" in on-screen copy | judgment | Non-authoritative pass: a grep of the Discogs components and copy libs found no hits. **unverified-prohibition, human review recommended.** One concern: failed-search reasons can echo text like "Discogs GET /database/search answered 422". |
| 03-08: MUST NOT preselect or auto-confirm a candidate | judgment | Non-authoritative pass: `CandidateRow` has no select or confirm control, and the dialog rows start unselected. **unverified-prohibition, human review recommended.** |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/server/discogs/{client,gate,oauth,connect,auth}.ts` | VERIFIED | Substantive and wired to the routes and handlers |
| `src/server/discogs/{enqueue,search,store,queries}.ts` | VERIFIED (with CR-01 defect) | Wired from scan/store, connect and maintenance |
| `src/server/jobs/handlers/{search-spine,fetch-release}.ts` | VERIFIED | Registered in `handlers/index.ts` |
| `src/server/discogs/thumbs.ts` + `/api/discogs/thumb/[id]` | VERIFIED | i.discogs.com allowlist, no redirects, 4 concurrent downloads. 22 covers cached in `data/discogs-thumbs` |
| `src/components/{discogs-card,discogs-matches,candidate-row,discogs-search-dialog}.tsx` | VERIFIED | Mounted in `settings/page.tsx` and `photo-section.tsx` |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `persistRunResult` | `enqueueAutoSearchesForPhoto` | WIRED (`scan/store.ts:218`) |
| `completeConnect` | `enqueueMissingSearches({includeAuthFailed:true})` | WIRED (`connect.ts:126`) |
| lease tick | `enqueueMissingSearches({includeAuthFailed:false})` | WIRED (`handlers/index.ts:39`) |
| Re-attach (`orphans.ts`) | auto search | NOT WIRED for a `skipped` latest search (CR-01) |
| `/spines` DTO | `discogsForSpines` + `discogsConnection` | WIRED (`scan/queries.ts:311,328`) |
| Search dialog | `/api/spines/{id}/search`, `/api/discogs/searches/{id}`, `/api/spines/{id}/candidates` | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Status |
|----------|------|--------|--------|
| Spine card matches | candidates | `discogs_candidates`, written by `replaceAutoCandidates` from real `/database/search` | FLOWING (live: 1355 candidates) |
| Settings "Connected as" | username | `secrets.json`, written from `/oauth/identity` | FLOWING |
| Header Discogs backlog | backlog/pausedUntil | `discogsStatus()` jobs query + gate | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Gate, client, enqueue, handlers, ref parser, connect, format, worker, search and candidates routes | `npx vitest run` on 11 named files | 11 files, 214 tests passed | PASS |
| Debt markers in 110 phase-touched files | grep TBD/FIXME/XXX | none | PASS |

### Requirements Coverage

| Req | Plans | Status | Evidence |
|-----|-------|--------|----------|
| DISC-01 | 03-01, 02, 04, 13 | SATISFIED | SC1 |
| DISC-02 | 03-01, 03, 05, 06, 13 | SATISFIED | SC3 (WR-02 warning) |
| DISC-03 | 03-03, 07, 08, 09, 13 | PARTIAL | SC2. CR-01 leaves some spines never auto-searched. REQUIREMENTS.md already marks this Complete, which is premature. |
| DISC-04 | 03-06, 08, 09, 13 | SATISFIED | Candidate details plus cover cache. On-screen covers not yet confirmed by the owner. |
| DISC-05 | 03-10 | SATISFIED | SC4 |
| DISC-06 | 03-11, 12 | SATISFIED | SC5 |

No orphaned requirements: all six IDs mapped to Phase 3 are claimed by at least one plan.

### Anti-Patterns / Review Findings

| Finding | Severity | Impact on goal |
|---------|----------|----------------|
| CR-01 skipped spine never re-searched, UI says "waiting its turn" | BLOCKER | Breaks "each music spine" in SC2 for spines orphaned during a backlog and then re-activated |
| WR-01 three baseline rules + permanent auto dedupe key | Warning | Same root cause. Rare stuck spine, a write lock on every lease tick, stale candidates with no "Fields changed" hint |
| WR-02 pause can time out a running search (Retry-After > ~85 s from a route-originated 429) | Warning | Spends one attempt. The lane gate then holds the retry until the pause ends, so a search failing outright needs three such hits. SC3 holds |
| WR-03 new consumer key keeps the old token | Warning | Leads to a 401 and Reconnect needed. Recoverable |
| WR-04 a passing Test connection leaves auth_failed spines failed | Warning | Owner must press Retry on each card |
| WR-05 /spines shows "connected" while Reconnect is needed | Warning | Confusing 409 copy. Recoverable |

### Human Verification Required

Still needed after the gap is fixed. The app runs at http://127.0.0.1:3001.

1. **Covers show on the match cards.** Open the Spines page and scroll through a few photos. Each match should show a small cover picture, and a match with no cover should show a grey disc icon, never a broken image.
2. **Nothing was added to your Discogs collection.** On discogs.com, check that your collection count is the same as before you connected the app.
3. **Show all.** On a spine with more than 3 matches, click "Show all". The extra matches should appear, and "Show fewer" should fold them back.
4. **Live updates and the slowdown countdown.** Start Search again on a spine. The badge should change from Queued to Searching to a result without a page reload, and the top bar should count Discogs lookups down. If Discogs ever asks the app to slow down, a seconds countdown should appear and then disappear.
5. **Search Discogs… dialog.** On any spine, open "Search Discogs…", type an artist and title, and press Search. Results should appear with covers, and the list should scroll while the search box and buttons stay visible. Pick one, click "Add to candidates", and it should appear first on the card marked "Added manually". Then paste a Discogs release link and check that the release is shown before you can add it. Paste a master link and check that you get a message telling you to pick a specific version.
6. **Narrow window.** Make the browser window as narrow as it goes. The settings Discogs card, the match rows and the card buttons should stay inside their boxes with nothing cut off.
7. **Plain wording.** While doing the above, note any on-screen text that uses technical words (token, OAuth, queue, job, 429, rate limit).

### Gaps Summary

The phase delivers connect, a paced and rate-limit-safe search lane, automatic candidates with full details, re-search after edits, and manual search plus paste-ID. The live run of 237 spines had zero failures. One defect breaks the "each music spine" promise. A spine whose queued auto search ran while the spine was orphaned ends `skipped`, and once re-activated it is never looked up again, while its card says it is waiting its turn. The fix is small (release the key, treat `skipped` like `not_connected` in the baseline and the backfill, add a regression test), and WR-01 should be fixed in the same change because it shares the root cause. WR-02 to WR-05 are recoverable robustness warnings and do not block the goal.

---

_Verified: 2026-10-21T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
