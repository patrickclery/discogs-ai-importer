---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
verified: 2026-10-27T03:46:26Z
status: gaps_found
score: 130/131 must-haves verified
covered_files: [".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-19-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-19-SUMMARY.md","demo/fixtures/pressings.json","drizzle/0004_bulk_import.sql","drizzle/0005_bulk_fallback_country.sql","drizzle/meta/0004_snapshot.json","drizzle/meta/0005_snapshot.json","drizzle/meta/_journal.json","package.json","scripts/verify-bulk-import.ts","src/app/api/spines/[id]/retry/route.test.ts","src/app/api/spines/[id]/retry/route.ts","src/app/api/spines/bulk-import/route.test.ts","src/app/api/spines/bulk-import/route.ts","src/app/api/spines/retry-failed/route.test.ts","src/app/api/spines/route.ts","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/page.demo.tsx","src/app/settings/page.tsx","src/app/spines/loading.tsx","src/app/spines/page.demo.tsx","src/app/spines/page.tsx","src/components/bulk-import-bar.tsx","src/components/bulk-import-dialog.test.ts","src/components/bulk-import-dialog.tsx","src/components/bulk-status-line.tsx","src/components/card-layout-toggle.tsx","src/components/compact-spine-card.test.ts","src/components/compact-spine-card.tsx","src/components/confirmed-match.tsx","src/components/country-badge.tsx","src/components/discogs-card.tsx","src/components/discogs-matches.test.ts","src/components/discogs-matches.tsx","src/components/expanded-card-refetch.test.ts","src/components/expanded-cards.tsx","src/components/fallback-filter-toggle.tsx","src/components/import-state-badge.tsx","src/components/photo-section.tsx","src/components/preferred-country-field.test.ts","src/components/preferred-country-field.tsx","src/components/review-status-filter.test.ts","src/components/review-status-filter.tsx","src/components/spine-card.tsx","src/components/spine-selection.tsx","src/components/spines-filter-bar.test.ts","src/components/spines-filter-bar.tsx","src/components/spines-view.test.ts","src/components/spines-view.tsx","src/components/top-match-row.tsx","src/components/ui/checkbox.tsx","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/read.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/bulk-copy.test.ts","src/lib/bulk-copy.ts","src/lib/bulk-eligibility.test.ts","src/lib/bulk-eligibility.ts","src/lib/bulk-selection.test.ts","src/lib/bulk-selection.ts","src/lib/bulk-types.ts","src/lib/bulk-view.test.ts","src/lib/bulk-view.ts","src/lib/discogs-types.ts","src/lib/pressing.test.ts","src/lib/pressing.ts","src/lib/review-status.test.ts","src/lib/review-status.ts","src/lib/scan-types.ts","src/lib/spine-review.test.ts","src/server/bulk/picks.ts","src/server/bulk/queries.test.ts","src/server/bulk/queries.ts","src/server/bulk/recovery.test.ts","src/server/bulk/recovery.ts","src/server/bulk/store.test.ts","src/server/bulk/store.ts","src/server/db/migrations.test.ts","src/server/db/schema.ts","src/server/discogs/client.test.ts","src/server/discogs/queries.test.ts","src/server/discogs/queries.ts","src/server/discogs/status.test.ts","src/server/discogs/status.ts","src/server/discogs/store.ts","src/server/discogs/versions.test.ts","src/server/discogs/versions.ts","src/server/imports/store.test.ts","src/server/imports/store.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/resolve-pressing.test.ts","src/server/jobs/handlers/resolve-pressing.ts","src/server/scan/queries.test.ts","src/server/scan/queries.ts","src/server/settings.test.ts","src/server/settings.ts","test/fixtures/discogs/master-versions-bogus.json","test/fixtures/discogs/master-versions-canada.json","test/fixtures/fake-discogs.mjs","test/helpers/bulk-seed.ts"]
covered_digest: "v3:sha256:10ec3d912fbbcd8153efb3ca0d72053819eb2a8cc441b06a3c297581fec976c5"
behavior_unverified: 0
overrides_applied: 7
overrides:
  - must_have: "By default /spines shows compact cards: #n, worst-field, edited and orphan badges, the state badge, the spine crop, and directly below it the top match with a 48px cover, artist – title, and year · country · catno (D-10, D-16)"
    reason: "Owner redesign in UAT (G-06-side-2 and followups 1-9): no #n anywhere on the card, and a Top match / Confirmed match label row sits between the crop and the match. Every other element is still on the card."
    accepted_by: "Patrick Clery (owner, 06-UAT.md G-06-side-2 followups; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
  - must_have: "A skipped duplicate shows 'Already imported from spine #{m}', naming the other photo when it differs, and no import is created (D-09)"
    reason: "With no spine numbers on screen anywhere (G-06-side-2 followup 1), 'spine #m' points at nothing visible. Review fix WR-02 (8d2902b) now names the other spine's photo. The 06-UI-SPEC copy row was updated to match. No import is created, as before."
    accepted_by: "Patrick Clery (owner, G-06-side-2 no-numbering decision; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
  - must_have: "The checkbox shares its row with the 'Top match' / 'Confirmed match' label and the pencil, and never has a row to itself (BULK-04)"
    reason: "Followup 5: the owner moved the match label below the crop. The checkbox now shares the top row with the Imported pill and the pencil, so it still never has a row to itself."
    accepted_by: "Patrick Clery (owner, G-06-side-2 followups 5-6; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
  - must_have: "The status badge (N candidates, Imported, Waiting to import, Already in your collection and the rest) has its own row and is never cut off at the card's edge"
    reason: "Followups 2, 4, 6 and 8: the owner dropped the N candidates badge (now a disc icon with the count on the label row), put Imported as a pill on the top row, and put the other state badges with the warning pills at the bottom. The never-cut-off part still holds (max-w-full and whitespace-normal on the badges)."
    accepted_by: "Patrick Clery (owner, G-06-side-2 followups 2/4/6/8; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
  - must_have: "Warning badges (Check … · N%, Hard to read, Fallback: X or the country, No longer detected, Edited · N) sit on their own warnings line. That line is always there, even when empty, and never shares a row with the checkbox or the status badge (D-16, BULK-07)"
    reason: "Followups 3, 7 and 8: the owner asked for every status and warning pill, plus the import note, on one bottom row. That row is always rendered with two lines reserved and never shares a row with the checkbox."
    accepted_by: "Patrick Clery (owner, G-06-side-2 followups 3/7/8; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
  - must_have: "Every compact card has the same six rows in the same order, and the cards in a grid row line up: same row heights, so the spine photos, checkbox rows and matches start at the same height. The match title is always two lines tall and the details one line, with the full text on hover. The import-notes line always keeps two lines of space (BULK-01)"
    reason: "The final owner-approved card has five rows (select, crop, label, match, warnings) on a row-span-5 subgrid, so cards still line up row by row. Followup 9: the title no longer reserves a second line (it still clamps at two), and the match row is at least the thumbnail height (min-h-12)."
    accepted_by: "Patrick Clery (owner, G-06-side-2 followups 4-9; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
  - must_have: "The Detailed layout and the expanded card are unchanged: they keep their #N label and big corner number"
    reason: "Followup 1: the owner reported that the opened card still showed #3 and the corner number, so numbering was removed from SpineView (opened and Detailed cards) in c154409."
    accepted_by: "Patrick Clery (owner, G-06-side-2 followup 1; UAT 15 pass)"
    accepted_at: "2026-10-27T03:10:35Z"
