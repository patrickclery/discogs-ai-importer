---
status: testing
phase: 06-bulk-canada-auto-import-with-compact-review-cards
source: [06-VERIFICATION.md]
started: 2026-10-25T09:05:13.323Z
updated: 2026-10-25T09:05:13.323Z
---

## Current Test

number: 1
name: Open the review page (Spines) on a wide screen, then make the window narrower step by step, down to phone width.
expected: |
  Cards are small: checkbox, number, badges, the spine photo, and the top match right under it (cover, artist and title, year, country, catalogue number). No edit boxes. 4 cards per row on a wide screen, then 3, then 2, then 1 at phone width. A very long album title stops after two lines and shows in full when you hover over it.
awaiting: user response

## Tests

### 1. Open the review page (Spines) on a wide screen, then make the window narrower step by step, down to phone width.
expected: Cards are small: checkbox, number, badges, the spine photo, and the top match right under it (cover, artist and title, year, country, catalogue number). No edit boxes. 4 cards per row on a wide screen, then 3, then 2, then 1 at phone width. A very long album title stops after two lines and shows in full when you hover over it.
result: [pending]

### 2. On a card in the middle of a row, click Edit spine. Open a second card too. Then click Show less on each.
expected: The card opens across the whole row with all the edit fields and matches, the cards before it stay where they were, both cards can be open at once, and Show less closes it and puts you back on its Edit spine button.
result: [pending]

### 3. Click Detailed in the filter bar, reload the page, then click Compact.
expected: Detailed shows the big full cards one under another and is still Detailed after the reload. Compact goes back to the small cards. Any card you had opened closes when you switch.
result: [pending]

### 4. Hover over (or Tab to) the checkbox of a card that is already imported or still being searched. Then tick Select all shown, change the status filter, and look at the selected count.
expected: The greyed checkbox explains why it can't be picked (for example already imported). Select all shown ticks every pickable card that is on screen, including ones with a low-confidence badge. After changing the filter, cards that are no longer on screen are no longer counted as selected.
result: [pending]

### 5. With a few cards selected, click Import N selected. Read the dialog, then click Start import. Repeat once with a very long folder name, on phone width.
expected: The dialog says 'Import N to {your folder} as Canadian pressings', mentions how many cards had a field Claude wasn't sure of, and has Keep reviewing and Start import. Start shows Starting… and then closes. With a long folder name the title wraps onto several lines instead of running off the screen.
result: [pending]

### 6. Watch the cards while the bulk import runs, without touching the page, until it finishes. Then reload the page.
expected: Cards first show 'Finding pressing' with a spinner and 'Looking for the Canadian pressing…', and update on their own every few seconds. The bar at the bottom reads 'Bulk import: X / N done'. Afterwards each imported card shows a pin badge with Canada, or a warning badge 'Fallback: {country}' with a line explaining why (for example 'No Canadian pressing, used US'). A second card for the same album says 'Already imported from spine #n'. One pop-up says 'Bulk import done: N added to {folder}.' with Show fallbacks or Show failed. After the reload the pop-up does not come back, but the bar still shows 'Last bulk import: …'.
result: [pending]

### 7. Click Fallback in the filter bar (it only appears once at least one fallback exists). Then also turn on Needs review.
expected: Only the fallback cards are listed. If nothing matches you see 'No fallbacks' with a Show all spines button, or with two filters on 'No spines match these filters' with Clear filters. Reloading the page with Fallback on keeps the same list.
result: [pending]

### 8. On the Settings page, in the Discogs card, type 'canada' in Preferred country and click away. Then clear the box and click away.
expected: It saves as 'Canada' with a pop-up 'Preferred country set to Canada'. An empty box is not saved and says 'Enter a country, such as Canada.'
result: [pending]

### 9. At phone width, look at a fallback card and a skipped-duplicate card whose photo has a very long file name.
expected: The explanation lines wrap inside the card and never stick out of it.
result: [pending]

### 10. Open the demo site, select all on the review page, import, and watch it finish.
expected: The same flow plays out with made-up data: Finding pressing, Canada badges, a Fallback card, an 'Already imported from spine' card, the progress line and the finished pop-up. Nothing asks you to sign in to Discogs.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps
