---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
verified: 2026-10-26T08:38:06Z
status: human_needed
score: 109/120 must-haves verified
covered_files: [".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-SUMMARY.md","demo/fixtures/pressings.json","drizzle/0004_bulk_import.sql","drizzle/0005_bulk_fallback_country.sql","drizzle/meta/0004_snapshot.json","drizzle/meta/0005_snapshot.json","drizzle/meta/_journal.json","scripts/verify-bulk-import.ts","src/app/api/spines/[id]/retry/route.test.ts","src/app/api/spines/[id]/retry/route.ts","src/app/api/spines/bulk-import/route.test.ts","src/app/api/spines/bulk-import/route.ts","src/app/api/spines/retry-failed/route.test.ts","src/app/api/spines/route.ts","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/page.demo.tsx","src/app/settings/page.tsx","src/app/spines/loading.tsx","src/app/spines/page.demo.tsx","src/app/spines/page.tsx","src/components/bulk-import-bar.tsx","src/components/bulk-import-dialog.test.ts","src/components/bulk-import-dialog.tsx","src/components/bulk-status-line.tsx","src/components/card-layout-toggle.tsx","src/components/compact-spine-card.test.ts","src/components/compact-spine-card.tsx","src/components/confirmed-match.tsx","src/components/country-badge.tsx","src/components/discogs-card.tsx","src/components/discogs-matches.test.ts","src/components/discogs-matches.tsx","src/components/expanded-cards.tsx","src/components/fallback-filter-toggle.tsx","src/components/import-state-badge.tsx","src/components/photo-section.tsx","src/components/preferred-country-field.test.ts","src/components/preferred-country-field.tsx","src/components/review-status-filter.test.ts","src/components/review-status-filter.tsx","src/components/spine-card.tsx","src/components/spine-selection.tsx","src/components/spines-filter-bar.test.ts","src/components/spines-filter-bar.tsx","src/components/spines-view.test.ts","src/components/spines-view.tsx","src/components/top-match-row.tsx","src/components/ui/checkbox.tsx","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/read.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/bulk-copy.test.ts","src/lib/bulk-copy.ts","src/lib/bulk-eligibility.test.ts","src/lib/bulk-eligibility.ts","src/lib/bulk-selection.test.ts","src/lib/bulk-selection.ts","src/lib/bulk-types.ts","src/lib/bulk-view.test.ts","src/lib/bulk-view.ts","src/lib/discogs-types.ts","src/lib/pressing.test.ts","src/lib/pressing.ts","src/lib/review-status.test.ts","src/lib/review-status.ts","src/lib/scan-types.ts","src/lib/spine-review.test.ts","src/server/bulk/picks.ts","src/server/bulk/queries.test.ts","src/server/bulk/queries.ts","src/server/bulk/recovery.test.ts","src/server/bulk/recovery.ts","src/server/bulk/store.test.ts","src/server/bulk/store.ts","src/server/db/migrations.test.ts","src/server/db/schema.ts","src/server/discogs/client.test.ts","src/server/discogs/queries.test.ts","src/server/discogs/queries.ts","src/server/discogs/status.test.ts","src/server/discogs/status.ts","src/server/discogs/store.ts","src/server/discogs/versions.test.ts","src/server/discogs/versions.ts","src/server/imports/store.test.ts","src/server/imports/store.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/resolve-pressing.test.ts","src/server/jobs/handlers/resolve-pressing.ts","src/server/scan/queries.test.ts","src/server/scan/queries.ts","src/server/settings.test.ts","src/server/settings.ts","test/fixtures/discogs/master-versions-bogus.json","test/fixtures/discogs/master-versions-canada.json","test/fixtures/fake-discogs.mjs","test/helpers/bulk-seed.ts"]
covered_digest: "v3:sha256:7dfb0386fbd19db9b4f948f0adf760c4628b4ae18141d2c7350024866a04e78b"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 109/120
  gaps_closed: []
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "An expanded card stays expanded across polls and filter refetches while it stays in the list (06-07)"
    test: "Open a card with Edit spine while a bulk run or search is going, type in a field, and wait for the page to refresh itself"
    expected: "The card stays open and the typed text is still there"
    why_human: "Carried from the first verification. The open-card list lives above the refreshing list, so it should survive, but no test drives a real refresh with a card open. Not repeated as a human item: the owner already passed the related UAT checks 2 and 6."
