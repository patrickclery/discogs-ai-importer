---
phase: 03-discogs-match
plan: 13
subsystem: discogs
tags: [discogs, oauth, live-run, rate-limit, covers, report]
status: complete

requires:
  - phase: 03-discogs-match
    provides: "03-01 completeConnect (discogs_connect_via, discogs_exchange_form); 03-05 paced search_spine and 429 deferral; 03-06 ensureThumb cover cache; 03-07 connect backfill; 03-12 manual search"
provides:
  - "scripts/report-discogs-live.ts: read-only report of the live Discogs run (connect path, exchange form, searches by kind/status, cover coverage, discogs-lane jobs, deferrals, failures)"
  - "Live answers for RESEARCH A1, A2 and A5 on the owner's real Discogs account; A3 not exercised (no 429 occurred)"
affects: [03-verification, 04]

actuals:
  tokens: 1500
  tasks: 3
  commits: 1
plan_head_before: 563588a8884ac396a767948d16a6f42e1cdecfb4
plan_head_after: 4d26cb45d43110e3f32d10a82133267112e305bd

tech-stack:
  added: []
  patterns:
    - "Live-run evidence comes from a read-only DB report (readonly + fileMustExist), never from calling Discogs or reading secrets"

key-files:
  created:
    - scripts/report-discogs-live.ts
  modified: []

key-decisions:
  - "A1 settled: Discogs honours the per-request oauth_callback (http://127.0.0.1:3001/api/discogs/callback); the pasted-code fallback was not needed"
  - "A2 settled: the standard PLAINTEXT exchange form consumer_secret&request_token_secret is accepted; the docs-literal fallback was not used"
  - "A5 settled by data: 97.1% of real candidates carry a cover link and covers download into the local cache"

requirements-completed: [DISC-01, DISC-02, DISC-03, DISC-04]

coverage:
  - id: D1
    description: "Owner connects the real Discogs account from Settings and Test connection succeeds"
    requirement: DISC-01
    verification:
      - kind: manual_procedural
        ref: "Owner screenshots: toast 'Connected to Discogs as patrickclery', Settings 'Connected as patrickclery', Test connection 'Connection works. Signed in to Discogs as patrickclery.'"
        status: pass
      - kind: other
        ref: "node scripts/report-discogs-live.ts -> discogs_connect_via: callback, discogs_exchange_form: standard"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 237 scanned CD spines are searched by themselves after connecting, paced about one per second, with no failures and no rate-limit pauses"
    requirement: DISC-02
    verification:
      - kind: other
        ref: "node scripts/report-discogs-live.ts polled 12:18-12:22 MDT: auto/done 200, auto/no_match 37, errors none, jobs succeeded 237, attempts>1 0, deferred 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real candidates carry cover pictures that the local cache stores"
    requirement: DISC-04
    verification:
      - kind: other
        ref: "report: 1316 of 1355 candidates with a cover link (97.1%); 22 cached cover files under data/discogs-thumbs"
        status: pass
    human_judgment: true
    rationale: "Data shows covers exist and were downloaded; the owner has not yet said they saw them on the Spines page"
  - id: D4
    description: "Nothing was added to the owner's Discogs collection during the run"
    verification: []
    human_judgment: true
    rationale: "Only the owner can compare the collection count on discogs.com before and after; not reported yet"

duration: 12h37m elapsed (Task 1 ~10min; the rest was the owner checkpoint and a 4-minute drain)
completed: 2026-10-21
---

# Phase 3 Plan 13: Live Discogs Run Summary

**The owner's real Discogs account connected through the automatic callback with the standard exchange signature, and all 237 CD spines were searched in about 4 minutes with zero failures and zero rate-limit pauses; 97% of candidates carry covers.**

## Performance

- **Duration:** 12h37m elapsed, mostly waiting on the owner checkpoint
- **Started:** 2026-10-21T05:45:00Z (approx., Task 1)
- **Completed:** 2026-10-21T18:22:44Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- Read-only live report (`scripts/report-discogs-live.ts`) that never opens secrets or contacts Discogs
- Owner connected `patrickclery` on port 3001 through the automatic return; Test connection passed
- The backlog of 237 spines drained at about 50 per minute with no errors, retries or 429 pauses

