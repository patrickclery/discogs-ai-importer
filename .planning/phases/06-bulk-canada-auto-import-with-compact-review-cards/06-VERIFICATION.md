---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
verified: 2026-10-26T02:55:53Z
status: human_needed
score: 109/120 must-haves verified
covered_files: [".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-SUMMARY.md","demo/fixtures/pressings.json","drizzle/0004_bulk_import.sql","drizzle/0005_bulk_fallback_country.sql","drizzle/meta/0004_snapshot.json","drizzle/meta/0005_snapshot.json","drizzle/meta/_journal.json","scripts/verify-bulk-import.ts","src/app/api/spines/[id]/retry/route.test.ts","src/app/api/spines/[id]/retry/route.ts","src/app/api/spines/bulk-import/route.test.ts","src/app/api/spines/bulk-import/route.ts","src/app/api/spines/retry-failed/route.test.ts","src/app/api/spines/route.ts","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/page.demo.tsx","src/app/settings/page.tsx","src/app/spines/loading.tsx","src/app/spines/page.demo.tsx","src/app/spines/page.tsx","src/components/bulk-import-bar.tsx","src/components/bulk-import-dialog.test.ts","src/components/bulk-import-dialog.tsx","src/components/bulk-status-line.tsx","src/components/card-layout-toggle.tsx","src/components/compact-spine-card.test.ts","src/components/compact-spine-card.tsx","src/components/confirmed-match.tsx","src/components/country-badge.tsx","src/components/discogs-card.tsx","src/components/discogs-matches.test.ts","src/components/discogs-matches.tsx","src/components/expanded-cards.tsx","src/components/fallback-filter-toggle.tsx","src/components/import-state-badge.tsx","src/components/photo-section.tsx","src/components/preferred-country-field.test.ts","src/components/preferred-country-field.tsx","src/components/review-status-filter.test.ts","src/components/review-status-filter.tsx","src/components/spine-card.tsx","src/components/spine-selection.tsx","src/components/spines-filter-bar.test.ts","src/components/spines-filter-bar.tsx","src/components/spines-view.test.ts","src/components/spines-view.tsx","src/components/top-match-row.tsx","src/components/ui/checkbox.tsx","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/read.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/bulk-copy.test.ts","src/lib/bulk-copy.ts","src/lib/bulk-eligibility.test.ts","src/lib/bulk-eligibility.ts","src/lib/bulk-selection.test.ts","src/lib/bulk-selection.ts","src/lib/bulk-types.ts","src/lib/bulk-view.test.ts","src/lib/bulk-view.ts","src/lib/discogs-types.ts","src/lib/pressing.test.ts","src/lib/pressing.ts","src/lib/review-status.test.ts","src/lib/review-status.ts","src/lib/scan-types.ts","src/lib/spine-review.test.ts","src/server/bulk/picks.ts","src/server/bulk/queries.test.ts","src/server/bulk/queries.ts","src/server/bulk/recovery.test.ts","src/server/bulk/recovery.ts","src/server/bulk/store.test.ts","src/server/bulk/store.ts","src/server/db/migrations.test.ts","src/server/db/schema.ts","src/server/discogs/client.test.ts","src/server/discogs/queries.test.ts","src/server/discogs/queries.ts","src/server/discogs/status.test.ts","src/server/discogs/status.ts","src/server/discogs/store.ts","src/server/discogs/versions.test.ts","src/server/discogs/versions.ts","src/server/imports/store.test.ts","src/server/imports/store.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/resolve-pressing.test.ts","src/server/jobs/handlers/resolve-pressing.ts","src/server/scan/queries.test.ts","src/server/scan/queries.ts","src/server/settings.test.ts","src/server/settings.ts","test/fixtures/discogs/master-versions-bogus.json","test/fixtures/discogs/master-versions-canada.json","test/fixtures/fake-discogs.mjs","test/helpers/bulk-seed.ts"]
covered_digest: "v3:sha256:05dddba14ddaf97902a76070f6bb9a3f853358084928bec0ca21576224f9fba8"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 81/90
  gaps_closed:
    - "G-06-side-1: Settings has a Fallback country (default US) and bulk import goes Preferred -> Fallback -> top match (06-13, 06-14, 06-16, 06-17, 06-18; review fixes 7537da1, 283679d, f71f40f, 9cde7b6, 5bb5a4a)"
    - "G-06-9: at phone width every status tab is visible; the row wraps (06-15)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "An expanded card stays expanded across polls and filter refetches while it stays in the list (06-07)"
    test: "Open a card with Edit spine while a bulk run or search is going, type in a field, and wait for the page to refresh itself"
    expected: "The card stays open and the typed text is still there"
    why_human: "Carried from the first verification. The open-card list lives above the refreshing list, so it should survive, but no test drives a real refresh with a card open. Not repeated as a human item: the owner already passed the related UAT checks 2 and 6."
