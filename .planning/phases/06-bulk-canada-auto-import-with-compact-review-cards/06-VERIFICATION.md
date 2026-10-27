---
phase: 06-bulk-canada-auto-import-with-compact-review-cards
verified: 2026-10-27T03:13:16Z
status: gaps_found
score: 127/129 must-haves verified
covered_files: [".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-01-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-02-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-03-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-04-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-05-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-06-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-07-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-08-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-09-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-10-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-11-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-12-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-13-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-14-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-15-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-16-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-17-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-18-SUMMARY.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-19-PLAN.md",".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-19-SUMMARY.md","demo/fixtures/pressings.json","drizzle/0004_bulk_import.sql","drizzle/0005_bulk_fallback_country.sql","drizzle/meta/0004_snapshot.json","drizzle/meta/0005_snapshot.json","drizzle/meta/_journal.json","scripts/verify-bulk-import.ts","src/app/api/spines/[id]/retry/route.test.ts","src/app/api/spines/[id]/retry/route.ts","src/app/api/spines/bulk-import/route.test.ts","src/app/api/spines/bulk-import/route.ts","src/app/api/spines/retry-failed/route.test.ts","src/app/api/spines/route.ts","src/app/settings/actions.test.ts","src/app/settings/actions.ts","src/app/settings/page.demo.tsx","src/app/settings/page.tsx","src/app/spines/loading.tsx","src/app/spines/page.demo.tsx","src/app/spines/page.tsx","src/components/bulk-import-bar.tsx","src/components/bulk-import-dialog.test.ts","src/components/bulk-import-dialog.tsx","src/components/bulk-status-line.tsx","src/components/card-layout-toggle.tsx","src/components/compact-spine-card.test.ts","src/components/compact-spine-card.tsx","src/components/confirmed-match.tsx","src/components/country-badge.tsx","src/components/discogs-card.tsx","src/components/discogs-matches.test.ts","src/components/discogs-matches.tsx","src/components/expanded-cards.tsx","src/components/fallback-filter-toggle.tsx","src/components/import-state-badge.tsx","src/components/photo-section.tsx","src/components/preferred-country-field.test.ts","src/components/preferred-country-field.tsx","src/components/review-status-filter.test.ts","src/components/review-status-filter.tsx","src/components/spine-card.tsx","src/components/spine-selection.tsx","src/components/spines-filter-bar.test.ts","src/components/spines-filter-bar.tsx","src/components/spines-view.test.ts","src/components/spines-view.tsx","src/components/top-match-row.tsx","src/components/ui/checkbox.tsx","src/demo/ops/bulk.test.ts","src/demo/ops/bulk.ts","src/demo/ops/imports.ts","src/demo/read-model.test.ts","src/demo/read-model.ts","src/demo/routes.ts","src/demo/routes/bulk.test.ts","src/demo/routes/bulk.ts","src/demo/routes/read.ts","src/demo/seed.ts","src/demo/settings-actions.test.ts","src/demo/settings-actions.ts","src/demo/store.ts","src/lib/bulk-copy.test.ts","src/lib/bulk-copy.ts","src/lib/bulk-eligibility.test.ts","src/lib/bulk-eligibility.ts","src/lib/bulk-selection.test.ts","src/lib/bulk-selection.ts","src/lib/bulk-types.ts","src/lib/bulk-view.test.ts","src/lib/bulk-view.ts","src/lib/discogs-types.ts","src/lib/pressing.test.ts","src/lib/pressing.ts","src/lib/review-status.test.ts","src/lib/review-status.ts","src/lib/scan-types.ts","src/lib/spine-review.test.ts","src/server/bulk/picks.ts","src/server/bulk/queries.test.ts","src/server/bulk/queries.ts","src/server/bulk/recovery.test.ts","src/server/bulk/recovery.ts","src/server/bulk/store.test.ts","src/server/bulk/store.ts","src/server/db/migrations.test.ts","src/server/db/schema.ts","src/server/discogs/client.test.ts","src/server/discogs/queries.test.ts","src/server/discogs/queries.ts","src/server/discogs/status.test.ts","src/server/discogs/status.ts","src/server/discogs/store.ts","src/server/discogs/versions.test.ts","src/server/discogs/versions.ts","src/server/imports/store.test.ts","src/server/imports/store.ts","src/server/jobs/handlers/index.ts","src/server/jobs/handlers/resolve-pressing.test.ts","src/server/jobs/handlers/resolve-pressing.ts","src/server/scan/queries.test.ts","src/server/scan/queries.ts","src/server/settings.test.ts","src/server/settings.ts","test/fixtures/discogs/master-versions-bogus.json","test/fixtures/discogs/master-versions-canada.json","test/fixtures/fake-discogs.mjs","test/helpers/bulk-seed.ts"]
covered_digest: "v3:sha256:2d381023bc8178a4a11c526564a4cbef522b8cccec3e39d17c0bd5dce6cc0031"
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
  previous_status: human_needed
  previous_score: 109/120
  gaps_closed:
    - "UAT 11-15 passed (the owner's human checks for 06-14, 06-15, 06-18 and 06-19)"
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "06-UI-SPEC.md records the new compact card layout, and 07-UI-SPEC.md points to it for the dropped compact-card numeral"
    status: failed
    reason: "The 06-UI-SPEC amendment 'gap closure (G-06-side-2, 06-19)' still describes the superseded six-row card. It specifies status row first, a separate warnings line, the select row with the match label, a 60px match box with a title exactly two lines tall, and row-span-6. It also says 'The Detailed and expanded cards keep #n and their lg numeral'. The 07-UI-SPEC pointer repeats that 'The expanded and Detailed cards keep their lg numeral'. The shipped, owner-approved card (followups 1-9) contradicts all of this. The plan's own done criterion ('The design contract matches the shipped compact card') is not met."
    artifacts:
      - path: ".planning/phases/06-bulk-canada-auto-import-with-compact-review-cards/06-UI-SPEC.md"
        issue: "The G-06-side-2 amendment (lines 483-497) records the six-row 06-19 layout, not the final five-row layout, and says Detailed and expanded cards keep #n"
      - path: ".planning/phases/07-match-the-patrickclery-com-awesomer-color-palette/07-UI-SPEC.md"
        issue: "Line 448 says the expanded and Detailed cards keep their lg numeral; numbering was removed from them"
      - path: "src/components/compact-spine-card.tsx"
        issue: "The component JSDoc still describes six rows (status, warnings, crop, select, match, bulk); the code renders five rows (select, crop, label, match, warnings)"
      - path: "src/components/top-match-row.tsx"
        issue: "The JSDoc says the title is exactly two lines tall and the row always 60px; followup 9 removed the reserved second line"
      - path: "src/components/import-state-badge.tsx"
        issue: "The JSDoc says the compact card shows a corner checkmark for hideImported; it shows an Imported pill on the top row"
      - path: "src/components/bulk-status-line.tsx"
        issue: "The clamp JSDoc and prop doc say two lines; the compact pill is now one truncated line (followup 8)"
    missing:
      - "Add a follow-up 06-UI-SPEC amendment (or a superseding note) recording the final G-06-side-2 card. Top row: checkbox, Imported pill, pencil. Then the crop. Then the label row: Top match / Confirmed match, plus a disc icon and the count. Then the match: min 48px, title up to two lines with nothing reserved, details on one line. Then one bottom row of pills, two lines reserved: the state badge, warnings, and the import note as a one-line pill without ', used {country}'. The card is a row-span-5 subgrid. No numbering on any card (compact, expanded or Detailed). Skipped-duplicate copy names the photo"
      - "Fix the 07-UI-SPEC line 448 pointer so it no longer says the expanded and Detailed cards keep their lg numeral"
      - "Bring the JSDoc in compact-spine-card.tsx, top-match-row.tsx, import-state-badge.tsx and bulk-status-line.tsx in line with the shipped layout"
