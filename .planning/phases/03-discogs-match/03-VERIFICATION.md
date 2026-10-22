---
phase: 03-discogs-match
verified: 2026-10-22T01:11:33Z
status: human_needed
score: 5/5 must-haves verified
covered_files: [".planning/phases/03-discogs-match/03-01-PLAN.md", ".planning/phases/03-discogs-match/03-01-SUMMARY.md", ".planning/phases/03-discogs-match/03-02-PLAN.md", ".planning/phases/03-discogs-match/03-02-SUMMARY.md", ".planning/phases/03-discogs-match/03-03-PLAN.md", ".planning/phases/03-discogs-match/03-03-SUMMARY.md", ".planning/phases/03-discogs-match/03-04-PLAN.md", ".planning/phases/03-discogs-match/03-04-SUMMARY.md", ".planning/phases/03-discogs-match/03-05-PLAN.md", ".planning/phases/03-discogs-match/03-05-SUMMARY.md", ".planning/phases/03-discogs-match/03-06-PLAN.md", ".planning/phases/03-discogs-match/03-06-SUMMARY.md", ".planning/phases/03-discogs-match/03-07-PLAN.md", ".planning/phases/03-discogs-match/03-07-SUMMARY.md", ".planning/phases/03-discogs-match/03-08-PLAN.md", ".planning/phases/03-discogs-match/03-08-SUMMARY.md", ".planning/phases/03-discogs-match/03-09-PLAN.md", ".planning/phases/03-discogs-match/03-09-SUMMARY.md", ".planning/phases/03-discogs-match/03-10-PLAN.md", ".planning/phases/03-discogs-match/03-10-SUMMARY.md", ".planning/phases/03-discogs-match/03-11-PLAN.md", ".planning/phases/03-discogs-match/03-11-SUMMARY.md", ".planning/phases/03-discogs-match/03-12-PLAN.md", ".planning/phases/03-discogs-match/03-12-SUMMARY.md", ".planning/phases/03-discogs-match/03-13-PLAN.md", ".planning/phases/03-discogs-match/03-13-SUMMARY.md", ".planning/phases/03-discogs-match/03-14-PLAN.md", ".planning/phases/03-discogs-match/03-14-SUMMARY.md", ".planning/phases/03-discogs-match/03-15-PLAN.md", ".planning/phases/03-discogs-match/03-15-SUMMARY.md", "src/app/api/discogs/callback/route.ts", "src/app/api/discogs/connect/route.ts", "src/app/api/discogs/test/route.test.ts", "src/app/api/discogs/test/route.ts", "src/app/api/spines/[id]/candidates/route.ts", "src/app/api/spines/[id]/search/route.ts", "src/components/candidate-row.tsx", "src/components/discogs-card.tsx", "src/components/discogs-matches.test.ts", "src/components/discogs-matches.tsx", "src/components/discogs-not-connected-alert.tsx", "src/components/discogs-search-dialog.tsx", "src/lib/candidate-format.ts", "src/lib/discogs-ref.ts", "src/server/discogs/auth.ts", "src/server/discogs/client.ts", "src/server/discogs/connect.ts", "src/server/discogs/enqueue.test.ts", "src/server/discogs/enqueue.ts", "src/server/discogs/gate.ts", "src/server/discogs/oauth.ts", "src/server/discogs/queries.ts", "src/server/discogs/reactivated-spine.test.ts", "src/server/discogs/search.ts", "src/server/discogs/store.ts", "src/server/discogs/thumbs.ts", "src/server/jobs/handlers/fetch-release.ts", "src/server/jobs/handlers/index.ts", "src/server/jobs/handlers/search-spine.ts", "src/server/jobs/worker.ts", "src/server/scan/orphans.ts", "src/server/scan/store.ts"]
covered_digest: "v3:sha256:a9bd413b4e501d5ee734d167841cfd3fe9513eb1ff65ac715653aa2f07e1dd0f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "Each music spine gets candidates automatically (SC2 / DISC-03) via the auth_failed reconnect path (CR-01): an active CD spine whose rejected Retry repeated a covering baseline is now queued again by finishing a connect and by a passing Test connection, including after a restart"
    - "WR-01 (03-14): a not-searched card no longer shows 'Fields changed' or Search again"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-01 (03-REVIEW): an orphaned or non-CD spine whose own Search again or Retry was rejected is not replayed on reconnect. Its card keeps saying 'Reconnect Discogs in Settings' while connected. Confirmed by a probe run"
    category: other
    reason: "Not a goal blocker. Orphaned ('No longer detected') and non-CD spines are outside automatic search by design (D-08), so 'each music spine' does not cover them. Retry search is offered on the card and works. It does break the literal wording of the 03-15 judgment prohibition, which is flagged for the owner below. Fix: replay as an 'again' search, or change the copy once connected"
    evidence_status: "deterministic: scratch probe, orphaned spine card stays failed/auth with action retry after reconnect"
  - finding: "WR-02 (03-REVIEW): after a server restart, a rejected card says 'Reconnect Discogs in Settings', but Settings shows Connected with no Reconnect button. Test connection is the working fix, and nothing points to it"
    category: other
    reason: "Not a goal blocker. It only affects the copy on a restart edge case. Retry search on the card works, and Test connection queues the lookup again (test C passes). Fix: when connected and no reconnect is offered, point the failure line to Test connection or Retry"
    evidence_status: "code read: candidate-format.ts:55-57 fixed copy; discogs-card.tsx renders ReconnectAlert only when needsReconnect"