human_verification:
  - test: "Open Settings (Discogs connected). Below Preferred country there is a new box, Fallback country. Type germany in it and click somewhere else. Then empty the box and click somewhere else. Then type canada and click somewhere else. Finally type us and click somewhere else."
    expected: "The box starts as US. After germany it shows Germany and a pop-up says 'Fallback country set to Germany'. The empty box says 'Enter a country, such as US.' and nothing is saved. After canada a note appears under the box: 'Same as the preferred country, so bulk import goes straight to the top match.' After us it shows US, the pop-up says 'Fallback country set to US', and the note goes away. Preferred country stays Canada the whole time."
    why_human: "Saving when you click away, pop-ups and the note are only visible in a browser"
  - test: "Open the review page (Spines) and make the window as narrow as a phone. Look at the row of status tabs at the top (All, Pending, Matched, Imported, Not found, Not on Discogs, Failed). Click Failed. Then make the window wide again."
    expected: "At phone width all seven tabs are fully visible with their numbers, spread over two or three lines, each in its own box. Nothing is cut off on the right and the page does not scroll sideways. Clicking Failed shows the failed list. On a wide screen the tabs sit on one line."
    why_human: "How the tabs wrap at a real phone width can only be judged by looking"
  - test: "With Fallback country set to US, select a few spines you have not imported yet, including Massive Attack if it is still there and at least one whose top match is not from Canada. Click Import, read the dialog, click Start import and wait until it finishes."
    expected: "The dialog says each top match is swapped for its Canadian CD pressing, or else for its US CD pressing, and that the top match is added as is only if Discogs lists neither. While it runs, cards say 'Looking for the Canadian or US pressing…'. Afterwards, a spine that had no Canadian CD but a US one shows the warning badge 'Fallback: US' and the line 'No Canadian pressing, used US'. A spine with neither shows 'Fallback: {its country}' and 'No Canadian or US pressing, used {its country}'. Massive Attack no longer lands on Hong Kong if Discogs lists a US CD for it. Canadian ones still show the Canada pin badge."
    why_human: "Needs your real Discogs account and real albums; the new wording is only visible in a browser"
  - test: "Open the demo site, go to the review page, click Select all shown, then Import, then Start import, and wait for it to finish. Find the Guttermouth 'Live From The Pharmacy' card and the Massive Attack '100th Window' card."
    expected: "The Guttermouth card shows 'Fallback: US' and 'No Canadian pressing, used US'. The Massive Attack card shows 'Fallback: Hong Kong' and 'No Canadian or US pressing, used Hong Kong'. While it runs, cards say 'Looking for the Canadian or US pressing…'. Nothing asks you to sign in to Discogs."
    why_human: "The demo playback is visual"
---

# Phase 6: Bulk Canada auto-import with compact review cards Verification Report

**Phase Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match without verifying hundreds one by one. Compact cards, multi-select, and a bulk action that resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds them through the existing rate-limited queue.
**Verified:** 2026-10-26T02:55:53Z (fingerprint refresh; verdict from 2026-10-26T00:00:23Z unchanged)
**Status:** human_needed
**Re-verification:** Yes, after gap closure (06-13..06-18 for UAT gaps G-06-side-1 and G-06-9, plus review fixes in 06-REVIEW-FIX.md)