behavior_unverified_items:
  - truth: "An expanded card stays expanded across polls and filter refetches while it stays in the list (06-07)"
    test: "Open a card with the pencil while a bulk run or search is going, type in a field, and wait for the page to refresh itself"
    expected: "The card stays open and the typed text is still there"
    why_human: "Carried. ExpandedCardsProvider sits above the polled list (spines-view.tsx:611), and keepPreviousData keeps the tree mounted, so it should survive. But no test drives a real refetch with a card open, and no UAT step (2, 6 or 15) held a card open during a poll."
---

# Phase 6: Bulk Canada auto-import with compact review cards Verification Report

**Phase Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match without verifying hundreds one by one. Compact cards, multi-select, and a bulk action that resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds them through the existing rate-limited queue.
**Verified:** 2026-10-27T03:13:16Z
**Status:** gaps_found
**Re-verification:** Yes. The report was stale after gap plan 06-19, its review fixes (WR-01, WR-02) and the owner's UAT followups 1-9.

## Goal Achievement

The functional goal is achieved, and the owner passed UAT 11-15, including the final compact card layout (test 15). One must-have fails: the design contract (06-UI-SPEC and the 07-UI-SPEC pointer) still describes the six-row card that the owner then redesigned. The code is fine. The gap is documentation drift only.

Evidence produced on this pass:
- The full suite was run once: 129 files and 2476 tests passed. `npx tsc --noEmit` exits 0. `npx biome check` reports 699 files with no issues.
- `verify.artifacts` and `verify.key-links` pass for all 19 plans: 51/51 artifacts and 36/36 links.
- Since f17de95 (the last fingerprint refresh), only 9 files changed, all UI/copy: the 9 files named in the task. Server, demo, DB and script files are untouched, so the live-stack proof (`scripts/verify-bulk-import.ts`, exit 0) carries forward.

