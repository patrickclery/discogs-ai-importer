---
status: complete
phase: 03-discogs-match
source: [03-VERIFICATION.md]
started: 2026-10-22T01:12:52Z
updated: 2026-10-22T07:06:56.414Z
---

## Current Test

[testing complete]

## Tests

### 1. Covers on match cards
do: Open http://127.0.0.1:3001/spines and look at a few spines that have matches.
expected: Each match shows a small cover picture. A match with no cover shows a grey disc icon, never a broken image.
result: pass

### 2. Nothing added to your collection
do: Note your collection count on discogs.com, use the app for a while, then check again.
expected: The count is the same as before you connected.
result: pass

### 3. Show all
do: On a spine with more than 3 matches, click Show all, then Show fewer.
expected: All matches appear, then the list goes back to 3.
result: pass

### 4. Live updates
do: Change a spine's title, then press Search again. Watch the card without reloading.
expected: It goes from Queued to Searching to a result on its own. If Discogs asks the app to slow down, the top bar counts down.
result: pass

### 5. Search Discogs dialog
do: On any spine, open Search Discogs..., type a search, pick a result and add it. Then paste a release link, and then a master link.
expected: The typed search lists results you can pick. A release link shows that release first. A master link asks you to pick a version.
result: pass

### 6. Narrow window
do: Make the browser as narrow as it goes and scroll through the spines page.
expected: Nothing is cut off or overlapping.
result: pass

### 7. Plain wording
do: Read the text on the spines page and in Settings.
expected: No technical words (no status codes, job names or error codes).
result: pass

### 8. Re-attach a No longer detected spine
do: Re-attach one, wait about 10 seconds, then reload.
expected: It shows Queued, then Searching, then matches or 'Discogs found nothing'. It never stays on 'waiting its turn'.
result: pass

### 9. Reconnect after a revoked sign-in
do: On discogs.com, revoke this app. In the app, pick a card that has matches, change its title, press Search again, then put the title back. Go to Settings and reconnect Discogs. Return to the spines page.
expected: That card shows Queued, then Searching, then its matches. It no longer tells you to reconnect.
result: pass

### 10. Reconnect message on a No longer detected spine (known issue WR-01)
do: Revoke the app on discogs.com. On a spine marked No longer detected, press Search again. Reconnect Discogs in Settings, then look at that card again.
expected: Today the card still says 'Reconnect Discogs in Settings', and pressing Retry search fixes it. Decide whether that is acceptable for now or must be fixed before moving on.
result: pass

### 11. Message after a restart (known issue WR-02)
do: Revoke the app on discogs.com and press Search again on a card. Restore access on discogs.com, restart the app, open the card, then open Settings.
expected: Today the card says 'Reconnect Discogs in Settings', but Settings shows Connected with no Reconnect button. Pressing Test connection there, or Retry search on the card, fixes it. Decide whether the wording must change before moving on.
result: pass

### 12. No automatic preselect
do: Open several spines with matches.
expected: No match is picked or confirmed for you; you always choose.
result: pass

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
