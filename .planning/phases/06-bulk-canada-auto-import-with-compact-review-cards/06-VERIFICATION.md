---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
verified: 2026-10-25T10:15:00Z
status: human_needed
score: 81/90 must-haves verified
covered_files: [".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-SUMMARY.md","demo/fixtures/pressings.json","drizzle/0004_bulk_import.sql","drizzle/meta/0004_snapshot.json","drizzle/meta/_journal.json","scripts/verify-bulk-import.ts","src/app/api/spines/[id]/retry/route.test.ts","src/app/api/spines/[id]/retry/route.ts","src/app/api/spines/bulk-import/route.test.ts","src/app/api/spines/bulk-import/route.ts","src/app/api/spines/retry-failed/route.test.ts","src/app/api/spines/route.ts","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/page.demo.tsx","src/app/settings/page.tsx","src/app/spines/loading.tsx","src/app/spines/page.demo.tsx","src/app/spines/page.tsx","src/components/bulk-import-bar.tsx","src/components/bulk-import-dialog.test.ts","src/components/bulk-import-dialog.tsx","src/components/bulk-status-line.tsx","src/components/card-layout-toggle.tsx","src/components/compact-spine-card.test.ts","src/components/compact-spine-card.tsx","src/components/confirmed-match.tsx","src/components/country-badge.tsx","src/components/discogs-card.tsx","src/components/discogs-matches.test.ts","src/components/discogs-matches.tsx","src/components/expanded-cards.tsx","src/components/fallback-filter-toggle.tsx","src/components/import-state-badge.tsx","src/components/photo-section.tsx","src/components/preferred-country-field.test.ts","src/components/preferred-country-field.tsx","src/components/spine-card.tsx","src/components/spine-selection.tsx","src/components/spines-filter-bar.test.ts","src/components/spines-filter-bar.tsx","src/components/spines-view.test.ts","src/components/spines-view.tsx","src/components/top-match-row.tsx","src/components/ui/checkbox.tsx","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/read.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/bulk-copy.test.ts","src/lib/bulk-copy.ts","src/lib/bulk-eligibility.test.ts","src/lib/bulk-eligibility.ts","src/lib/bulk-selection.test.ts","src/lib/bulk-selection.ts","src/lib/bulk-types.ts","src/lib/bulk-view.test.ts","src/lib/bulk-view.ts","src/lib/discogs-types.ts","src/lib/pressing.test.ts","src/lib/pressing.ts","src/lib/review-status.test.ts","src/lib/review-status.ts","src/lib/scan-types.ts","src/lib/spine-review.test.ts","src/server/bulk/picks.ts","src/server/bulk/queries.test.ts","src/server/bulk/queries.ts","src/server/bulk/recovery.test.ts","src/server/bulk/recovery.ts","src/server/bulk/store.test.ts","src/server/bulk/store.ts","src/server/db/migrations.test.ts","src/server/db/schema.ts","src/server/discogs/client.test.ts","src/server/discogs/queries.test.ts","src/server/discogs/queries.ts","src/server/discogs/status.test.ts","src/server/discogs/status.ts","src/server/discogs/store.ts","src/server/discogs/versions.test.ts","src/server/discogs/versions.ts","src/server/imports/store.test.ts","src/server/imports/store.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/resolve-pressing.test.ts","src/server/jobs/handlers/resolve-pressing.ts","src/server/scan/queries.test.ts","src/server/scan/queries.ts","src/server/settings.test.ts","src/server/settings.ts","test/fixtures/discogs/master-versions-bogus.json","test/fixtures/discogs/master-versions-canada.json","test/fixtures/fake-discogs.mjs","test/helpers/bulk-seed.ts"]
covered_digest: "v3:sha256:e3b8a6bfd3994bbf35fc39b95bb95ff8e069bebf948657a11be09a8aadec0259"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "An expanded card stays expanded across polls and filter refetches while it stays in the list (06-07)"
    test: "Open a card with Edit spine while a bulk run or search is going, type in a field, and wait for the page to refresh itself"
    expected: "The card stays open and the typed text is still there"
    why_human: "The open-card list lives above the refreshing list, so it should survive, but no test drives a real refresh with a card open"