## Live findings

Report taken from `node scripts/report-discogs-live.ts` (read-only), polled every 60 s from 12:18 to 12:22 MDT until the queue was empty.

- **A1 (per-request callback):** settled, **honoured**. `discogs_connect_via: callback`. The owner was brought back automatically to `http://127.0.0.1:3001/api/discogs/callback` with the toast "Connected to Discogs as patrickclery. Looking up your spines now." No pasted code and no change to the Callback URL on discogs.com.
- **A2 (exchange signature form):** settled. `discogs_exchange_form: standard` (`consumer_secret&request_token_secret`). The docs-literal fallback was not needed.
- **A3 (429 without Retry-After):** **not exercised**. Deferred jobs: 0. Jobs with attempts above 1: 0. Failed jobs: none. No search failed because of rate limiting, because pacing kept every request under the limit, so the authenticated 429 shape is still unobserved.
- **A5 (covers on real search results):** settled **by data**. 1316 of 1355 candidates (97.1%) have a cover link, and 22 cover files were downloaded into `data/discogs-thumbs` once the Spines page was viewed. This is data evidence, not the owner's visual confirmation.
- **Pacing (D-05/D-06):** the backlog went 160 → 103 → 52 → 3 → 0 at one-minute samples, about 50 lookups per minute, in line with the about-54-per-minute gate.
- **Backlog (D-07/D-08):** 237 active CD spines, 237 searches, 0 with no search, 0 still queued.
- **Search results:** 200 done (with candidates) and 37 no_match. Errors by kind: none. Failed discogs jobs by reason: none.
- **Connected account:** the owner's screenshots show "Connected as patrickclery" and "Connection works. Signed in to Discogs as patrickclery." The header showed "Searching Discogs · 237 left" as the backfill started.
- **Covers seen on screen:** **unconfirmed by the owner** (not reported; not a failure).
- **Collection count before and after:** **unconfirmed by the owner** (not reported; not a failure). This phase has no add-to-collection code path. The report has no collection writes to show, but only the owner can confirm the count on discogs.com.

## Gaps for verify-work

No failures were found. These items are still open for the owner to confirm:

1. **Covers on screen (DISC-04):** ask the owner whether the match cards on the Spines page show cover pictures. Data line: `share with a cover link: 97.1%`, `cached cover files: 22`.
2. **Collection count unchanged:** ask the owner whether their discogs.com collection count is the same as before connecting. No report line covers this.
3. **37 spines with no match (15.6%):** not a defect, but worth a look in verify-work to see whether they are misreads or rare releases that need the manual search or a pasted link. Data line: `auto / no_match: 37`.
4. **A3 still unobserved live:** no authenticated 429 occurred, so the deferral path was only proven against the fake server. Data line: `jobs paused by rate limiting (deferred): 0`.

## Task Commits

1. **Task 1: Read-only report of the live run and a fresh production build** - `4d26cb4` (feat)
2. **Task 2: Owner connects the real Discogs account** - no commit (human-action checkpoint; the owner replied with screenshots)
3. **Task 3: Record live findings** - no code commit (no application or script change needed; findings are in this SUMMARY)

## Files Created/Modified

- `scripts/report-discogs-live.ts` - read-only report of the live Discogs run

## Decisions Made

None beyond recording the settled assumptions (see key-decisions).

## Deviations from Plan

None. The plan was executed exactly as written. The report did not crash on real data, so it was not touched in Task 3.

## Issues Encountered

None. The owner served the app on `127.0.0.1:3001` rather than `localhost:3001`. The callback is built from the Host header, so it followed correctly.

## User Setup Required

None. The owner's Discogs consumer key and secret were already saved, and no Callback URL change was needed on discogs.com.

## Next Phase Readiness

Phase 3 is ready for /gsd-verify-work. The two owner confirmations listed above (covers on screen and collection count) should be asked there.

## Self-Check: PASSED

- FOUND: scripts/report-discogs-live.ts
- FOUND: 4d26cb4 (ancestor of HEAD)
- Report re-run exit 0 with a "discogs_searches" heading
