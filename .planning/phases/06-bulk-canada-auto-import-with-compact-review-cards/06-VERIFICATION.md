---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
verified: 2026-10-27T03:21:36Z
status: human_needed
score: 128/129 must-haves verified
covered_files: [".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-19-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-19-SUMMARY.md","demo/fixtures/pressings.json","drizzle/0004_bulk_import.sql","drizzle/0005_bulk_fallback_country.sql","drizzle/meta/0004_snapshot.json","drizzle/meta/0005_snapshot.json","drizzle/meta/_journal.json","scripts/verify-bulk-import.ts","src/app/api/spines/[id]/retry/route.test.ts","src/app/api/spines/[id]/retry/route.ts","src/app/api/spines/bulk-import/route.test.ts","src/app/api/spines/bulk-import/route.ts","src/app/api/spines/retry-failed/route.test.ts","src/app/api/spines/route.ts","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/page.demo.tsx","src/app/settings/page.tsx","src/app/spines/loading.tsx","src/app/spines/page.demo.tsx","src/app/spines/page.tsx","src/components/bulk-import-bar.tsx","src/components/bulk-import-dialog.test.ts","src/components/bulk-import-dialog.tsx","src/components/bulk-status-line.tsx","src/components/card-layout-toggle.tsx","src/components/compact-spine-card.test.ts","src/components/compact-spine-card.tsx","src/components/confirmed-match.tsx","src/components/country-badge.tsx","src/components/discogs-card.tsx","src/components/discogs-matches.test.ts","src/components/discogs-matches.tsx","src/components/expanded-cards.tsx","src/components/fallback-filter-toggle.tsx","src/components/import-state-badge.tsx","src/components/photo-section.tsx","src/components/preferred-country-field.test.ts","src/components/preferred-country-field.tsx","src/components/review-status-filter.test.ts","src/components/review-status-filter.tsx","src/components/spine-card.tsx","src/components/spine-selection.tsx","src/components/spines-filter-bar.test.ts","src/components/spines-filter-bar.tsx","src/components/spines-view.test.ts","src/components/spines-view.tsx","src/components/top-match-row.tsx","src/components/ui/checkbox.tsx","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/read.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/bulk-copy.test.ts","src/lib/bulk-copy.ts","src/lib/bulk-eligibility.test.ts","src/lib/bulk-eligibility.ts","src/lib/bulk-selection.test.ts","src/lib/bulk-selection.ts","src/lib/bulk-types.ts","src/lib/bulk-view.test.ts","src/lib/bulk-view.ts","src/lib/discogs-types.ts","src/lib/pressing.test.ts","src/lib/pressing.ts","src/lib/review-status.test.ts","src/lib/review-status.ts","src/lib/scan-types.ts","src/lib/spine-review.test.ts","src/server/bulk/picks.ts","src/server/bulk/queries.test.ts","src/server/bulk/queries.ts","src/server/bulk/recovery.test.ts","src/server/bulk/recovery.ts","src/server/bulk/store.test.ts","src/server/bulk/store.ts","src/server/db/migrations.test.ts","src/server/db/schema.ts","src/server/discogs/client.test.ts","src/server/discogs/queries.test.ts","src/server/discogs/queries.ts","src/server/discogs/status.test.ts","src/server/discogs/status.ts","src/server/discogs/store.ts","src/server/discogs/versions.test.ts","src/server/discogs/versions.ts","src/server/imports/store.test.ts","src/server/imports/store.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/resolve-pressing.test.ts","src/server/jobs/handlers/resolve-pressing.ts","src/server/scan/queries.test.ts","src/server/scan/queries.ts","src/server/settings.test.ts","src/server/settings.ts","test/fixtures/discogs/master-versions-bogus.json","test/fixtures/discogs/master-versions-canada.json","test/fixtures/fake-discogs.mjs","test/helpers/bulk-seed.ts"]
covered_digest: "v3:sha256:01f794ee1eb5baee4ed47985a92428de55d716e353d9d1d1ddfcc71a19a5dc0a"
behavior_unverified: 1
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
  previous_status: gaps_found
  previous_score: 127/129
  gaps_closed:
    - "06-UI-SPEC.md records the new compact card layout, and 07-UI-SPEC.md points to it for the dropped compact-card numeral (329b2c9: superseding five-row amendment, 07 pointer fixed, JSDoc in compact-spine-card, top-match-row, import-state-badge, bulk-status-line and spine-card brought in line)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "An expanded card stays expanded across polls and filter refetches while it stays in the list (06-07)"
    test: "Open a card with the pencil while a bulk import or a Discogs search is running, type something in a field, and wait a few seconds for the page to refresh itself"
    expected: "The card stays open and the typed text is still there"
    why_human: "Carried from the prior report. ExpandedCardsProvider sits above the polled list (spines-view.tsx:611) and keepPreviousData (spines-view.tsx:407) keeps the tree mounted, so it should survive. But no test drives a real refetch with a card open, and no UAT step (2, 6 or 15) held a card open during a poll."
