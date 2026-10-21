---
status: complete
phase: 03-discogs-match
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-08-SUMMARY.md, 03-09-SUMMARY.md, 03-10-SUMMARY.md, 03-11-SUMMARY.md, 03-12-SUMMARY.md, 03-13-SUMMARY.md]
started: 2026-10-21T21:28:48Z
updated: 2026-10-21T21:43:48.622Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop any running server. Start the app from scratch with `corepack pnpm dev`. It boots without errors, migrations run, and http://127.0.0.1:3001/spines loads your spines.
result: pass

### 2. Connect Discogs
expected: On Settings, Connect Discogs sends you to discogs.com; approving brings you back to Settings with a one-time Connected toast, the address bar shows /settings, and your username appears. Test connection succeeds. Denying on discogs.com returns you to Settings not connected, with a clear message.
result: pass

### 3. Copy callback address
expected: The Copy button on the Discogs card copies the callback address and shows a toast. After Finish connecting, keyboard focus lands on Test connection.
result: pass

### 4. Disconnect Discogs
expected: Disconnect opens a confirm dialog; confirming shows a toast and moves focus to Connect Discogs. The Clear confirm dialog mentions that Discogs matches are cleared too.
result: pass

### 5. Discogs status in the top bar
expected: The top bar shows Discogs lookup status beside the navigation without crowding it at normal widths; on a phone-narrow window only a dot shows. While Discogs is paused, the tooltip counts down each second.
result: pass

### 6. Match cards on /spines
expected: Each spine card shows a search status badge and a Discogs matches section with up to 3 matches: cover picture, title as Discogs writes it, a details line, tags and a discogs.com link. A match with no cover shows a grey disc icon, never a broken image. Orphaned cards keep Re-attach/Dismiss above the matches.
result: pass

### 7. Show all matches
expected: On a spine with more than 3 matches, Show all {n} reveals the rest and Show fewer folds them back.
result: pass

### 8. Search again after an edit
expected: Edit a spine's artist or title: the card says Fields changed since last search and offers Search again. Clicking it shows Queuing…, then the badge goes Queued → Searching → a result without a page reload.
result: pass

### 9. Search Discogs dialog: typed search
expected: Search Discogs… opens with the spine picture and the search box pre-filled and selected. Typing an artist and title and pressing Search shows results with covers; already-listed ones are marked. The list scrolls while the search box and buttons stay visible, even in a short window. Picking one and clicking Add to candidates shows Adding…, closes, toasts, and the pick appears first on the card marked Added manually.
result: pass

### 10. Search Discogs dialog: pasted links
expected: Pasting a Discogs release link or number shows that release (unselected) before you can add it. Pasting a master link shows a message asking you to pick a specific version, and nothing is searched.
result: pass

### 11. Narrow window
expected: With the browser as narrow as it goes, the Settings Discogs card, match rows, card buttons and dialog stay inside their boxes with nothing cut off.
result: pass

### 12. Nothing added to your Discogs collection
expected: On discogs.com your collection count is the same as before you connected the app.
result: pass

### 13. Plain wording
expected: No on-screen text in the Discogs parts uses technical words like token, OAuth, queue, job, 429 or rate limit.
result: pass

### 14. A connect started through the app goes to (fake) discogs.com, returns through the callback on the server's own port and saves the three token keys to secrets.json with mode 0600
expected: A connect started through the app goes to (fake) discogs.com, returns through the callback on the server's own port and saves the three token keys to secrets.json with mode 0600
result: pass
source: automated
coverage_id: 03-01-D1

### 15. Denied, made-up, replayed and failed callbacks end at denied, expired or error and store nothing; the docs-form exchange connects after exactly one retry
expected: Denied, made-up, replayed and failed callbacks end at denied, expired or error and store nothing; the docs-form exchange connects after exactly one retry
result: pass
source: automated
coverage_id: 03-01-D2

### 16. Every Discogs request carries the project User-Agent and Accept header, waits on one paced gate, and 429/401/404/422/5xx/TypeError map to their error classes with a 60 s default pause
expected: Every Discogs request carries the project User-Agent and Accept header, waits on one paced gate, and 429/401/404/422/5xx/TypeError map to their error classes with a 60 s default pause
result: pass
source: automated
coverage_id: 03-01-D3