re_verification:
  previous_status: human_needed
  previous_score: 128/129
  gaps_closed:
    - "An expanded card stays expanded across polls and filter refetches while it stays in the list (06-07): now proven by src/components/expanded-card-refetch.test.ts (5456821)"
  gaps_remaining: []
  regressions:
    - "06-19 truth 9 (06-UI-SPEC records the compact card layout): the G-06-side-2 amendment still describes the 48px cover and min-h-12 match row that followup_10 (5024fe4) replaced"
    - "npx biome check fails: the new test file is not formatted (introduced in 5456821)"
gaps:
  - truth: "06-UI-SPEC.md records the new compact card layout, and 07-UI-SPEC.md points to it for the dropped compact-card numeral"
    status: failed
    reason: "Followup_10 (5024fe4) made the match cover a full-width square with the title and details below it and dropped min-h-12 from the match row. The 06-UI-SPEC G-06-side-2 amendment (row 4) and the CompactSpineCard JSDoc still describe the old 48px cover layout."
    artifacts:
      - path: ".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-UI-SPEC.md"
        issue: "Line 494: 'Match, at least 48px (min-h-12, the cover height): TopMatchRow, a 48px cover, then the title...'. The code has no min-h-12 on data-compact-row=\"match\", and the cover is aspect-square w-full above the text."
      - path: "src/components/compact-spine-card.tsx"
        issue: "Lines 69-71 JSDoc: 'match: ... at least the 48px cover tall'. The row no longer has min-h-12, and the cover is full width."
    missing:
      - "Revise 06-UI-SPEC amendment row 4 for followup_10: a full-width square cover (Disc3 placeholder at size-10), then the title (line-clamp-2, nothing reserved) and the details (one line) below it, with no minimum height on the row"
      - "Update the CompactSpineCard JSDoc row 4 to match"
  - truth: "The demo's top match follows the same D-10 candidate order as the real app, including the preferred and then fallback country tier (G-06-side-3)"
    status: partial
    reason: "src/demo/read-model.ts candidatesOf, whose doc comment says it mirrors orderCandidates, still sorts auto candidates by catno match then Discogs rank only. In the demo a spine with Canada or US candidates can still show another country as its top match."
    artifacts:
      - path: "src/demo/read-model.ts"
        issue: "candidatesOf (lines 262-298) has no country tier, and the doc comments at lines 148 and 263-265 now misdescribe orderCandidates"
    missing:
      - "Add the preferred, then fallback, country tier to candidatesOf, using the demo settings, with a demo read-model test"
  - truth: "The lint gate is clean (npx biome check)"
    status: partial
    reason: "5456821 added src/components/expanded-card-refetch.test.ts without formatting it. npx biome check: 700 files, 1 error (format, line 269)."
    artifacts:
      - path: "src/components/expanded-card-refetch.test.ts"
        issue: "The expect(JSON.parse(...)).toEqual({ call at line 269 exceeds the formatter's line width"
    missing:
      - "Run npx biome check --write on the file"
---

# Phase 6: Bulk Canada auto-import with compact review cards Verification Report

**Phase Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match, without verifying hundreds one by one. It covers compact cards, multi-select, and a bulk action. The bulk action resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds them through the existing rate-limited queue.
**Verified:** 2026-10-27T03:46:26Z
**Status:** gaps_found
**Re-verification:** Yes. It follows 9b9c79c, 5024fe4, 6c69638 and 5456821, after the human_needed report in 005fdcc.

## Goal Achievement

The bulk import goal still holds in code, and the last human item is now covered by a real test. The phase is held at `gaps_found` because followup_10 changed the compact card's match row and the 06-UI-SPEC amendment and the CompactSpineCard JSDoc were not updated (docs drift, which you asked to report as a gap). There are two smaller gaps: the demo did not get the G-06-side-3 country order, and the new test file fails `biome check`.

### What changed since 005fdcc

| Commit | Change | Verified |
| --- | --- | --- |
| 9b9c79c (G-06-side-3) | `orderCandidates` now ranks auto candidates by catno match, then the preferred country, then the fallback country, then Discogs rank. The countries are read from `settings` at query time (defaults Canada / US). | Yes. The `queries.test.ts` test "puts the preferred country first, then the fallback country, after catno matches" passes, including when the settings change. `discogsForSpines` and `listCandidates` both pass `countryPrefs(db)`. |
| 5024fe4 (followup_10) | `TopMatchRow` is now `flex-col`. The cover is `aspect-square w-full` (Disc3 `size-10` placeholder) with the text below it. `min-h-12` is dropped from the match row. | Yes, in code and in the `compact-spine-card.test.ts` "match cover spans the card width". **The docs are not updated** (see Gaps). |
| 5456821 | `expanded-card-refetch.test.ts` (happy-dom) mounts the real `SpinesView`, opens a card with the pencil, types into the artist field, and forces a real `['spines']` refetch with changed data. It checks that the card stays open, the same input stays connected with the typed text, and blur PATCHes the typed value. | Yes. It passes in the full run. It is substantive: it asserts that a fetch happened and that the new data reached the cache. |
| 6c69638 | 06-UAT completed: 16 tests, 14 pass, 1 issue (test 9, gap G-06-9, resolved by 06-15), 1 skipped (test 16, reason: "to be covered by an automated test that holds a card open through a refresh"). | The skip reason points at 5456821, which delivers that test. |