human_verification:
  - test: "Open a card with the pencil while a bulk import or a Discogs search is running, type something in a field, and wait a few seconds for the page to refresh itself"
    expected: "The card stays open and the typed text is still there"
    why_human: "No test or UAT step exercises an open card across a background refetch; presence of the provider above the polled list is not proof."
---

# Phase 6: Bulk Canada auto-import with compact review cards Verification Report

**Phase Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match without verifying hundreds one by one. Compact cards, multi-select, and a bulk action that resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds them through the existing rate-limited queue.
**Verified:** 2026-10-27T03:21:36Z
**Status:** human_needed
**Re-verification:** Yes. It follows the docs-only gap closure in 329b2c9, after the gaps_found report in 0f87573.

## Goal Achievement

The one failing must-have (documentation drift) is closed. The only change since 0f87573 is 329b2c9, which touched 3 planning docs and JSDoc in 5 components, with no code changes. Every claim in the new docs was checked against the code:

| Doc claim (06-UI-SPEC amendment, JSDoc) | Code | Match |
| --- | --- | --- |
| Five rows on `row-span-5 grid-rows-subgrid` | `compact-spine-card.tsx` Card className | Yes |
| Top row `h-9`: checkbox, Imported pill (`CircleCheck`), pencil | `data-compact-row="select"` | Yes |
| Label row `h-5`: label plus `Disc3` and count, sr-only words | `data-compact-row="label"`, `candidatesLabel` | Yes |
| Match `min-h-12`; title `line-clamp-2` with nothing reserved; details one line | `data-compact-row="match"`; `top-match-row.tsx` has no `h-[2lh]` on the title | Yes |
| Bottom row `min-h-12`, pill order: state, worst-field, country, orphan, Edited, note | `data-compact-row="warnings"` child order | Yes |
| Note pill: one truncated line, fallback drops `, used {country}`, full text on hover | `bulk-status-line.tsx` `clamp` branch, `line.short` (`bulk-copy.ts:315`) | Yes |
| The skipped note names the photo, never a number | `bulk-copy.ts:233-238` | Yes |
| No numbering on compact, expanded or Detailed cards | No `CornerNumeral` in any spine card; `spine-card.tsx` uses `number` only for the crop alt | Yes |
| Focus order: checkbox, pencil, crop link, Open Settings / Retry | DOM order of the rows | Yes |
| 07-UI-SPEC pointer: no review card keeps a numeral | 07-UI-SPEC line 448 | Yes |

Evidence produced on this pass:
- Full suite, run once (`npx vitest run`): 129 files, 2476 tests passed. `npx tsc --noEmit` exits 0. `npx biome check`: 699 files, no issues.
- `verify.artifacts` and `verify.key-links` across all 19 plans: 51/51 and 36/36.
- No server, demo, DB or script file changed, so the live-stack proof (`scripts/verify-bulk-import.ts`, exit 0) and UAT 1-15 carry forward.

### Observable Truths (129 total)