### Observable Truths (129 total)

| Plan | Truths | Status | Evidence |
| --- | --- | --- | --- |
| 06-01..06-12 | 89/90 | 87 VERIFIED, 2 PASSED (override), 1 behavior-unverified | The suite plus the live proof. The 8 backstop truths (06-04, 06-06..06-09) count on the owner's direct observation in UAT 1-10. Overrides: the 06-07 compact contents (#n removed, label row added) and the 06-08 skipped copy (names the photo, not #m). |
| 06-13 pressing fallback tier | 6/6 | VERIFIED | `pressing.ts` is untouched |
| 06-14 Fallback country setting | 6/6 | VERIFIED | The remaining truth was passed by the owner in UAT 11 |
| 06-15 status tabs wrap | 3/3 | VERIFIED | The remaining truth was passed by the owner in UAT 12 |
| 06-16 job + run snapshot | 5/5 | VERIFIED | Server code is untouched. The accepted fallback-request deviation is carried. |
| 06-17 demo tier | 4/4 | VERIFIED | Demo ops are untouched; UAT 14 passed |
| 06-18 copy and read models | 6/6 | VERIFIED | `fallbackLine` is unchanged; `bulkStatusLineOf` adds `short` without altering `text` (bulk-copy.test passes); UAT 13 and 14 passed |
| 06-19 compact card (G-06-side-2) | 8/9 | 3 VERIFIED, 5 PASSED (override), 1 FAILED | See below |

06-19 detail:

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | No spine number on screen. The number survives only in aria names and the crop alt | VERIFIED | No `#{number}` span and no `CornerNumeral` import in `compact-spine-card.tsx`. Labels are `Select spine #N` (spine-selection.tsx:89), `Edit spine #N` and `Show less of spine #N`, and the crop alt is `Spine N: …` (spine-crop.tsx:47). Test "shows no spine number…" passes. |
| 2 | Pencil icon Edit at the right of the checkbox row; opens in place; Show less returns focus | VERIFIED | Ghost `size="icon"` Button with `Pencil`, `ref={editRef}`, `aria-expanded`, `aria-controls`. The focus effect is unchanged from 06-07, which the owner checked in UAT 2. The owner opened and closed with the pencil in UAT 15. |
| 3 | Checkbox shares its row with the label and the pencil | PASSED (override) | Followup 5. The checkbox now shares its row with the Imported pill and the pencil. |
| 4 | Status badge has its own row, never cut off | PASSED (override) | Followups 2/4/6/8. Never-clipped still holds. |
| 5 | Warnings line of its own, always present | PASSED (override) | Followups 3/7/8. One always-present bottom pill row (`min-h-12`). |
| 6 | Six rows in order; title always two lines tall | PASSED (override) | Five rows on a `row-span-5 grid-rows-subgrid` card; followup 9 |
| 7 | A failed lookup keeps its whole explanation, Open Settings and Retry import | VERIFIED | The `failed` case in `bulk-status-line.tsx` ignores `clamp` (`basis-full`, full text). Test "a failed lookup keeps its whole text, the Settings link and Retry import" passes. |
| 8 | Detailed and expanded keep #N and the corner number | PASSED (override) | Followup 1 (c154409) removed them on the owner's request |
| 9 | 06-UI-SPEC records the new layout and 07-UI-SPEC points to it | FAILED | The amendment records the superseded six-row layout and says Detailed and expanded keep #n. See Gaps. |

**Score:** 127/129 verified (120 VERIFIED + 7 PASSED by owner override). 1 truth is present but behavior-unverified, and 1 failed.

**Override note:** 7 overrides is above the usual 2-3. All of them trace to one owner decision, recorded turn by turn in 06-UAT.md G-06-side-2 followups 1-9 and approved in UAT 15. They are not a bulk skip.

### Prohibitions (06-02)

All three are still RESOLVED and untouched: the bulk path never passes `allowDuplicate`; `imports/store.ts` is the only `add_to_collection` enqueue site (the guard test passes); pressing candidates stay hidden.

### Required Artifacts

51/51 pass `verify.artifacts`. `CompactSpineCard` is rendered by `photo-section.tsx` inside `COMPACT_GRID` (whose implicit rows the subgrid spans). `TopMatchRow` and `BulkStatusLine clamp` are rendered by the compact card. `SpineCard` (no numbering) is rendered for the expanded and Detailed views.

### Key Link Verification