## Re-verification Note (2026-10-26T02:55:53Z): Phase 07 recolor

The report went stale only because Phase 07 (colors only) edited covered files. `git diff bffafda HEAD` over all 107 covered implementation files touches 6 files, in 3 commits (e4b83bc, e019c27, 707edcd):

- `bulk-status-line.tsx`, `confirmed-match.tsx`, `discogs-card.tsx` (2 links), `discogs-matches.tsx`: each adds one `hover:text-primary-hover` class to an existing link. Hrefs, labels and copy are unchanged.
- `review-status-filter.tsx`: `Count` gains `group-hover/toggle:` and `group-data-[state=on]/toggle:text-accent-foreground`. At rest it is still muted, and red when `alert`. Inside a hovered or pressed tab the number now uses the tab's text color, for contrast. Props, tab order, `flex-wrap` and `spacing={1}` are unchanged.
- `review-status-filter.test.ts`: only appends a Phase 7 `describe` block. The G-06-9 tests are unchanged.

No logic, copy, routes, data or test expectations from Phase 6 changed. Full suite run once: 125 files, 2368 tests passed (previously 121/2313; the extra tests come from Phase 7). The verdict, score, truths, and human items below are carried over unchanged. The 4 owner checks in 06-UAT.md are still pending.

## Goal Achievement

The goal is achieved in code. Bulk import now goes Preferred -> Fallback (default US) -> top match, and every card says truthfully which country it used and which it tried. The status tabs wrap at phone width. Evidence the verifier produced itself:

- Full suite run once: 121 files, 2313 tests passed. `tsc --noEmit` is clean and `biome check` is clean (687 files).
- Live-stack proof `node scripts/verify-bulk-import.ts` ran on ephemeral port 46361 with a temp data dir and exited 0. It showed 801011 imported as `fallback_country`, 6 versions requests (one Canada per looked-up spine plus exactly one US, for master 51011), `fallback_country` 'US' on the run, 14 requests at least 1111 ms apart, a second start answered 409, and the SIGKILL restart added each release once.
- `verify.artifacts` and `verify.key-links` passed for all 18 plans (47/47 artifacts, 33/33 links).

### Observable Truths (grouped by plan; 120 total)

| Plan | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 06-01..06-12 | 81/90 | Regression check: unchanged | The earlier verified truths are still covered by the suite and the live proof. 06-04, 06-06, 06-07, 06-08 and 06-09 had 8 backstop truths, which the owner passed in UAT 1-10. 1 truth is present but behavior-unverified (see frontmatter). |
| 06-13 pressing fallback tier | 6/6 | VERIFIED | `pressing.ts`: `distinctFallback`, the shared `rankTier` (same key and guard in both tiers), `chooseFallbackTier`, `needsFallbackLookup` (derived from `rankTier`, not duplicated). `fallback_country` is in `PRESSING_OUTCOMES`. Tests pass. |
| 06-14 Fallback country setting | 5/6 | 5 VERIFIED, 1 human | `getFallbackCountry`/`setFallbackCountry` (key `fallback_country`, default US, canonical spelling). `saveFallbackCountry` in the app and the demo twin. `FallbackCountryField` is rendered after Preferred country (markup-order test). Empty copy is tested. The success toast text has no test, so it is routed to human item 1. |
| 06-15 status tabs wrap | 2/3 | 2 VERIFIED, 1 human | `review-status-filter.tsx`: `spacing={1}`, `flex-wrap`, no `overflow-x-auto` or `w-max` (markup test). Counts and the destructive Failed count are tested. Actual wrapping at phone width goes to human item 2. |
| 06-16 job + run snapshot | 5/5 | VERIFIED | Migration 0005 is one `ALTER TABLE bulk_runs ADD fallback_country text`. The route snapshots `distinctFallback(preferred, getFallbackCountry())`. The job has one `lookupVersions` helper and one `discogsFetch(` site; the second GET is gated by `needsFallbackLookup`. 19 named fallback tests plus the live proof. |
| 06-17 demo tier | 4/4 | VERIFIED | `DemoBulkRun.fallbackCountry` is set at `startBulk`. `fallbackTier()` mirrors the real order. pressings.json key 53 maps to US 2848589. Demo tests include the zero-fetch spy. |
| 06-18 copy and read models | 6/6 | VERIFIED | `BulkItemDto.fallbackCountry` comes from `r.fallback_country` (real) and from the run snapshot (demo). `SpinesResponse.discogs.fallbackCountry` is set. `fallbackLine`, `findingLine` and `dialogBody` use `soughtPhrase` and the pair phrase. The bar passes the setting to the dialog. The UI-SPEC amendment is present. |