human_verification:
  - test: "Open the review page (Spines) on a wide screen, then make the window narrower step by step, down to phone width."
    expected: "Cards are small: checkbox, number, badges, the spine photo, and the top match right under it (cover, artist and title, year, country, catalogue number). No edit boxes. 4 cards per row on a wide screen, then 3, then 2, then 1 at phone width. A very long album title stops after two lines and shows in full when you hover over it."
    why_human: "Layout and text cut-off can only be judged by looking"
  - test: "On a card in the middle of a row, click Edit spine. Open a second card too. Then click Show less on each."
    expected: "The card opens across the whole row with all the edit fields and matches, the cards before it stay where they were, both cards can be open at once, and Show less closes it and puts you back on its Edit spine button."
    why_human: "Placement in the grid and where the keyboard focus lands are visual"
  - test: "Click Detailed in the filter bar, reload the page, then click Compact."
    expected: "Detailed shows the big full cards one under another and is still Detailed after the reload. Compact goes back to the small cards. Any card you had opened closes when you switch."
    why_human: "Needs a real browser and page reload"
  - test: "Hover over (or Tab to) the checkbox of a card that is already imported or still being searched. Then tick Select all shown, change the status filter, and look at the selected count."
    expected: "The greyed checkbox explains why it can't be picked (for example already imported). Select all shown ticks every pickable card that is on screen, including ones with a low-confidence badge. After changing the filter, cards that are no longer on screen are no longer counted as selected."
    why_human: "Tooltips and live count changes are browser-only"
  - test: "With a few cards selected, click Import N selected. Read the dialog, then click Start import. Repeat once with a very long folder name, on phone width."
    expected: "The dialog says 'Import N to {your folder} as Canadian pressings', mentions how many cards had a field Claude wasn't sure of, and has Keep reviewing and Start import. Start shows Starting… and then closes. With a long folder name the title wraps onto several lines instead of running off the screen."
    why_human: "Dialog wording, wrapping and button states are visual"
  - test: "Watch the cards while the bulk import runs, without touching the page, until it finishes. Then reload the page."
    expected: "Cards first show 'Finding pressing' with a spinner and 'Looking for the Canadian pressing…', and update on their own every few seconds. The bar at the bottom reads 'Bulk import: X / N done'. Afterwards each imported card shows a pin badge with Canada, or a warning badge 'Fallback: {country}' with a line explaining why (for example 'No Canadian pressing, used US'). A second card for the same album says 'Already imported from spine #n'. One pop-up says 'Bulk import done: N added to {folder}.' with Show fallbacks or Show failed. After the reload the pop-up does not come back, but the bar still shows 'Last bulk import: …'."
    why_human: "Live updating, pop-ups and their behaviour across a reload are browser-only"
  - test: "Click Fallback in the filter bar (it only appears once at least one fallback exists). Then also turn on Needs review."
    expected: "Only the fallback cards are listed. If nothing matches you see 'No fallbacks' with a Show all spines button, or with two filters on 'No spines match these filters' with Clear filters. Reloading the page with Fallback on keeps the same list."
    why_human: "Filter screens and reload behaviour are visual"
  - test: "On the Settings page, in the Discogs card, type 'canada' in Preferred country and click away. Then clear the box and click away."
    expected: "It saves as 'Canada' with a pop-up 'Preferred country set to Canada'. An empty box is not saved and says 'Enter a country, such as Canada.'"
    why_human: "Form saving and pop-ups need a browser"
  - test: "At phone width, look at a fallback card and a skipped-duplicate card whose photo has a very long file name."
    expected: "The explanation lines wrap inside the card and never stick out of it."
    why_human: "Text wrapping is visual"
  - test: "Open the demo site, select all on the review page, import, and watch it finish."
    expected: "The same flow plays out with made-up data: Finding pressing, Canada badges, a Fallback card, an 'Already imported from spine' card, the progress line and the finished pop-up. Nothing asks you to sign in to Discogs."
    why_human: "End-to-end demo playback is visual"
---

# Phase 6: Bulk Canada auto-import with compact review cards Verification Report

**Phase Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match without verifying hundreds one by one. Compact cards (crop with top match below, edit fields hidden until expanded), multi-select, and a bulk action that resolves each spine's top match to its Canada release (visible fallback) and adds it through the existing rate-limited queue.
**Verified:** 2026-10-25T10:15:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

All server-side truths are proven by code reading, by the full suite (120 files, 2184 tests, exit 0, run by the verifier), and by the live-stack proof `node scripts/verify-bulk-import.ts` (exit 0, run by the verifier on an ephemeral port). The remaining items are browser-only.

### Observable Truths (grouped by plan; 90 total)