### 17. The client cannot write to the owner's Discogs account: POST (other than /oauth/access_token), PUT, DELETE and PATCH throw before fetch
expected: The client cannot write to the owner's Discogs account: POST (other than /oauth/access_token), PUT, DELETE and PATCH throw before fetch
result: pass
source: automated
coverage_id: 03-01-D4

### 18. Settings shows Connect Discogs before connecting and 'Connected as fake-owner' after a connect through the app
expected: Settings shows Connect Discogs before connecting and 'Connected as fake-owner' after a connect through the app
result: pass
source: automated
coverage_id: 03-02-D1

### 19. Test connection signs exactly one /oauth/identity with the stored token and the project User-Agent, and maps 401, network, 429 and pause to rejected, unreachable and busy without leaking a secret
expected: Test connection signs exactly one /oauth/identity with the stored token and the project User-Agent, and maps 401, network, 429 and pause to rejected, unreachable and busy without leaking a secret
result: pass
source: automated
coverage_id: 03-02-D2

### 20. Disconnect deletes the three token keys and any pending connect locally; a broken secrets.json gives a 500 without its content; Settings returns to Not connected
expected: Disconnect deletes the three token keys and any pending connect locally; a broken secrets.json gives a 500 without its content; Settings returns to Not connected
result: pass
source: automated
coverage_id: 03-02-D3

### 21. After a rejected signed request, Settings shows Reconnect needed, the 'Discogs stopped accepting this app' Alert and Reconnect Discogs
expected: After a rejected signed request, Settings shows Reconnect needed, the 'Discogs stopped accepting this app' Alert and Reconnect Discogs
result: pass
source: automated
coverage_id: 03-02-D4

### 22. Clearing the consumer key or secret while connected also disconnects; clearing while not connected still succeeds
expected: Clearing the consumer key or secret while connected also disconnects; clearing while not connected still succeeds
result: pass
source: automated
coverage_id: 03-02-D5