**Score:** 109/120 verified. 1 truth is present but behavior-unverified. 10 are routed to human checks: 8 backstops already passed in UAT, plus 2 new ones (the toast, phone-width wrap).

**Deviation, accepted as intended:** 06-16 truth 4 says the second request "fails... exactly like the first". Review fixes 7537da1 and 5bb5a4a changed that on purpose. A 4xx, a wrong-shaped body, or a last-attempt 5xx/unknown error on the optional fallback request now imports the top match as `fallback_country_unchecked` instead of failing the item. Auth, 429, the paused gate, not-current and 404 handling are still shared. Because both requests go through one helper and one `discogsFetch` site, the shared-gate intent holds. Named tests cover each branch (`resolve-pressing.test.ts:1127-1255`). This is counted as VERIFIED.

### Prohibitions (06-02)

All three are still RESOLVED:
- The bulk path never passes `allowDuplicate`.
- `imports/store.ts` is the only `add_to_collection` enqueue site (static guard test passes).
- Pressing candidates stay hidden.

### Required Artifacts

| Artifact | Status | Details |
| --- | --- | --- |
| `src/lib/pressing.ts` | VERIFIED | Fallback tier, `needsFallbackLookup`, `distinctFallback`. Used by the job, demo, route, copy and settings field. |
| `src/server/settings.ts` | VERIFIED | `getFallbackCountry` is read by the route, the settings page and `scan/queries.ts`. |
| `src/components/preferred-country-field.tsx` | VERIFIED | `FallbackCountryField` is rendered in `discogs-card.tsx:91`. |
| `src/components/review-status-filter.tsx` | VERIFIED | Rendered as row 1 of `spines-filter-bar.tsx:80`. |
| `drizzle/0005_bulk_fallback_country.sql` | VERIFIED | In the journal (idx 5). The migration test upgrades a 0004 DB, and the live proof reports 6 migrations. |
| `src/server/jobs/handlers/resolve-pressing.ts` | VERIFIED | Second GET only when `needsFallbackLookup`. |
| `src/demo/ops/bulk.ts`, `demo/fixtures/pressings.json` | VERIFIED | Demo tier, key 53. |
| `src/lib/bulk-copy.ts`, `src/server/bulk/queries.ts`, `src/demo/read-model.ts` | VERIFIED | Copy and both read models. |

### Key Link Verification

All 33 declared links passed. The links that matter for gap closure:
- route -> `getFallbackCountry`
- job -> `needsFallbackLookup`
- `queries.ts` -> `r.fallback_country`
- bar -> dialog `fallbackCountry={data.discogs.fallbackCountry}`
- field -> `saveFallbackCountry`
- demo -> `distinctFallback`

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| BulkStatusLine (fallback and finding lines) | `item.fallbackCountry` | `bulk_runs.fallback_country`, snapshotted from the setting at start | Yes | FLOWING |
| BulkImportDialog body | `data.discogs.fallbackCountry` | `getFallbackCountry()` in GET /api/spines | Yes | FLOWING |
| FallbackCountryField | `initialCountry` | `getFallbackCountry()` on /settings, `account.fallbackCountry` in the demo | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite | `node_modules/.bin/vitest run` (once) | 121 files, 2313 tests passed | PASS |
| Types / lint | `tsc --noEmit`, `biome check` | 0 errors, clean | PASS |
| Live bulk run with fallback tier | `node scripts/verify-bulk-import.ts` (port 46361, temp data) | stages (a)-(e) ok, 801011 `fallback_country`, exactly 1 US request, exit 0 | PASS |

