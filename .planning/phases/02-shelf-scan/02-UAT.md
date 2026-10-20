---
status: complete
phase: 02-shelf-scan
source: [02-VERIFICATION.md]
started: 2026-10-20T08:41:15.000Z
updated: 2026-10-20T18:25:41.639Z
---

## Current Test

[testing complete]

## Tests

### 1. UAT 3 re-run (G-02-3). Prod build (corepack pnpm build && corepack pnpm start). Open /upload with every photo Done, stop the server, refocus the tab so 'Couldn't refresh' appears with the last data kept. Start the server and keep the tab focused. Repeat on /spines.
expected: The alert clears by itself within roughly 3-10 s of the server coming back (the default retry: 3 backoff can delay the first error, then polls run every 3 s). No page interaction needed.
result: issue
reported: "it's still not changing" (screenshots: after restart the header flips to 'Worker idle' but the 'Couldn't refresh' alert stays on /upload)
severity: major

### 2. UAT 5 re-run (G-02-5) on /spines, prod build. First paste in the DevTools console: window.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.activeElement?.blur(); }, { capture: true }). On an unedited field type extra characters and press Escape; repeat on the same field; then type, click away and reload. Reload without the snippet and repeat. Also check Enter (Input), Ctrl/Cmd+Enter (Raw text), Revert and Undo revert.
expected: Escape brings the saved value back with no Edited badge and no PATCH in the Network tab, both times. The click-away value persists after reload with Edited. Same results without the snippet. Enter, Ctrl/Cmd+Enter, Revert and Undo revert still work.
result: pass

### 3. UAT 8 (skipped in UAT). After a re-scan that orphans an edited spine, use Re-attach spine... and Dismiss spine.
expected: The orphan shows under 'No longer detected (n)'. Re-attach moves the edits and toasts 'Edits moved to spine #n'. Dismiss toasts and moves focus to the next card's first field, or to the section's Re-scan button.
result: skipped
reason: "No real orphan available (re-scans re-pair >=95% of spines); orphan Re-attach/Dismiss covered by scripts/verify-rescan.ts with the fake CLI"

### 4. UAT 11 (skipped in UAT). Render a 20:1 crop and a 4:1 crop, then scroll about 500 spine cards.
expected: Both crops render in full (object-contain, max-h-32/min-h-12) and scrolling stays responsive without virtualization.
result: pass
note: "Tested on ~230 spines (all owner photos), not 500"

### 5. UAT 7 and 9 remainders. Re-scan from an /upload error row, the below-640px 36px icon trigger (disabled with a tooltip while analyzing), and 'Use new read' after a re-scan that changes an edited field's read.
expected: Same confirm dialog and merge as on /spines. 'Use new read' clears the 'Latest scan reads' hint and the Edited badge.
result: skipped
reason: "No failed photo to re-scan from /upload; owner skipped the narrow-icon and Use new read checks (each needs a paid re-scan)"

## Summary

total: 5
passed: 2
issues: 1
pending: 0
skipped: 2
blocked: 0

## Gaps

- gap_id: G-02-1
  truth: "After the server comes back, the 'Couldn't refresh' alert on /upload (and /spines) clears by itself within ~3-10 s with no page interaction"
  status: failed
  reason: "User reported: it's still not changing — header status recovers to 'Worker idle' but the 'Couldn't refresh' alert stays"
  severity: major
  test: 1
  root_cause: "Not a code defect: the /upload tab ran pre-02-13 client JS (loaded 01:44 from a server on the 01:44 build); the server was only restarted mid-test and the tab never reloaded. HEAD build clears the alert in 0.5-2.6 s in Chrome and Firefox."
  artifacts: []
  missing:
    - "Re-run test 1 after a server restart on the current build and a hard reload of /upload and /spines"
  debug_session: .planning/debug/refresh-alert-never-clears.md