### Doc vs code after followup_10

| Doc claim | Code | Match |
| --- | --- | --- |
| `top-match-row.tsx` JSDoc: the full-width square cover, the title below it (clamped at two, nothing reserved), the details on one line | `flex flex-col gap-2`, `aspect-square w-full`, `line-clamp-2`, `line-clamp-1 h-[1lh]` | Yes |
| 06-UI-SPEC amendment row 4: "Match, at least 48px (`min-h-12`, the cover height): `TopMatchRow`, a 48px cover, then the title…" | No `min-h-12` on `data-compact-row="match"`. The cover is full width, above the title. | **No** |
| `compact-spine-card.tsx` JSDoc row 4: "at least the 48px cover tall" | Same as above | **No** |
| 06-UI-SPEC lines 91, 126, 133, 139 (48px thumb, `size-12`, 232px content column) | Superseded rows. The amendment says "The earlier rows are left as written for history." | Info (history) |
| Amendment rows 1-3 and 5, the line-up rule, the edit button, focus order | Unchanged by 5024fe4 | Yes |
| `queries.ts` JSDoc for the D-10 order with the country tier | Matches `orderCandidates` | Yes |
| `src/demo/read-model.ts:148, 263-265`: "mirrors orderCandidates: manual, catno, Discogs order" | The server now has a country tier and the demo does not | **No** (gap 2) |

### Observable Truths (131 total)

| Plan / source | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 06-01..06-12 | 90/90 | 88 VERIFIED, 2 PASSED (override) | The 06-07 "expanded card stays expanded across polls and filter refetches" truth is now VERIFIED. The poll path is driven by `expanded-card-refetch.test.ts`. For the filter path, expansion is kept in `ExpandedCardsProvider` (keyed by spine id) above the list, which is the structure the test proves survives a refetch. The 8 backstop truths still count on the owner's direct observation in UAT 1-10. |
| 06-13 pressing fallback tier | 6/6 | VERIFIED | `pressing.ts` untouched |
| 06-14 Fallback country setting | 6/6 | VERIFIED | UAT 11 |
| 06-15 status tabs wrap | 3/3 | VERIFIED | UAT 12 |
| 06-16 job + run snapshot | 5/5 | VERIFIED | Server bulk path untouched |
| 06-17 demo tier | 4/4 | VERIFIED | UAT 14. The demo's candidate order is not one of its truths (see gap 2). |
| 06-18 copy and read models | 6/6 | VERIFIED | bulk-copy.test passes; UAT 13, 14 |
| 06-19 compact card (G-06-side-2) | 8/9 | 3 VERIFIED, 5 PASSED (override), **1 FAILED** | Truth 9 (06-UI-SPEC records the layout) **FAILED**: the amendment describes the pre-followup_10 match row. Truths 1, 2 and 7 hold. The overrides for truths 3-6 and 8 are carried. |
| G-06-side-3 (owner, UAT 16) | 1/1 | VERIFIED | The country tier test in `queries.test.ts` |
| G-06-side-2 followup_10 (owner, UAT 16) | 1/1 | VERIFIED | `compact-spine-card.test.ts` "the match cover spans the card width, with the title below it" |

**Score:** 130/131 verified (123 VERIFIED + 7 PASSED by owner override). 1 truth FAILED (docs drift). 0 are behavior-unverified.

**Override note:** All 7 overrides are carried verbatim. Two of the reasons (compact contents, "48px cover"; six rows, "min-h-12") now trail the code, because followup_10 enlarged the cover and dropped the match row's minimum height. Both changes are owner-directed and logged in 06-UAT.md, so the overrides still hold. Refresh their reasons when gap 1 is closed.