human_verification:
  - test: "Covers on match cards. Open http://127.0.0.1:3001/spines and look at a few spines that have matches."
    expected: "Each match shows a small cover picture. A match with no cover shows a grey disc icon, never a broken image."
    why_human: "Visual check of real Discogs images."
  - test: "Nothing added to your collection. Note your collection count on discogs.com, use the app for a while, then check again."
    expected: "The count is the same as before you connected."
    why_human: "Needs your live Discogs account."
  - test: "Show all. On a spine with more than 3 matches, click Show all, then Show fewer."
    expected: "All matches appear, then the list goes back to 3."
    why_human: "Visual and interaction check."
  - test: "Live updates. Change a spine's title, then press Search again. Watch the card without reloading."
    expected: "It goes from Queued to Searching to a result on its own. If Discogs asks the app to slow down, the top bar counts down."
    why_human: "Real-time behavior against the live service."
  - test: "Search Discogs dialog. On any spine, open Search Discogs..., type a search, pick a result and add it. Then paste a release link, and then a master link."
    expected: "The typed search lists results you can pick. A release link shows that release first. A master link asks you to pick a version."
    why_human: "End-to-end flow against live Discogs."
  - test: "Narrow window. Make the browser as narrow as it goes and scroll through the spines page."
    expected: "Nothing is cut off or overlapping."
    why_human: "Visual layout."
  - test: "Plain wording. Read the text on the spines page and in Settings."
    expected: "No technical words (no status codes, job names or error codes)."
    why_human: "Judgment-tier prohibition (03-04); wording quality."
  - test: "Re-attach a No longer detected spine. Re-attach one, wait about 10 seconds, then reload."
    expected: "It shows Queued, then Searching, then matches or 'Discogs found nothing'. It never stays on 'waiting its turn'."
    why_human: "Backstop truth from 03-14; needs the running worker."
  - test: "Reconnect after a revoked sign-in. On discogs.com, revoke this app. In the app, pick a card that has matches, change its title, press Search again, then put the title back. Go to Settings and reconnect Discogs. Return to the spines page."
    expected: "That card shows Queued, then Searching, then its matches. It no longer tells you to reconnect."
    why_human: "Backstop truth from 03-15; needs your live Discogs account."
  - test: "Reconnect message on a No longer detected spine (known issue WR-01). Revoke the app on discogs.com. On a spine marked No longer detected, press Search again. Reconnect Discogs in Settings, then look at that card again."
    expected: "Today the card still says 'Reconnect Discogs in Settings', and pressing Retry search fixes it. Decide whether that is acceptable for now or must be fixed before moving on."
    why_human: "Flagged judgment prohibition (03-15: must not keep telling you to reconnect after a successful reconnect). The automated check is not authoritative."
  - test: "Message after a restart (known issue WR-02). Revoke the app on discogs.com and press Search again on a card. Restore access on discogs.com, restart the app, open the card, then open Settings."
    expected: "Today the card says 'Reconnect Discogs in Settings', but Settings shows Connected with no Reconnect button. Pressing Test connection there, or Retry search on the card, fixes it. Decide whether the wording must change before moving on."
    why_human: "Copy on a rare path; owner decision."
  - test: "No automatic preselect. Open several spines with matches."
    expected: "No match is picked or confirmed for you; you always choose."
    why_human: "Judgment-tier prohibition (03-08)."