| Plan | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 06-01 pressing core | 7/7 | VERIFIED | `src/lib/pressing.ts` `choosePressing` ranks [unofficial, exact/combined, CD, label, year, id]; preferred short-circuit; `fallback_no_master`/`fallback_unusable_master`/`fallback_no_version`; D-21 title guard; `versions.ts` caps at `MAX_PLAUSIBLE_VERSIONS = 1000`; `client.ts isAllowed` permits only GET plus the two POSTs (test at `client.test.ts:371` refuses POST `/masters/13814/versions`); `eligibilityOf` reasons, failed import and confidence never read |
| 06-02 tracer job | 9/9 + 3 prohibitions | VERIFIED | `resolve-pressing.ts` → `createImport({spineId,candidateId,runAfter,folderId})`; registered in `handlers/index.ts`; 30+ named tests in `resolve-pressing.test.ts` (D-02 zero requests, D-01 one request, D-04, D-09, D-20, interleave, 429/401/5xx); `migrations.test.ts` upgrades a Phase 5 copy |
| 06-03 preferred country | 7/7 | VERIFIED | `settings.ts` default `Canada`, `canonicalCountry`; `PreferredCountryField` on `discogs-card.tsx:85`; copy strings present; demo twin in `src/demo/settings-actions.ts` |
| 06-04 read model | 6/7 (+1 backstop) | VERIFIED | `getSpines` attaches `eligibilityOf`, `bulkForSpines`, `latestBulkRun`, `counts.fallback`, `preferredCountry`; `review-status.ts` maps finding→matched, failed→failed; `countryMatch` combined reads preferred |
| 06-05 retry/recovery | 5/5 | VERIFIED | `retrySpine` → `retryBulkItem` (`imports/store.ts:549-562`); `markInterruptedLookups` in maintenance hook, COALESCE keeps earlier kind; `status.ts` counts `resolve_pressing` |
| 06-06 start route | 7/7 (+1 backstop) | VERIFIED | `bulk-import/route.ts`: 415/400, 409 not_connected with both messages, 409 bulk_running, `eligiblePicks` + `startBulkRun` in one IMMEDIATE tx, no Discogs call; demo twin in `ROUTES` |
| 06-07 compact cards | 7/8 (+3 backstop) | 7 VERIFIED, 1 PRESENT_BEHAVIOR_UNVERIFIED | `CompactSpineCard` header/crop/match slot, `COMPACT_GRID` 1/2/3/4, `?view=detailed` via nuqs, `col-span-full` expand, orphans in grid, `loading.tsx` 8 skeletons. Expanded-across-polls has no test (see behavior_unverified_items) |
| 06-08 bulk states | 7/7 (+2 backstop) | VERIFIED | `CountryBadge` (MapPin / `Fallback:`), `BulkStatusLine` with Retry → `/retry`, Finding pressing badge; `compact-spine-card.test.ts:368-468` |
| 06-09 selection/bar/dialog | 11/11 (+1 backstop) | VERIFIED (logic) | `SpineSelectCheckbox`, `BulkImportBar` (select-all tri-state, count, disabled reasons, progress/last-result), `BulkImportDialog` (title, Starting…, error text, frozen picks), `pruneSelection` on every data change, once-per-run toast via `hasRunFinished` |
| 06-10 live proof | 5/5 | VERIFIED | Verifier ran it: 4 added once each, 1 fallback_no_version, 1 duplicate skipped; 5 versions requests (Canada, CD); 13 requests ≥1110 ms apart; second start 409 bulk_running; SIGKILL mid-run then restart: each release added once, held POST adopted |
| 06-11 demo bulk | 5/5 | VERIFIED | `src/demo/ops/bulk.ts` timestamp-driven `readyAt`; `demo/fixtures/pressings.json`; `bulk.test.ts` covers preferred, pressing, fallback, duplicate, D-20, "makes no network request"; read model reuses `summarizeRun`/`isFallbackSpine`/`lookupOf`/`eligibilityOf` |
| 06-12 fallback filter | 5/5 | VERIFIED | Toggle shown when `counts.fallback > 0 || fallback`; empty-state copy in `spines-view.tsx`; `parseFallbackParam` on `page.tsx`, `sp.get('fallback')` on `page.demo.tsx` |

**Score:** 81/90 verified (1 present, behavior-unverified; 8 backstop truths routed to human verification as insufficient_spec)