human_verification:
  - test: "UAT 11. Open Settings (Discogs connected). Below Preferred country there is a box called Fallback country. Type germany in it and click somewhere else. Then empty the box and click somewhere else. Then type canada and click somewhere else. Finally type us and click somewhere else."
    expected: "The box starts as US. After germany it shows Germany and a pop-up says 'Fallback country set to Germany'. The empty box says 'Enter a country, such as US.' and nothing is saved. After canada a note appears under the box: 'Same as the preferred country, so bulk import goes straight to the top match.' After us it shows US, the pop-up says 'Fallback country set to US', and the note goes away. Preferred country stays Canada the whole time."
    why_human: "Saving when you click away, the pop-ups and the note can only be seen in a browser"
  - test: "UAT 12. Open the review page (Spines) and make the window as narrow as a phone. Look at the row of status tabs at the top (All, Pending, Matched, Imported, Not found, Not on Discogs, Failed). Click Failed. Then make the window wide again."
    expected: "At phone width all seven tabs are fully visible with their numbers, spread over two or three lines. Nothing is cut off on the right and the page does not scroll sideways. Clicking Failed shows the failed list. On a wide screen the tabs sit on one line."
    why_human: "Whether the tabs fit at a real phone width can only be judged by looking"
  - test: "UAT 13. With Fallback country set to US, select a few spines you have not imported yet, including Massive Attack if it is still there and at least one whose top match is not from Canada. Click Import, read the dialog, click Start import and wait until it finishes."
    expected: "The dialog says each top match is swapped for its Canadian CD pressing, or else its US CD pressing, and that the top match is added as is only if Discogs lists neither. While it runs, cards say 'Looking for the Canadian or US pressing…'. Afterwards, a spine with no Canadian CD but a US one shows 'Fallback: US' and the line 'No Canadian pressing, used US'. A spine with neither shows 'Fallback: {its country}' and 'No Canadian or US pressing, used {its country}'. Massive Attack no longer lands on Hong Kong if Discogs lists a US CD for it. Canadian ones still show the Canada pin badge."
    why_human: "Needs your real Discogs account and real albums, and the wording can only be seen in a browser"
  - test: "UAT 14. Open the demo site, go to the review page, click Select all shown, then Import, then Start import, and wait for it to finish. Find the Guttermouth 'Live From The Pharmacy' card and the Massive Attack '100th Window' card."
    expected: "The Guttermouth card shows 'Fallback: US' and 'No Canadian pressing, used US'. The Massive Attack card shows 'Fallback: Hong Kong' and 'No Canadian or US pressing, used Hong Kong'. While it runs, cards say 'Looking for the Canadian or US pressing…'. Nothing asks you to sign in to Discogs."
    why_human: "The demo run can only be watched in a browser"
---

# Phase 6: Bulk Canada auto-import with compact review cards Verification Report

**Phase Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match without verifying hundreds one by one. Compact cards, multi-select, and a bulk action that resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds them through the existing rate-limited queue.
**Verified:** 2026-10-26T08:38:06Z (stale-fingerprint re-check at acb7018; the verdict from 2026-10-26T00:00:23Z is unchanged)
**Status:** human_needed
**Re-verification:** Yes. The report went stale only because Phase 07 (restyle) edited covered files.

## Re-verification Note (2026-10-26T08:59:26Z): Phase 07 review fix WR-03

Commit a738509 only adds a required `step` prop to `DiscogsCard` (the corner number now reads `step`; both settings pages pass `step={2}`; the test adds `step: 2`). Country fields, copy, test ids and props are unchanged. `tsc` exits 0 and `preferred-country-field.test.ts` passes 26/26. The verdict is unchanged.

## Re-verification Note (2026-10-26T08:38:06Z): Phase 07 restyle

`git diff 88a340f HEAD` (88a340f is the last refresh of this report) over the 107 covered implementation files changes 9 files. Every hunk adds presentation only. Nothing is removed or rewritten:

| File | Phase 7 change | Phase 6 must-haves checked |
| --- | --- | --- |
| `compact-spine-card.tsx` | `variant="mini"` plus a `CornerNumeral` | `data-spine-card`, `id`, checkbox, badges, top match, `orphaned && 'border-warning/60'` all kept. `.card-mini` is in `@layer components`, so the utility warning border still wins (tests at `compact-spine-card.test.ts:577,649`). |
| `spine-card.tsx` | `featured` prop (mini or featured surface), lg `CornerNumeral`, `font-prose` on the orphan text | `ORPHAN_EXPLANATION`, `data-spine-card`, `spine-card-{id}` id and the footer are unchanged |
| `photo-section.tsx` | `featured={trailing !== undefined}` (only the expanded compact card), `##` before the photo file name | The grid is still `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (line 105). `col-span-full` expansion is unchanged. |
| `spines-view.tsx` | Gradient `Spines` title, `>` before the counts line | Counts copy is unchanged |
| `bulk-import-bar.tsx` | `border bg-card shadow-sm` changed to `card-featured` | Still `sticky bottom-4 z-30` with an opaque `var(--card)` fill. Copy and logic are unchanged. |
| `discogs-card.tsx` | `variant="mini"`, numeral 2, `##` title, `font-prose` on two paragraphs | Copy, `FallbackCountryField` after Preferred country, and links are unchanged |
| `settings/page.tsx`, `page.demo.tsx` | Gradient title, `>` intro, mini cards with numerals 3/4, `##` titles | Props such as `preferredCountry` and `fallbackCountry` are still passed |
| `compact-spine-card.test.ts` | +188 lines, 0 deleted | No Phase 6 assertion was removed |

`MdPrefix` and `CornerNumeral` are `aria-hidden`, `select-none` and (for the numeral) `pointer-events-none`. Accessible names, copied text and clicks are unchanged. The new `overflow-hidden` on mini/featured cards clips nothing that matters: tooltips, dropdowns and dialogs render in portals, and the checkbox hit area (`-inset-2`) sits inside the card's `p-4` padding.

## Goal Achievement

The goal is achieved in code, and the Phase 7 restyle did not regress it. Evidence the verifier produced on this pass:

- Full suite run once: 128 files, 2448 tests passed. `tsc --noEmit` exits 0. `biome check` is clean (698 files).
- `verify.artifacts` and `verify.key-links` pass for all 18 plans (47/47 artifacts, 33/33 links).
- Carried from the 2026-10-26T00:00:23Z pass, whose server code is untouched since: the live-stack proof `scripts/verify-bulk-import.ts` exited 0. It showed the fallback tier, exactly one US request, requests at least 1111 ms apart, a 409 on a second start, and add-once after a SIGKILL restart.

### Observable Truths (grouped by plan; 120 total)

| Plan | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 06-01..06-12 | 81/90 | Regression check: unchanged | Covered by the suite and the live proof. The 8 backstop truths in 06-04, 06-06, 06-07, 06-08 and 06-09 were passed by the owner in UAT 1-10. 1 truth is present but behavior-unverified (see frontmatter). 06-07 grid breakpoints and the 8-card skeleton (`loading.tsx:21`) are unchanged. |
| 06-13 pressing fallback tier | 6/6 | VERIFIED | `pressing.ts` was not touched by Phase 7 |
| 06-14 Fallback country setting | 5/6 | 5 VERIFIED, 1 human (UAT 11) | The field is still rendered after Preferred country in `discogs-card.tsx`. The markup-order test passes. |
| 06-15 status tabs wrap | 2/3 | 2 VERIFIED, 1 human (UAT 12) | `review-status-filter.tsx` was not changed since the last pass |
| 06-16 job + run snapshot | 5/5 | VERIFIED | Server code was not touched |
| 06-17 demo tier | 4/4 | VERIFIED | Demo ops were not touched |
| 06-18 copy and read models | 6/6 | VERIFIED | `bulk-copy.ts` and both read models were not touched. The bar still passes `fallbackCountry` to the dialog. |

**Score:** 109/120 verified. 1 truth is present but behavior-unverified. 10 are routed to human checks: 8 backstops already passed in UAT 1-10, plus the 2 still pending as UAT 11 and 12.

**Deviation, accepted as intended (carried):** 06-16 truth 4 ("the second request fails exactly like the first") was changed on purpose by review fixes 7537da1 and 5bb5a4a. An optional fallback request that hits a 4xx, a bad body, or a last-attempt 5xx now imports the top match as `fallback_country_unchecked`. The shared gate and the single `discogsFetch` site still hold. Counted as VERIFIED.

### Prohibitions (06-02)

All three are still RESOLVED: the bulk path never passes `allowDuplicate`; `imports/store.ts` is the only `add_to_collection` enqueue site (the static guard test passes); pressing candidates stay hidden.