### 23. Boot applies migration 0002: the live app.db has discogs_searches and discogs_candidates and one __drizzle_migrations row per drizzle/*.sql file
expected: Boot applies migration 0002: the live app.db has discogs_searches and discogs_candidates and one __drizzle_migrations row per drizzle/*.sql file
result: pass
source: automated
coverage_id: 03-03-D1

### 24. A connected owner's finished tracer-shelf scan enqueues exactly one auto search_spine job per active CD spine (6, including the two identical TR-200 spines), and every job succeeds
expected: A connected owner's finished tracer-shelf scan enqueues exactly one auto search_spine job per active CD spine (6, including the two identical TR-200 spines), and every job succeeds
result: pass
source: automated
coverage_id: 03-03-D2

### 25. The cascade stops at the first stage with results (catno, artist_title, text, or no_match) and stores up to 10 candidates with the verbatim title, deduped labels, year, country, formats, thumb, master id, and the exact catalog-number match pinned first and flagged
expected: The cascade stops at the first stage with results (catno, artist_title, text, or no_match) and stores up to 10 candidates with the verbatim title, deduped labels, year, country, formats, thumb, master id, and the exact catalog-number match pinned first and flagged
result: pass
source: automated
coverage_id: 03-03-D3

### 26. Every /database/search request carries type=release, format=CD, per_page=10, page=1, the project User-Agent and a PLAINTEXT signature with oauth_token, and all API requests are at least 100 ms apart
expected: Every /database/search request carries type=release, format=CD, per_page=10, page=1, the project User-Agent and a PLAINTEXT signature with oauth_token, and all API requests are at least 100 ms apart
result: pass
source: automated
coverage_id: 03-03-D4

### 27. Existing proofs still pass after the scan-store hook and the fake's changes
expected: Existing proofs still pass after the scan-store hook and the fake's changes
result: pass
source: automated
coverage_id: 03-03-D5

### 28. A connect that ends on a discogs.com code page is finished by pasting the code; a wrong code answers rejected and keeps the connect pending; a reused code is expired
expected: A connect that ends on a discogs.com code page is finished by pasting the code; a wrong code answers rejected and keeps the connect pending; a reused code is expired
result: pass
source: automated
coverage_id: 03-04-D1

### 29. Pending connects live 14:59, gone at 15:00, single use, dropped at the 5th rejected code; clear removes three keys in one write; the connection DTO carries no secret
expected: Pending connects live 14:59, gone at 15:00, single use, dropped at the 5th rejected code; clear removes three keys in one write; the connection DTO carries no secret
result: pass
source: automated
coverage_id: 03-04-D2

### 30. completeConnect retries once with the docs signature, fails after a second 401, saves nothing without a username, records via 'code'; the PLAINTEXT signer double-encodes and adds token/verifier only when given
expected: completeConnect retries once with the docs signature, fails after a second 401, saves nothing without a username, records via 'code'; the PLAINTEXT signer double-encodes and adds token/verifier only when given
result: pass
source: automated
coverage_id: 03-04-D3

### 31. No /settings HTML, RSC payload, /api/status or Discogs route body carries the consumer secret, a token, a token secret or the code, while pending or connected
expected: No /settings HTML, RSC payload, /api/status or Discogs route body carries the consumer secret, a token, a token secret or the code, while pending or connected
result: pass
source: automated
coverage_id: 03-04-D4

### 32. Settings shows no technical words in not-connected, connected, reconnect-needed and each ?discogs= Alert state; the denied/expired/error Alert titles render; the callback URL for this port is shown
expected: Settings shows no technical words in not-connected, connected, reconnect-needed and each ?discogs= Alert state; the denied/expired/error Alert titles render; the callback URL for this port is shown
result: pass
source: automated
coverage_id: 03-04-D5

### 33. A 429 mid-batch pauses the whole Discogs lane for Retry-After, and every search still finishes on attempt 1 with no API request during the pause
expected: A 429 mid-batch pauses the whole Discogs lane for Retry-After, and every search still finishes on attempt 1 with no API request during the pause
result: pass
source: automated
coverage_id: 03-05-D1

### 34. A revoked sign-in costs at most one search request for a batch; the rest finish auth_failed without a request, no job is left queued or failed, and dedupe keys are released
expected: A revoked sign-in costs at most one search request for a batch; the rest finish auth_failed without a request, no job is left queued or failed, and dedupe keys are released
result: pass
source: automated
coverage_id: 03-05-D2

### 35. Not connected, vanished spines (superseded, dismissed, orphaned for auto), 5xx retry and 4xx failure each behave as specified without a wasted request
expected: Not connected, vanished spines (superseded, dismissed, orphaned for auto), 5xx retry and 4xx failure each behave as specified without a wasted request
result: pass
source: automated
coverage_id: 03-05-D3

### 36. The pacing gate interval, slowdown threshold, pause adjacency and Retry-After parsing are pinned at and around each threshold
expected: The pacing gate interval, slowdown threshold, pause adjacency and Retry-After parsing are pinned at and around each threshold
result: pass
source: automated
coverage_id: 03-05-D4

### 37. Existing proofs still pass
expected: Existing proofs still pass
result: pass
source: automated
coverage_id: 03-05-D5

### 38. A candidate's cover is downloaded once from i.discogs.com, stored as a WebP of at most 128 px under data/discogs-thumbs/{sha256}.webp and served from the cache afterwards without a fetch
expected: A candidate's cover is downloaded once from i.discogs.com, stored as a WebP of at most 128 px under data/discogs-thumbs/{sha256}.webp and served from the cache afterwards without a fetch
result: pass
source: automated
coverage_id: 03-06-D1

### 39. Only https i.discogs.com (or the override host) is fetched, redirects are refused, and http, look-alike hosts, userinfo, other ports, data: URLs, non-image types, non-200 answers and undecodable bytes give null / 404
expected: Only https i.discogs.com (or the override host) is fetched, redirects are refused, and http, look-alike hosts, userinfo, other ports, data: URLs, non-image types, non-200 answers and undecodable bytes give null / 404
result: pass
source: automated
coverage_id: 03-06-D2

### 40. A cover body of exactly 2 097 152 bytes is accepted and one byte more is refused, from Content-Length or from the streamed body
expected: A cover body of exactly 2 097 152 bytes is accepted and one byte more is refused, from Content-Length or from the streamed body
result: pass
source: automated
coverage_id: 03-06-D3

### 41. Concurrent first requests for one cover share one download and at most 4 downloads run at once
expected: Concurrent first requests for one cover share one download and at most 4 downloads run at once
result: pass
source: automated
coverage_id: 03-06-D4

### 42. /api/files serves discogs-thumbs as .webp and still refuses ../app.db, .png, other roots and paths outside DATA_DIR; ensureDataDirs creates discogs-thumbs and the data-folder proofs still pass
expected: /api/files serves discogs-thumbs as .webp and still refuses ../app.db, .png, other roots and paths outside DATA_DIR; ensureDataDirs creates discogs-thumbs and the data-folder proofs still pass
result: pass
source: automated
coverage_id: 03-06-D5

### 43. GET /api/status gains discogs { connected, backlog, pausedUntil, failedSpines }; failedSpines counts active or orphaned spines whose latest auto/again search failed, so a successful retry stops counting
expected: GET /api/status gains discogs { connected, backlog, pausedUntil, failedSpines }; failedSpines counts active or orphaned spines whose latest auto/again search failed, so a successful retry stops counting
result: pass
source: automated
coverage_id: 03-06-D6

### 44. Header text table, mono numbers, anthropic-only failed suffix, pluralized tooltip failures, 'not connected' line and the paused countdown line
expected: Header text table, mono numbers, anthropic-only failed suffix, pluralized tooltip failures, 'not connected' line and the paused countdown line
result: pass
source: automated
coverage_id: 03-06-D7

### 45. Connecting looks up every already-scanned active CD spine exactly once; lease ticks and a reconnect add nothing
expected: Connecting looks up every already-scanned active CD spine exactly once; lease ticks and a reconnect add nothing
result: pass
source: automated
coverage_id: 03-07-D1

### 46. A revoked sign-in's auth_failed spines are never re-queued by the maintenance hook; reconnecting searches each once more; failed searches are never re-queued automatically
expected: A revoked sign-in's auth_failed spines are never re-queued by the maintenance hook; reconnecting searches each once more; failed searches are never re-queued automatically
result: pass
source: automated
coverage_id: 03-07-D2

### 47. Input normalization, cascade stages, candidate mapping, catno pin, stable ranking and candidate replacement pinned on recorded shapes
expected: Input normalization, cascade stages, candidate mapping, catno pin, stable ranking and candidate replacement pinned on recorded shapes
result: pass
source: automated
coverage_id: 03-07-D3

### 48. Capped Discogs strings (title, country, labels, formats, release combined title) never split a surrogate pair
expected: Capped Discogs strings (title, country, labels, formats, release combined title) never split a surrogate pair
result: pass
source: automated
coverage_id: 03-07-D4

### 49. /api/spines carries each spine's mediaKind, search state, deduped candidate count, top 3 candidates in D-10 order and failure; discogsActive and discogs.connected
expected: /api/spines carries each spine's mediaKind, search state, deduped candidate count, top 3 candidates in D-10 order and failure; discogsActive and discogs.connected
result: pass
source: automated
coverage_id: 03-08-D1

### 50. Phase 2 flows unaffected by the SpineDto changes
expected: Phase 2 flows unaffected by the SpineDto changes
result: pass
source: automated
coverage_id: 03-08-D3

### 51. Owner connects the real Discogs account from Settings and Test connection succeeds
expected: Owner connects the real Discogs account from Settings and Test connection succeeds
result: pass
source: automated
coverage_id: 03-13-D1

### 52. All 237 scanned CD spines are searched by themselves after connecting, paced about one per second, with no failures and no rate-limit pauses
expected: All 237 scanned CD spines are searched by themselves after connecting, paced about one per second, with no failures and no rate-limit pauses
result: pass
source: automated
coverage_id: 03-13-D2

### 53. Plans 03-10..03-12 automated deliverables (malformed coverage blocks)
expected: Route refusals, per-search dedupe, fieldsChanged, ref parser, manual branch, cover route, fetch_release branches and manual-over-auto rule pass their tests
result: pass
source: automated
note: coverage blocks use deliverable/human_judgment keys and kind 'command'; full suite run 2026-10-21: 63 files, 938 tests passed

## Summary

total: 53
passed: 53
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
