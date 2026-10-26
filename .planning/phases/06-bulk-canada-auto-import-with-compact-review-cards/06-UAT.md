---
status: testing
phase: 06-bulk-canada-auto-import-with-compact-review-cards
source: [06-VERIFICATION.md]
started: 2026-10-25T09:05:13.323Z
updated: 2026-10-26T00:02:04.128Z
---

## Current Test

number: 11
name: On Settings, look at the Fallback country box in the Discogs card. Type germany and click away. Then clear the box and click away. Then type canada and click away.
expected: |
  It starts as US. germany saves as Germany with a pop-up. An empty box is not saved and says Enter a country, such as US. With canada (same as Preferred country) a note says bulk import goes straight to the top match. Set it back to US when done.
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
result: [pending]

### 12. At phone width, look at the status tabs at the top of the Spines page, then tap Failed.
expected: All seven tabs (All, Pending, Matched, Imported, Not found, Not on Discogs, Failed) are visible over two or three lines, none cut off, and tapping Failed shows the failed list.
result: [pending]

### 13. Select a few spines including Massive Attack and run a bulk import on the real app.
expected: The dialog mentions the US CD pressing as second choice and cards read Looking for the Canadian or US pressing…. Afterwards a US import shows Fallback: US with No Canadian pressing, used US; a spine with neither says No Canadian or US pressing, used {country}. Massive Attack no longer lands on Hong Kong when Discogs lists a US CD.
result: [pending]

### 14. Open the demo site, select all on the review page, import, and watch it finish.
expected: Guttermouth shows Fallback: US. Massive Attack shows Fallback: Hong Kong with No Canadian or US pressing, used Hong Kong.
result: [pending]

## Summary

total: 14
passed: 9
issues: 1
pending: 4
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