36/36 declared links pass. The 06-19 links all match: `grid-rows-subgrid`, `clamp` and `TopMatchRow`. Their `via` text still says row-span-6 and h-15 (Info only: stale wording, the wiring is real).

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
| --- | --- | --- | --- | --- |
| CompactSpineCard label count | `spine.discogs.candidateCount` | GET /api/spines read model | Yes | FLOWING |
| BulkStatusLine compact pill | `line.short` / `line.text` | `bulkStatusLineOf` from `bulk_runs`/items | Yes | FLOWING |
| BulkImportDialog / FallbackCountryField | `fallbackCountry` | `getFallbackCountry()` | Yes | FLOWING (unchanged) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite (once) | `npx vitest run` | 129 files, 2476 tests passed | PASS |
| Types | `npx tsc --noEmit` | exit 0 | PASS |
| Lint | `npx biome check` | 699 files, no issues | PASS |
| Artifacts / links | `verify.artifacts`, `verify.key-links` x19 | 51/51, 36/36 | PASS |

### Probe Execution

No probes are declared. Step 7c does not apply.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
| --- | --- | --- | --- |
| BULK-01 compact card + grid | 06-07, 06-08, 06-15, 06-19 | SATISFIED | Five-row subgrid; UAT 1, 12, 15 |
| BULK-02 expand in place | 06-07, 06-19 | SATISFIED | Pencil toggle; UAT 2, 15. Poll survival is behavior-unverified. |
| BULK-03 Compact/Detailed toggle | 06-07 | SATISFIED | UAT 3 |
| BULK-04 select + eligibility | 06-01, 06-04, 06-09, 06-19 | SATISFIED | Checkbox on the top row; UAT 4 |
| BULK-05 dialog + start route | 06-06, 06-09, 06-18 | SATISFIED | UAT 5, 13 |
| BULK-06 lookup job | 06-01, 06-02, 06-10, 06-13, 06-16 | SATISFIED | Server untouched; live proof |
| BULK-07 fallback recorded | 06-01, 06-02, 06-08, 06-13, 06-16..06-19 | SATISFIED | The Fallback badge plus the short note pill; UAT 13, 14 |
| BULK-08 local duplicates | 06-02, 06-08, 06-10 | SATISFIED | The skipped line names the photo (override) |
| BULK-09 preferred and fallback country | 06-03, 06-14, 06-16 | SATISFIED | UAT 8, 11 |
| BULK-10 fallback filter, progress, toast | 06-04, 06-09, 06-12 | SATISFIED | UAT 6, 7 |
| BULK-11 failure/retry/recovery | 06-04, 06-05, 06-06, 06-10, 06-19 | SATISFIED | The failed line is never clamped |
| BULK-12 demo | 06-06, 06-11, 06-14, 06-17, 06-18 | SATISFIED | UAT 10, 14 |

There is no `.planning/REQUIREMENTS.md`; the IDs come from 06-RESEARCH.md. No IDs are orphaned.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/components/compact-spine-card.tsx` | 61-84 | The JSDoc describes six rows in the wrong order | Warning | It misleads the next editor. Part of the gap. |
| `src/components/top-match-row.tsx` | 6-13 | The JSDoc says the title is exactly two lines and the row always 60px | Warning | Part of the gap |
| `src/components/import-state-badge.tsx` | 29-30 | The JSDoc says the compact card uses a corner checkmark | Warning | Part of the gap |
| `src/components/bulk-status-line.tsx` | 103-116 | The clamp doc says two lines; the pill is one truncated line | Warning | Part of the gap |
| `src/lib/bulk-copy.ts` | 222-223 | The `fallbackLine` `default` case has no exhaustiveness guard (carried, IN-01) | Info | A future outcome would get the generic line |
| 06-UAT.md | Summary | `issues: 2` with test 9 still `result: issue` (it was fixed by 06-15 and re-checked as UAT 12, pass) | Info | Bookkeeping only |

None of the 9 changed files has a TBD, FIXME, XXX, TODO or HACK marker.

### Advisory (New Scope, Unevidenced)

None.

### Human Verification Required

None open. The owner passed UAT 1-15 (test 9's issue was fixed and re-checked as UAT 12). The one behavior-unverified truth (an open card surviving a poll) is listed in the frontmatter. A quick check would settle it, but no UAT step covered it.

### Gaps Summary

There is one gap, documentation drift. The owner reshaped the compact card nine times after 06-19, and approved the result in UAT 15. The code, tests and UAT agree on the final layout. 06-UI-SPEC's G-06-side-2 amendment, the 07-UI-SPEC pointer and four component JSDocs still describe the 06-19 six-row card and say Detailed and expanded cards keep their numbers. A small docs-only follow-up closes it: a superseding UI-SPEC amendment, the pointer fix and the JSDoc updates. No code behavior needs to change.

---

_Verified: 2026-10-27T03:13:16Z_
_Verifier: Claude (gsd-verifier)_