---

# Phase 3: Discogs Match Verification Report

**Phase Goal:** User connects their Discogs account and, for each music spine, sees candidate releases they can recognize. Manual search and paste-ID cover the cases auto-search misses, and every request respects the rate limit.
**Verified:** 2026-10-22T01:11:33Z
**Status:** human_needed
**Re-verification:** Yes, after gap-closure plan 03-15

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User completes the Discogs OAuth flow and sees the connected username | VERIFIED (regression) | connect/callback/test routes unchanged except the Test connection backfill; suite passes |
| 2 | Each music spine gets candidates automatically, with cover, year, country, label, catno, format | VERIFIED | CR-01 closed. `enqueue.ts:97-106` replays an auth_failed latest search under `afterAuthFailed` and skips the baseline short-circuit. The key is `…:{rejected id}` (line 120). The three end-to-end tests in `reactivated-spine.test.ts:427-525` (connect, Test connection, Test connection after restart) pass. The previous gap probe now shows `{"state":"queued","failure":null}` |
| 3 | Requests are paced and a 429 backs off and resumes | VERIFIED (regression) | The replay only creates jobs, which run through `search-spine` → `discogsFetch` → gate. Maintenance still passes `includeAuthFailed: false` (`handlers/index.ts:39`) |
| 4 | After editing fields, user can re-run the search | VERIFIED | `matchesAction` now gates Search again on `showsFieldsChanged`. Done/no-match cards with changed fields still offer it (tests pass) |
| 5 | Manual search or pasted release URL/ID for any spine | VERIFIED (regression) | Dialog and routes unchanged; suite passes |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### 03-15 Plan Must-Haves

| Truth | Status | Evidence |
|-------|--------|----------|
| Connect path replays a rejected Retry over a covering baseline; card Queued then real result; never says Reconnect again | VERIFIED | Test "finishing a connect looks up again…" passes |
| Test connection replays, flag set or lost to a restart; second test queues nothing | VERIFIED | Tests at lines 473 and 497 pass; `route.ts:89-94` no longer depends on `isAuthInvalid()` |
| Dedupe key carries the rejected search's id; never collides with the baseline's | VERIFIED | Asserted in the connect test |
| Boundary / empty / ordering cases | VERIFIED | `enqueue.test.ts` and the invariant rows (`connectQueues`) pass; in-transaction `latestSearch` re-check present |
| Loop guard: hook never re-picks auth_failed; other failures never auto re-run | VERIFIED | `handlers/index.ts:39`; replay requires `status === 'auth_failed'` inside the transaction |
| store.ts doc comment matches the rule | VERIFIED | `store.ts:53-61` |
| WR-01: not-searched card shows neither Fields changed nor Search again | VERIFIED | `showsFieldsChanged` used by NoticeLine and matchesAction; tests pass |
| Test route tests use a temporary data folder | VERIFIED | `route.test.ts` +2 lines (`useTempDataDir`) |
| Backstop: live revoke, Search again, reconnect | insufficient_spec | Human item 9 |

### Prohibitions