### Prohibitions (06-02)

All three are still RESOLVED. 9b9c79c touches only the candidate order in the read model. The bulk path still never passes `allowDuplicate`, `imports/store.ts` is still the only `add_to_collection` enqueue site, and pressing candidates stay hidden (`CANDIDATES_SQL` is unchanged).

### Required Artifacts

51/51 pass `verify.artifacts` across all 19 plans.

### Key Link Verification

36/36 pass `verify.key-links`. The 06-19 `via` text (row-span-6 / h-15) is still stale history (Info).

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| Compact card top match | `discogs.topCandidates[0]` | `orderCandidates(rows, countryPrefs(db))` over `discogs_candidates` plus `settings` | Yes | FLOWING |
| Demo compact card top match | `candidatesOf` | demo store, with no country tier | Yes, but in a different order from the real app | Gap 2 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite (once) | `npx vitest run` | 130 files, 2478 tests passed | PASS |
| Open card survives a refetch | included in the run above (`expanded-card-refetch.test.ts`) | pass | PASS |
| Country tier order | included in the run above (`queries.test.ts` G-06-side-3) | pass | PASS |
| Types | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx biome check` | 700 files, 1 format error in `expanded-card-refetch.test.ts:269` | FAIL |
| Artifacts / links | `verify.artifacts`, `verify.key-links` x19 | 51/51, 36/36 | PASS |

### Probe Execution

No probes are declared. Step 7c does not apply.

### Requirements Coverage

BULK-01 to BULK-12 are SATISFIED. BULK-02 (an open card survives polls) is now backed by a test. No IDs are orphaned.

### UAT Evidence (carried)

06-UAT.md `status: complete`, 16 tests: 14 pass, 1 issue (test 9, resolved by 06-15 and re-tested in UAT 12), 1 skipped (test 16, reason: "Owner skipped; to be covered by an automated test that holds a card open through a refresh"). The skip is satisfied by 5456821. Info: the 6c69638 commit subject says "15 passed, 1 skipped", but the file's summary block says `passed: 14, issues: 1, skipped: 1`. The file is the record.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `06-UI-SPEC.md` | 494 | Amendment describes a 48px cover and a `min-h-12` match row | Blocker (docs drift, gap 1) | The spec no longer matches the shipped card |
| `src/components/compact-spine-card.tsx` | 69-71 | JSDoc says "at least the 48px cover tall" | Warning (gap 1) | A stale comment |
| `src/demo/read-model.ts` | 148, 263-298 | Claims to mirror `orderCandidates` but has no country tier | Warning (gap 2) | The demo and the real app pick different top matches |
| `src/components/expanded-card-refetch.test.ts` | 269 | Biome format error | Warning (gap 3) | `biome check` is red |
| `src/lib/bulk-copy.ts` | 222-223 | `fallbackLine` `default` case has no exhaustiveness guard (carried, IN-01) | Info | |

No TBD, FIXME, XXX, TODO or HACK markers are in the files changed by the four commits.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

None. The one carried item (an open card survives a background refresh) is now proven by `src/components/expanded-card-refetch.test.ts`.

### Gaps Summary

1. **Docs drift after followup_10 (Blocker, 06-19 truth 9).** The 06-UI-SPEC G-06-side-2 amendment row 4 and the CompactSpineCard JSDoc still describe the 48px cover and `min-h-12` match row. The code now has a full-width square cover above the text, with no minimum height. `top-match-row.tsx`'s own JSDoc was updated and matches.
2. **Demo candidate order (Warning).** `src/demo/read-model.ts` `candidatesOf` lacks the G-06-side-3 country tier, and its comment still claims to mirror `orderCandidates`.
3. **Lint (Warning).** `npx biome check` fails on the new test file's formatting.

All three are small and share one cause: the UAT test 16 changes landed without their companion doc, demo and format updates. Nothing was edited during this verification.

---

_Verified: 2026-10-27T03:46:26Z_
_Verifier: Claude (gsd-verifier)_
