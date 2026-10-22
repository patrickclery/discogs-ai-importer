---
status: testing
phase: 04-import-review-queue
source: [04-VERIFICATION.md]
started: 2026-10-22T11:51:59Z
updated: 2026-10-22T11:51:59Z
---

## Current Test

number: 1
name: Real Discogs account, first real import
expected: |
  The CD is there exactly once. Back in the app the card says Imported and names Uncategorized.
awaiting: user response

## Tests

### 1. Real Discogs account, first real import. Open the app on port 3001, go to the spines page, pick one CD you own whose top match is right, and click its 'Add to Uncategorized' button. Then open your collection on discogs.com and look in Uncategorized.
expected: The CD is there exactly once. Back in the app the card says Imported and names Uncategorized.
result: [pending]

### 2. Stop the app mid-import. Click Add on a second CD, and right away stop the app (Ctrl+C in its terminal). Start it again with the usual command, wait a few seconds, then check that CD on discogs.com. Finally run 'node scripts/report-discogs-import-live.ts' and read what it prints.
expected: The CD is in your collection exactly once and its card says Imported. The report prints counts only, with no warning lines (nothing posted twice, no copy held by two spines, nothing stuck).
result: [pending]

### 3. Decide on code-review finding CR-01. Picture this: you click Add on the wrong match, and Discogs times out or errors. The card then shows Import failed. Change match is greyed out with 'Retry first. Discogs may already have added it.' Retry is the only button.
expected: You decide one of two things. (a) Fix it now: add a 'check only' way out that looks in your collection and frees the card when nothing was added. (b) Accept it for now, since it needs a wrong click plus a Discogs error, and the wrong CD can be removed by hand on discogs.com.
result: [pending]

### 4. Long folder name on the Add button. In Discogs, make a collection folder with a very long name (about 60 letters) and pick it in Settings > Collection folder. Open the spines page in a normal window, then shrink the window to phone width.
expected: The Add button shows the start of the folder name and then cuts off neatly. Hovering shows the full name. Nothing spills out of the card at either width.
result: [pending]

### 5. Card buttons at phone width. With the window phone-narrow, look at one card in each of these states: Waiting to import, Already in your collection, Import failed.
expected: The buttons wrap onto a second line instead of running off the card. The small cover picture stays its normal size.
result: [pending]

### 6. Already-in-collection message with a long folder name. Add a CD you already own on Discogs, held in the long-named folder. Wait for the 'Already in your collection' message, then view it at phone width.
expected: The message ('You already have this release on Discogs: 1 copy in ...') wraps inside the card, and all of it is readable.
result: [pending]

### 7. Duplicate warning with a very long photo file name. Upload a shelf photo whose file name is very long (about 120 characters), then click Add on a CD that another spine already imported.
expected: A dialog says 'Already imported from {photo}, spine #...' and shows both spine pictures. The long title wraps, the captions stop after two lines, and hovering a caption shows the full name.
result: [pending]

### 8. Photo header at phone width. On the spines page, with the window phone-narrow, look at the line under a photo's name.
expected: '{i} / {n} imported' is always visible at the start of the line. The rest cuts off, and hovering shows the full line.
result: [pending]

### 9. Only an Add click adds anything. Use the app normally. Click on candidate rows, use the keyboard, and open Search Discogs and use its results.
expected: The only thing that adds a CD to your Discogs collection is clicking the 'Add to {folder}' button on a match inside a spine card. Search Discogs results have no Add button.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
