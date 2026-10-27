---
status: testing
phase: 06-bulk-canada-auto-import-with-compact-review-cards
source: [06-VERIFICATION.md]
started: 2026-10-25T09:05:13.323Z
updated: 2026-10-26T22:54:00.817Z
---

## Current Test

number: 15
name: On the Spines page in Compact view at 4 cards per row, look over the cards, click a pencil then Show less, then narrow the window down to 1 card per row.
expected: |
  No card shows a number. Every card has the same rows: status badge (never cut off), a warnings line, the spine photo, one line with the checkbox, Top match and a pencil, the match (title at most two lines, details one line, full text on hover), then an import-notes line. In each row the photos, checkbox lines and matches line up. The pencil opens the card across the row and Show less closes it. Opened and Detailed cards show no number either.
awaiting: user response

## Tests

### 1. Open the review page (Spines) on a wide screen, then make the window narrower step by step, down to phone width.
expected: Cards are small: checkbox, number, badges, the spine photo, and the top match right under it (cover, artist and title, year, country, catalogue number). No edit boxes. 4 cards per row on a wide screen, then 3, then 2, then 1 at phone width. A very long album title stops after two lines and shows in full when you hover over it.
result: pass

### 2. On a card in the middle of a row, click Edit spine. Open a second card too. Then click Show less on each.
expected: The card opens across the whole row with all the edit fields and matches, the cards before it stay where they were, both cards can be open at once, and Show less closes it and puts you back on its Edit spine button.
result: pass

### 3. Click Detailed in the filter bar, reload the page, then click Compact.
expected: Detailed shows the big full cards one under another and is still Detailed after the reload. Compact goes back to the small cards. Any card you had opened closes when you switch.
result: pass

### 4. Hover over (or Tab to) the checkbox of a card that is already imported or still being searched. Then tick Select all shown, change the status filter, and look at the selected count.
expected: The greyed checkbox explains why it can't be picked (for example already imported). Select all shown ticks every pickable card that is on screen, including ones with a low-confidence badge. After changing the filter, cards that are no longer on screen are no longer counted as selected.
result: pass

### 5. With a few cards selected, click Import N selected. Read the dialog, then click Start import. Repeat once with a very long folder name, on phone width.
expected: The dialog says 'Import N to {your folder} as Canadian pressings', mentions how many cards had a field Claude wasn't sure of, and has Keep reviewing and Start import. Start shows Starting… and then closes. With a long folder name the title wraps onto several lines instead of running off the screen.
result: pass

### 6. Watch the cards while the bulk import runs, without touching the page, until it finishes. Then reload the page.
expected: Cards first show 'Finding pressing' with a spinner and 'Looking for the Canadian pressing…', and update on their own every few seconds. The bar at the bottom reads 'Bulk import: X / N done'. Afterwards each imported card shows a pin badge with Canada, or a warning badge 'Fallback: {country}' with a line explaining why (for example 'No Canadian pressing, used US'). A second card for the same album says 'Already imported from spine #n'. One pop-up says 'Bulk import done: N added to {folder}.' with Show fallbacks or Show failed. After the reload the pop-up does not come back, but the bar still shows 'Last bulk import: …'.
result: pass

### 7. Click Fallback in the filter bar (it only appears once at least one fallback exists). Then also turn on Needs review.
expected: Only the fallback cards are listed. If nothing matches you see 'No fallbacks' with a Show all spines button, or with two filters on 'No spines match these filters' with Clear filters. Reloading the page with Fallback on keeps the same list.
result: pass

### 8. On the Settings page, in the Discogs card, type 'canada' in Preferred country and click away. Then clear the box and click away.
expected: It saves as 'Canada' with a pop-up 'Preferred country set to Canada'. An empty box is not saved and says 'Enter a country, such as Canada.'
result: pass

### 9. At phone width, look at a fallback card and a skipped-duplicate card whose photo has a very long file name.
expected: The explanation lines wrap inside the card and never stick out of it.
result: issue
reported: "At phone width the status tabs don't wrap: 'Not found' is cut off and 'Not on Discogs' and 'Failed' are missing off the right edge."
severity: minor

### 10. Open the demo site, select all on the review page, import, and watch it finish.
expected: The same flow plays out with made-up data: Finding pressing, Canada badges, a Fallback card, an 'Already imported from spine' card, the progress line and the finished pop-up. Nothing asks you to sign in to Discogs.
result: pass

### 11. On Settings, look at the Fallback country box in the Discogs card. Type germany and click away. Then clear the box and click away. Then type canada and click away.
expected: It starts as US. germany saves as Germany with a pop-up. An empty box is not saved and says Enter a country, such as US. With canada (same as Preferred country) a note says bulk import goes straight to the top match. Set it back to US when done.
result: pass

### 12. At phone width, look at the status tabs at the top of the Spines page, then tap Failed.
expected: All seven tabs (All, Pending, Matched, Imported, Not found, Not on Discogs, Failed) are visible over two or three lines, none cut off, and tapping Failed shows the failed list.
result: pass

### 13. Select a few spines including Massive Attack and run a bulk import on the real app.
expected: The dialog mentions the US CD pressing as second choice and cards read Looking for the Canadian or US pressing…. Afterwards a US import shows Fallback: US with No Canadian pressing, used US; a spine with neither says No Canadian or US pressing, used {country}. Massive Attack no longer lands on Hong Kong when Discogs lists a US CD.
result: pass