### Required Artifacts

47/47 pass `verify.artifacts` across the 18 plans. The restyled components are still exists, substantive and wired: `CompactSpineCard` and `SpineCard` are rendered by `photo-section.tsx`, `BulkImportBar` by `spines-view.tsx`, and `DiscogsCard` by both settings pages.

### Key Link Verification

33/33 declared links pass. These include bar -> dialog `fallbackCountry`, field -> `saveFallbackCountry`, route -> `getFallbackCountry`, and job -> `needsFallbackLookup`.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| BulkStatusLine | `item.fallbackCountry` | `bulk_runs.fallback_country` | Yes | FLOWING |
| BulkImportDialog | `data.discogs.fallbackCountry` | `getFallbackCountry()` in GET /api/spines | Yes | FLOWING |
| FallbackCountryField | `initialCountry` | `getFallbackCountry()` on /settings, demo `view.fallbackCountry` | Yes | FLOWING (props still passed after the restyle) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite | `node_modules/.bin/vitest run` (once) | 128 files, 2448 tests passed | PASS |
| Types | `tsc --noEmit` | exit 0 | PASS |
| Lint | `biome check .` | 698 files, clean | PASS |
| Artifacts / links | `verify.artifacts`, `verify.key-links` x18 | 47/47, 33/33 | PASS |

### Probe Execution

No probes are declared, so Step 7c does not apply.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
| --- | --- | --- | --- |
| BULK-01 compact card + grid | 06-07, 06-08, 06-15 | SATISFIED | Grid breakpoints unchanged; phone-width tab wrap is UAT 12 |
| BULK-02 expand in place | 06-07 | SATISFIED | Featured surface only on the expanded card; poll survival still behavior-unverified |
| BULK-03 Compact/Detailed toggle | 06-07 | SATISFIED | Unchanged |
| BULK-04 select + eligibility | 06-01, 06-04, 06-09 | SATISFIED | Checkbox is still first in the card header |
| BULK-05 dialog + start route | 06-06, 06-09, 06-18 | SATISFIED | Unchanged |
| BULK-06 lookup job | 06-01, 06-02, 06-10, 06-13, 06-16 | SATISFIED | Server code untouched |
| BULK-07 fallback recorded | 06-01, 06-02, 06-08, 06-13, 06-16, 06-17, 06-18 | SATISFIED | Unchanged |
| BULK-08 local duplicates | 06-02, 06-08, 06-10 | SATISFIED | Unchanged |
| BULK-09 preferred and fallback country | 06-03, 06-14, 06-16 | SATISFIED | Settings props intact; UAT 11 pending |
| BULK-10 fallback filter, progress, toast | 06-04, 06-09, 06-12 | SATISFIED | Bar copy unchanged |
| BULK-11 failure/retry/recovery | 06-04, 06-05, 06-06, 06-10 | SATISFIED | Unchanged |
| BULK-12 demo | 06-06, 06-11, 06-14, 06-17, 06-18 | SATISFIED | Demo settings page got the same restyle; props intact; UAT 14 pending |

All 12 IDs are claimed by at least one plan. There is no `.planning/REQUIREMENTS.md`; the IDs come from 06-RESEARCH.md. No IDs are orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/lib/bulk-copy.ts` | 222-223 | `fallbackLine` `default` case without an exhaustiveness guard (06-REVIEW IN-01, carried) | Info | A future outcome would silently get the generic line |
| 06-CONTEXT D-01 / COVERAGE.md | n/a | Still say "one Discogs read per spine"; the gated second GET is deliberate (carried) | Info | The docs lag the code |

The 9 restyled files (plus `md-prefix.tsx`, `corner-numeral.tsx`, `ui/card.tsx`) have no TBD, FIXME, XXX, TODO or HACK markers.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

The 4 checks in the frontmatter are UAT 11-14 in 06-UAT.md, which are still pending. UAT 1-10 were already settled by the owner, so they are not repeated. Test 9's issue was fixed by 06-15, and UAT 12 re-checks it.

### Gaps Summary

There are no gaps. The Phase 7 restyle changed only surfaces, fonts, numerals and decorative prefixes. All Phase 6 copy, test ids, layout breakpoints and behavior are intact, and the suite proves it. What remains is the owner's 4 pending checks.

---

_Verified: 2026-10-26T08:38:06Z_
_Verifier: Claude (gsd-verifier)_