Backstop truths routed to human: polling during a run (06-04), demo bulk flow visuals (06-06), title clamp, row placement on expand, draft kept across refetch (06-07), long fallback/skip line wrap (06-08), dialog title wrap (06-09).

### Prohibitions (06-02)

| Prohibition | Status | Evidence |
| --- | --- | --- |
| Bulk path never passes allow-duplicate | RESOLVED | No `allowDuplicate` in `src/server/bulk`, `resolve-pressing.ts`, `src/demo/ops/bulk.ts` |
| Only `imports/store.ts` enqueues add_to_collection | RESOLVED | Single `type: ADD_TO_COLLECTION_JOB_TYPE` site (`store.ts:344`); static guard test `store.test.ts:1197` passes |
| Pressing candidate never in candidate list/top match | RESOLVED | `discogs/queries.ts:80,92` filter `source <> 'pressing'`; test "stored hidden" |

### Required Artifacts

All 31 declared artifacts pass `verify.artifacts` (exist, substantive) and are imported and used. All 24 key links pass `verify.key-links`.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| CompactSpineCard / CountryBadge / BulkStatusLine | `spine.bulk` | `getSpines` → `bulkForSpines` SQL over `bulk_items`/`bulk_runs`/`jobs` | Yes | FLOWING |
| BulkImportBar | `data.bulk` | `latestBulkRun` → `summarizeRun` over run items | Yes | FLOWING |
| BulkImportDialog | country/folder | `getPreferredCountry()` / folder name in GET /api/spines | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite | `npx vitest run` (once) | 120 files, 2184 tests passed | PASS |
| Live bulk run against fake Discogs | `node scripts/verify-bulk-import.ts` | stages (a)-(e) ok, exit 0 | PASS |

### Probe Execution

No probes are declared. Step 7c is not applicable.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
| --- | --- | --- | --- |
| BULK-01 compact card + grid | 06-07, 06-08 | SATISFIED (visual human check) | `compact-spine-card.tsx`, `COMPACT_GRID` |
| BULK-02 expand in place | 06-07 | SATISFIED (poll survival human check) | `expanded-cards.tsx`, `col-span-full` |
| BULK-03 Compact/Detailed toggle | 06-07 | SATISFIED | `card-layout-toggle.tsx`, mounted in filter bar |
| BULK-04 select + eligibility | 06-01, 06-04, 06-09 | SATISFIED | `eligibilityOf`, `SpineSelectCheckbox`, `pruneSelection` |
| BULK-05 dialog + start route | 06-06, 06-09 | SATISFIED | route + dialog, server re-validation |
| BULK-06 lookup job | 06-01, 06-02, 06-10 | SATISFIED | `resolve-pressing.ts`, live proof |
| BULK-07 fallback recorded | 06-01, 06-02, 06-08 | SATISFIED | `bulk_items.outcome`, badge + line |
| BULK-08 local duplicates | 06-02, 06-08, 06-10 | SATISFIED | `skipBulkItem(duplicate)`, live proof 1 skipped |
| BULK-09 preferred country | 06-03 | SATISFIED | settings + field + demo twin |
| BULK-10 fallback filter, progress, toast | 06-04, 06-09, 06-12 | SATISFIED (toast human check) | `?fallback=1`, bar lines, `hasRunFinished` |
| BULK-11 lookup failure/retry/recovery | 06-04, 06-05, 06-06, 06-10 | SATISFIED | `retryBulkItem`, `markInterruptedLookups`, crash restart in live proof |
| BULK-12 demo | 06-06, 06-11 | SATISFIED | demo route + ops + fixture, no-network test |

No orphaned IDs. All 12 are claimed by at least one plan.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK markers in the 103 phase-modified files under src, scripts, test, drizzle and demo. The review converged clean (06-REVIEW.md, 0 critical, 0 warning).

### Human Verification Required

See `human_verification` in the frontmatter: 10 do/see checks (layout, expand, toggle, checkboxes, dialog, live run and toast across a reload, fallback filter, settings field, text wrapping, demo).

### Gaps Summary

No gaps. The bulk Canada import works end to end against a fake Discogs. It looks up one versions list per spine, falls back visibly, skips duplicates, keeps the pacing, allows one run at a time, and survives a crash. The UI pieces exist and are wired. What remains is checking the browser look and behaviour by eye.

---

_Verified: 2026-10-25T10:15:00Z_
_Verifier: Claude (gsd-verifier)_