| Prohibition | Tier | Disposition |
|-------------|------|-------------|
| 03-15: maintenance hook never re-queues auth_failed | judgment | Non-authoritative pass (code and tests). Flagged for owner review |
| 03-15: never auto re-run a search that failed for another reason | judgment | Non-authoritative pass. Flagged for owner review |
| 03-15: no "reconnect" message on a card after a successful reconnect | judgment | **Holds for active CD spines. It does not hold for orphaned or non-CD spines (WR-01, probe-confirmed).** Unverified prohibition, human review recommended (item 10) |
| 03-15: no Fields changed / Search again on a waiting card | judgment | Non-authoritative pass |
| 03-01: no writes to the Discogs account | test | VERIFIED (allowlist test); live check is item 2 |
| 03-11: no pasted release added unseen | test | VERIFIED |
| 03-04 plain wording, 03-08 no preselect | judgment | Unverified prohibitions, human review (items 7, 12) |

### Required Artifacts and Key Links

`verify.artifacts` 6/6 passed and `verify.key-links` 5/5 verified for 03-15. Earlier-plan artifacts are unchanged and pass regression.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (once) | `npx vitest run` | 64 files, 963/963 passed | PASS |
| Typecheck | `npx tsc --noEmit` | no errors | PASS |
| Old CR-01 repro against HEAD | scratch probe (active CD spine, failed baseline, rejected Retry, reconnect backfill) | `created 5`, card `{"state":"queued","failure":null}` | PASS (gap closed) |
| WR-01 repro | scratch probe (orphaned spine, Search again 401, reconnect, maintenance) | card `{"state":"failed","failure":{"kind":"auth"},"action":"retry"}` | Confirmed (warning) |
| Debt markers in 03-15 files | grep TBD/FIXME/XXX/TODO/HACK | none | PASS |

### Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| DISC-01 | SATISFIED | SC1 |
| DISC-02 | SATISFIED | SC3 |
| DISC-03 | SATISFIED | SC2; CR-01 closed |
| DISC-04 | SATISFIED | SC2 card fields; covers need human item 1 |
| DISC-05 | SATISFIED | SC4 |
| DISC-06 | SATISFIED | SC5 |

All six IDs are claimed by plans; none is orphaned. Info: REQUIREMENTS.md still lists DISC-01/02/04/05/06 as "Gaps Found" and unchecked. That is bookkeeping for the orchestrator to update.

### Review Findings (03-REVIEW.md after 03-15)

| Finding | Severity | Blocks goal? | Why |
|---------|----------|--------------|-----|
| WR-01: orphaned/non-CD rejected spine not replayed; card keeps saying Reconnect | Warning | No | Orphaned spines are "No longer detected" and not active. Non-CD spines are left to manual search (D-08). Neither is in the "each music spine" auto-search scope. Retry search is shown and works. It does contradict the 03-15 prohibition's wording, so it is flagged for the owner (item 10) |
| WR-02: after restart, copy says Reconnect but Settings has no Reconnect button | Warning | No | Rare path, copy only. Retry on the card and Test connection both work (test C) |
| IN-01 to IN-05 | Info | No | Stray JSDoc, dead `latestAutoSearch`, tautological test half, hand-written status checks, duplicated test helpers |

## Human Verification Required

The app runs at http://127.0.0.1:3001. Steps are listed in the frontmatter `human_verification`:

1. Covers on match cards
2. Nothing added to your Discogs collection
3. Show all / Show fewer
4. Live updates and slowdown countdown
5. Search Discogs dialog (typed search, release link, master link)
6. Narrow window
7. Plain wording
8. Re-attach a No longer detected spine
9. Reconnect after a revoked sign-in (03-15 backstop)
10. Reconnect message on a No longer detected spine (WR-01, decide)
11. Message after a restart (WR-02, decide)
12. No automatic preselect

## Gaps Summary

No blocking gaps remain. Plan 03-15 closed CR-01. A connect or a passing Test connection now looks up again every active CD spine whose last search was rejected, including one whose earlier search already covered its inputs, and it still works after a restart. The maintenance hook still never replays a rejection. All 963 tests pass. The two new review warnings fall outside the phase goal's automatic-search scope (orphaned and non-CD spines) or affect copy on a rare restart path. In both cases the Retry search button still recovers the card. WR-01 does break the literal wording of a 03-15 judgment-tier prohibition, so the owner must decide on items 10 and 11 before the phase is closed.

---

_Verified: 2026-10-22T01:11:33Z_
_Verifier: Claude (gsd-verifier)_