### 14. Open the demo site, select all on the review page, import, and watch it finish.
expected: Guttermouth shows Fallback: US. Massive Attack shows Fallback: Hong Kong with No Canadian or US pressing, used Hong Kong.
result: pass

### 15. On the Spines page in Compact view at 4 cards per row, look over the cards, click a pencil then Show less, then narrow the window down to 1 card per row.
expected: No card shows a number. Every card has the same rows: status badge (never cut off), a warnings line, the spine photo, one line with the checkbox, Top match and a pencil, the match (title at most two lines, details one line, full text on hover), then an import-notes line. In each row the photos, checkbox lines and matches line up. The pencil opens the card across the row and Show less closes it. Detailed view is unchanged.
result: [pending]

## Summary

total: 15
passed: 13
issues: 2
pending: 1
skipped: 0
blocked: 0

## Gaps
- gap_id: G-06-side-1
  truth: "Settings has a Fallback country next to Preferred country (default US). When the master has no version from the preferred country, bulk import picks a version from the fallback country next (Preferred → Fallback → top match), instead of keeping whatever country the top match happened to be"
  status: resolved
  resolved_by: "06-18-PLAN.md"
  resolved_at: "2026-10-25"
  reason: "User reported: with Massive Attack, the default entry it picked was Hong Kong. If no entry for Canada exists, it should next default to US. Later: we should be able to set the preferred fallback country as well in the settings — I would set Canada and US as the fallback."
  severity: major
  test: 6
  root_cause: "choosePressing (src/lib/pressing.ts) ranks versions only against the single preferred country; with no Canada match it returns fallback_no_version and keeps the top match's own release (e.g. Hong Kong) — there is no second-choice country"
  artifacts:
    - path: "src/lib/pressing.ts"
      issue: "no fallback-country tier after the preferred country"
  missing:
    - "Second-choice country (US) tried from the same versions answer before falling back to the top match"
    - "Fallback country setting (Settings page Discogs card + demo twin), default US, used by choosePressing and its badges/copy"
- gap_id: G-06-9
  truth: "At phone width every status tab (All, Pending, Matched, Imported, Not found, Not on Discogs, Failed) is visible — the tab row wraps (or otherwise fits) instead of running off the right edge"
  status: resolved
  resolved_by: "06-15-PLAN.md"
  resolved_at: "2026-10-25"
  reason: "User reported: at phone width it is missing the tabs for Not on Discogs and Failed because they don't word wrap ('Not found' is cut off)"
  severity: minor
  test: 9
  root_cause: "src/components/review-status-filter.tsx wraps the status tab row in an overflow-x-auto scroller, so at phone width the last tabs (Not found, Not on Discogs, Failed) sit off-screen with no visible cue instead of wrapping"
  artifacts:
    - path: "src/components/review-status-filter.tsx"
      issue: "horizontal scroller (overflow-x-auto) instead of a wrapping row"
  missing:
    - "Let the tab row wrap onto more lines (or otherwise keep every tab visible) at phone width"
- gap_id: G-06-side-2
  truth: "Every compact review card has the same number of rows, so cards in a grid line up: no card numbering at all (neither the '#N' label nor the big corner number), the checkbox shares its row with other content (e.g. the candidates count) instead of taking a row of its own, warning badges sit on their own line separate from the candidates count, and editing the spine is an icon button instead of the 'Edit spine' text"
  status: resolved
  resolved_by: "06-19-PLAN.md"
  resolved_at: "2026-10-26"
  followup: "Test 15: user reported the opened (expanded) card still showed #3 and the big corner number; removed numbering from SpineView too (opened + Detailed cards)"
  followup_2: "Test 15: user asked for the bare count (10, not '10 candidates') on the Top match / Confirmed match line; compact card now shows a disc icon + number there and drops the N candidates status badge"
  followup_3: "Test 15: user asked for a corner checkmark instead of the Imported badge, and for every warning (field badges, fallback, import notes) to sit together at the very bottom of the card; card rows are now status, crop, select, match, warnings"
  reason: "User reported: I don't want it to say '#1' and '1' in the corner - just 1 in the corner. The words 'Edit Spine' are also taking up too much space. I would prefer just to have an edit icon somewhere. The warnings at the top should move to a separate line. Basically, I want the cards to have the exact same number of rows on every match so that it doesn't look like they are oddly word-wrapped. Later: we don't need the numbering on the cards at all. We just need check boxes, and ideally the check box shouldn't take up a whole row. It can have text beside it or whatever."
  severity: cosmetic
  test: side
  root_cause: "src/components/compact-spine-card.tsx renders a flex-wrap header holding the checkbox, a '#N' label, worst-field/Edited/orphan badges and an ml-auto group (CountryBadge + ImportStateBadge with min-w-0 max-w-full, which clips instead of wrapping), so cards wrap to 1-3 header rows depending on badge count; it also renders <CornerNumeral> (big corner number), a 'Edit spine' text button on its own bottom row, and an unclamped TopMatchRow title/details and BulkStatusLine whose line count varies per match"
  artifacts:
    - path: "src/components/compact-spine-card.tsx"
      issue: "variable-height wrapping header, '#N' label + CornerNumeral, text 'Edit spine' button row"
    - path: "src/components/top-match-row.tsx"
      issue: "title and details wrap to a varying number of lines"
  missing:
    - "Status badges (Imported, Waiting to import) are cut off at the card's right edge when they share a row with Fallback or warning badges (seen in test 13 screenshot)"
