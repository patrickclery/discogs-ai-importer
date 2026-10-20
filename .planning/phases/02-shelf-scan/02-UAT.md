---
status: testing
phase: 02-shelf-scan
source: [02-VERIFICATION.md]
started: 2026-10-20T08:41:15.000Z
updated: 2026-10-20T08:41:15.000Z
---

## Current Test

number: 1
name: UAT 3 re-run (G-02-3). Prod build (corepack pnpm build && corepack pnpm start). Open /upload with every photo Done, stop the server, refocus the tab so 'Couldn't refresh' appears with the last data kept. Start the server and keep the tab focused. Repeat on /spines.
expected: |
  The alert clears by itself within roughly 3-10 s of the server coming back (the default retry: 3 backoff can delay the first error, then polls run every 3 s). No page interaction needed.
awaiting: user response

## Tests

### 1. UAT 3 re-run (G-02-3). Prod build (corepack pnpm build && corepack pnpm start). Open /upload with every photo Done, stop the server, refocus the tab so 'Couldn't refresh' appears with the last data kept. Start the server and keep the tab focused. Repeat on /spines.
expected: The alert clears by itself within roughly 3-10 s of the server coming back (the default retry: 3 backoff can delay the first error, then polls run every 3 s). No page interaction needed.
result: [pending]

### 2. UAT 5 re-run (G-02-5) on /spines, prod build. First paste in the DevTools console: window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.activeElement?.blur(); }, { capture: true }). On an unedited field type extra characters and press Escape; repeat on the same field; then type, click away and reload. Reload without the snippet and repeat. Also check Enter (Input), Ctrl/Cmd+Enter (Raw text), Revert and Undo revert.
expected: Escape brings the saved value back with no Edited badge and no PATCH in the Network tab, both times. The click-away value persists after reload with Edited. Same results without the snippet. Enter, Ctrl/Cmd+Enter, Revert and Undo revert still work.
result: [pending]

### 3. UAT 8 (skipped in UAT). After a re-scan that orphans an edited spine, use Re-attach spine... and Dismiss spine.
expected: The orphan shows under 'No longer detected (n)'. Re-attach moves the edits and toasts 'Edits moved to spine #n'. Dismiss toasts and moves focus to the next card's first field, or to the section's Re-scan button.
result: [pending]

### 4. UAT 11 (skipped in UAT). Render a 20:1 crop and a 4:1 crop, then scroll about 500 spine cards.
expected: Both crops render in full (object-contain, max-h-32/min-h-12) and scrolling stays responsive without virtualization.
result: [pending]

### 5. UAT 7 and 9 remainders. Re-scan from an /upload error row, the below-640px 36px icon trigger (disabled with a tooltip while analyzing), and 'Use new read' after a re-scan that changes an edited field's read.
expected: Same confirm dialog and merge as on /spines. 'Use new read' clears the 'Latest scan reads' hint and the Edited badge.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