### Probe Execution

No probes are declared, so Step 7c does not apply.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
| --- | --- | --- | --- |
| BULK-01 compact card + grid | 06-07, 06-08, 06-15 | SATISFIED | Earlier evidence plus the wrapping tabs (wrap is a human check) |
| BULK-02 expand in place | 06-07 | SATISFIED | Poll survival is still behavior-unverified |
| BULK-03 Compact/Detailed toggle | 06-07 | SATISFIED | Unchanged |
| BULK-04 select + eligibility | 06-01, 06-04, 06-09 | SATISFIED | Unchanged |
| BULK-05 dialog + start route | 06-06, 06-09, 06-18 | SATISFIED | Dialog body names the fallback country |
| BULK-06 lookup job | 06-01, 06-02, 06-10, 06-13, 06-16 | SATISFIED | Preferred GET, plus a gated fallback GET; live proof |
| BULK-07 fallback recorded | 06-01, 06-02, 06-08, 06-13, 06-16, 06-17, 06-18 | SATISFIED | 7 outcomes stored per item, each with its own truthful line |
| BULK-08 local duplicates | 06-02, 06-08, 06-10 | SATISFIED | Live proof: 1 skipped |
| BULK-09 preferred (and fallback) country | 06-03, 06-14, 06-16 | SATISFIED | Both settings, run snapshot |
| BULK-10 fallback filter, progress, toast | 06-04, 06-09, 06-12 | SATISFIED | Unchanged; `fallback_country` counts as a fallback (test-pinned) |
| BULK-11 failure/retry/recovery | 06-04, 06-05, 06-06, 06-10 | SATISFIED | Crash restart in the live proof |
| BULK-12 demo | 06-06, 06-11, 06-14, 06-17, 06-18 | SATISFIED | Demo setting, tier and copy; zero network |

No IDs are orphaned. There is no REQUIREMENTS.md; the IDs come from 06-RESEARCH.md and every one is claimed by a plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/lib/bulk-copy.ts` | 222-223 | `fallbackLine` has a `default` case with no exhaustiveness guard (06-REVIEW IN-01) | Info | A future outcome would silently get the generic line |
| 06-CONTEXT D-01 / COVERAGE.md | n/a | Both still say "one Discogs read per spine"; gap closure deliberately allows a second, gated GET (06-16 rationale) | Info | The docs are behind the code; no effect at runtime |

No TBD, FIXME, XXX, TODO or HACK markers are in the 50 files changed since the previous verification. `MATCH_PLACEHOLDERS` in `bulk-copy.ts` is UI copy, not a stub.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

The frontmatter `human_verification` has 4 new do/see checks. They cover only behavior added by 06-13..06-18: the Fallback country box and its note, the wrapping status tabs, the real-run dialog/card wording with Fallback: US, and the demo playback of the new lines. The 10 checks the owner passed in 06-UAT.md are not repeated.

### Gaps Summary

No gaps. Both UAT gaps are closed in code:
- **G-06-side-1:** Fallback country setting, run snapshot, Preferred -> Fallback -> top match, and truthful copy, in the app and the demo. Proven by tests and by the live stack.
- **G-06-9:** wrapping tabs, proven by a markup test.

What remains is the owner checking the new screens by eye.

---

_Verified: 2026-10-26T00:00:23Z; fingerprint refreshed 2026-10-26T02:55:53Z after the Phase 07 recolor_
_Verifier: Claude (gsd-verifier)_