| Plan | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 06-01..06-12 | 89/90 | 87 VERIFIED, 2 PASSED (override), 1 behavior-unverified | The suite plus the live proof. The 8 backstop truths (06-04, 06-06..06-09) count on the owner's direct observation in UAT 1-10. The overrides are the 06-07 compact contents and the 06-08 skipped copy. |
| 06-13 pressing fallback tier | 6/6 | VERIFIED | `pressing.ts` untouched |
| 06-14 Fallback country setting | 6/6 | VERIFIED | UAT 11 |
| 06-15 status tabs wrap | 3/3 | VERIFIED | UAT 12 |
| 06-16 job + run snapshot | 5/5 | VERIFIED | Server untouched; the accepted fallback-request deviation is carried |
| 06-17 demo tier | 4/4 | VERIFIED | UAT 14 |
| 06-18 copy and read models | 6/6 | VERIFIED | bulk-copy.test passes; UAT 13, 14 |
| 06-19 compact card (G-06-side-2) | 9/9 | 4 VERIFIED, 5 PASSED (override) | Truth 9 (06-UI-SPEC records the layout and 07-UI-SPEC points to it) is now VERIFIED, per the table above. Truths 1, 2 and 7 hold as before. Truths 3-6 and 8 are carried as overrides. |

**Score:** 128/129 verified (121 VERIFIED + 7 PASSED by owner override). 1 truth is present but behavior-unverified. None failed.

**Override note:** All 7 overrides trace to one owner decision, recorded in 06-UAT.md G-06-side-2 followups 1-9 and approved in UAT 15.

### Prohibitions (06-02)

All three are still RESOLVED and untouched. The bulk path never passes `allowDuplicate`. `imports/store.ts` is the only `add_to_collection` enqueue site (the guard test passes). Pressing candidates stay hidden.

### Required Artifacts

51/51 pass `verify.artifacts`, and the wiring is unchanged from the prior report.

### Key Link Verification

36/36 pass. The 06-19 `via` text still says row-span-6 and h-15. That is Info only: the plan frontmatter wording is stale history, and the wiring is real.

### Data-Flow Trace (Level 4)

Unchanged. The candidate count, the note pill (`line.short` / `line.text`) and the fallback country all flow from real read models.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite (once) | `npx vitest run` | 129 files, 2476 tests | PASS |
| Types | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx biome check` | 699 files, no issues | PASS |
| Artifacts / links | `verify.artifacts`, `verify.key-links` x19 | 51/51, 36/36 | PASS |

### Probe Execution

No probes are declared. Step 7c does not apply.

### Requirements Coverage

BULK-01 to BULK-12 are all SATISFIED, as in the prior report (BULK-02 poll survival is behavior-unverified; see below). No IDs are orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/lib/bulk-copy.ts` | 222-223 | The `fallbackLine` `default` case has no exhaustiveness guard (carried, IN-01) | Info | A future outcome would get the generic line |
| 06-19-PLAN.md | key_links | The `via` text says row-span-6 / h-15 | Info | Historical wording only |

The four JSDoc warnings and the 06-UAT `issues: 2` bookkeeping item are resolved. The files changed in 329b2c9 contain no TBD, FIXME, XXX, TODO or HACK markers.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

#### 1. An open card survives a background refresh

**Test:** Open a card with the pencil while a bulk import or a Discogs search is running, type something in a field, and wait a few seconds for the page to refresh itself.
**Expected:** The card stays open and the typed text is still there.
**Why human:** This item was already reported as behavior-unverified and kept out of the score last time. The gap hid it then. With the gap closed, it is the only thing between this phase and `passed`. The code looks right: the provider sits above the polled list and `keepPreviousData` keeps the tree mounted. But no test or UAT step held a card open through a refetch. The fix is one quick check by the owner, or a test that renders the list, opens a card and drives a refetch.

### Gaps Summary

None. The docs-drift gap is closed, and the docs match the shipped card. The phase stays at `human_needed` only for the one carried, behavior-unverified check above.

---

_Verified: 2026-10-27T03:21:36Z_
_Verifier: Claude (gsd-verifier)_
