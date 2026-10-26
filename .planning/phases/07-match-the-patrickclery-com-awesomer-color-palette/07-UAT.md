---
status: testing
phase: 07-match-the-patrickclery-com-awesomer-color-palette
source: [07-VERIFICATION.md]
started: 2026-10-26T02:57:31.802Z
updated: 2026-10-26T02:57:31.802Z
---

## Current Test

number: 1
name: Set your computer to light mode. Start the app and open the Upload page, then the Spines page and the Settings page. Reload each page a few times.
expected: |
  Every page has a dark navy-purple background with soft off-white text, even though the computer is in light mode. Cards and panels are a slightly lighter slate-purple with thin grey-purple borders. Reloading never shows a white flash. There is no light/dark switch anywhere. The lettering looks exactly as before.
awaiting: user response

## Tests

### 1. Set your computer to light mode. Start the app and open the Upload page, then the Spines page and the Settings page. Reload each page a few times.
expected: Every page has a dark navy-purple background with soft off-white text, even though the computer is in light mode. Cards and panels are a slightly lighter slate-purple with thin grey-purple borders. Reloading never shows a white flash. There is no light/dark switch anywhere. The lettering looks exactly as before.
result: [pending]

### 2. On the Spines page in Detailed view, scroll so a bright, light-colored spine photo slides under the bar at the top of the page.
expected: The top bar is slightly see-through and the photo shows through it, softly blurred. The words Upload, Spines and Settings stay easy to read even over the bright photo.
result: [pending]

### 3. In Settings, change Preferred country and save, then change it back and save again (computer still in light mode).
expected: The confirmation pop-up in the bottom-right corner is dark slate with light text and a thin border, never white.
result: [pending]

### 4. On the Spines page, tick a couple of cards so the bottom bar appears and hover its Import button. Then open each warning dialog without confirming: Dismiss on a card (then Keep spine), Disconnect Discogs in Settings (then Stay connected), and Clear value next to a saved Discogs key (then Keep value). Hover the red button in each dialog.
expected: The Import button is light purple with dark text and turns a bluish lavender under the mouse. In all three dialogs the confirm button is solid pink-red with dark text and gets slightly deeper red under the mouse. The text is never white, and Clear value is never purple. Nothing is actually dismissed, disconnected or cleared.
result: [pending]

### 5. On the Spines page, look at the row of status tabs (All is selected when the page opens). Move the mouse over other tabs. If a spine has failed, look at the Failed tab, then click it. Also hover and click Needs review and Fallback if they show.
expected: On the selected tab the number is bright off-white and easy to read, not faded grey. Hovering a tab brightens its number the same way. The Failed number is red when the tab is not selected and turns off-white once you hover or select it. Filtering works exactly as before.
result: [pending]

### 6. Hover the underlined purple links: in Settings, the links in the Discogs card; on the Spines page (Detailed view), the Discogs links under a match or a confirmed match. Then select some text on the page with the mouse, and also select some text you typed into a box (for example the search box on the Spines page or a field in Settings). Finally press Tab a few times to move between buttons and fields.
expected: Each link is light purple and turns bluish lavender under the mouse, staying underlined. Selected text gets a faint purple highlight and keeps its own color, both on the page and inside a typing box (never a solid purple block). The outline that shows which button or field you are on is purple.
result: [pending]

### 7. Open the published demo site (or a fresh demo build) and visit its first page, Spines and Settings.
expected: The demo looks the same as the app: dark navy-purple, light text, purple buttons, no white flash, no white page anywhere, including the very first page you land on.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
