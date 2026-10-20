---
status: diagnosed
trigger: "UAT phase 02 test 1 (re-run of G-02-3): Couldn't refresh alert on /upload still never clears after server restart, although header recovers to Worker idle"
created: 2026-10-20T19:00:00Z
updated: 2026-10-20T19:45:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED - the /upload tab used in UAT test 1 was running the PRE-02-13 client bundle (loaded 01:44:52 from the 01:44 build), never the fixed code. The 02-13 fix itself works.
test: done - Firefox HTTP cache inspection + pre-fix vs post-fix control in the user's Firefox engine
expecting: n/a
next_action: return ROOT CAUSE FOUND to the orchestrator (fix direction = re-run UAT test 1 with a fresh server + hard-reloaded tab; process guard)
bug_class: Bohrbug (deterministic) - environment/test-procedure, not code
reasoning_checkpoint:
  hypothesis: "The UAT alert never cleared because the open /upload tab executed the pre-fix bundle (photosRefetchInterval(photos) with no error branch). That bundle came from the server started 01:45:20 off the 01:44:41 build, and the tab was never reloaded after a post-fix server existed (first one: 11:25:05)."
  confirming_evidence:
    - "Firefox dev-edition cache: 1k1byvgszfe8w.js fetched 01:44:52 contains refetchInterval:e=>(0,ep.h)(e.state.data?.photos), the pre-fix one-argument call"
    - "The post-fix /upload chunk 0xeqeamxbfq77.js (refetchInterval with e.state.status) is absent from the cache; the post-fix /spines chunk 4200wj5c18orb.js IS cached, at 11:28:06 (test 2 after the restart)"
    - "Session transcript: the server killed at 11:24:25 was started at 01:45:20 (session 3dc1bfd0) after the 01:44:41 build; the fix landed at 02:26 and the rebuild at 02:32 was on disk only; the user said 'i have /upload open' and reported 34 s after the restart without reloading"
    - "Control: the pre-fix build (be3d8b0) in headless Firefox 159 reproduces the exact symptom (header goes to Worker idle, alert stays 25+ s, zero /api/photos requests after the error). HEAD build: alert clears 0.5-2.6 s after the server returns, on /upload and /spines"
  falsification_test: "A tab hard-reloaded against a HEAD server (0xeqeamxbfq77.js loaded), with the server then stopped and restarted, still keeps the alert past 10 s. Not observed in Chrome or Firefox headless (3 runs, all cleared)."
  fix_rationale: "No source change is needed. The fix is to re-run the test with the fixed bundle actually loaded in the browser."
  blind_spots: "Not re-tested in the user's headed Firefox with real tab switching (only document.visibilityState simulated). The real stop/start of next-server was simulated with a TCP proxy RST/re-listen, not a process restart."
  candidate_causes:
    - "code: photosRefetchInterval or the alert condition still wrong (eliminated: the HEAD bundle recovers in real Chrome and Firefox)"
    - "code: retry:3 default vs the test's retry:false (eliminated: query-core replay with the real config recovers)"
    - "environment: stale server process + stale tab JS (CONFIRMED)"
    - "data: /api/photos failing after restart (eliminated: 200 in 3 ms, well-formed body)"
  and_gate: "yes. Both were needed: (1) the tab's bundle was loaded from a pre-fix build/process, and (2) the tab was not reloaded after the 11:25 post-fix server came up. Either one alone would not have shown the bug."

## Symptoms

expected: After the server comes back, the "Couldn't refresh" alert on /upload (and /spines) clears by itself within ~3-10 s, no page interaction.
actual: Server stopped -> header "Status unavailable" + red "Couldn't refresh" alert above Photos list (3 photos, all Done). Server restarted -> header flips to green "Worker idle", alert stays well past 10 s, tab focused. User: "it's still not changing".
errors: none reported
reproduction: 02-UAT.md test 1. Prod build (next build && next start -H 127.0.0.1 -p 3001). /upload with every photo Done, stop server, refocus tab so alert appears, restart server, keep tab focused.
started: regression of G-02-3 after plan 02-13 (photosRefetchInterval error branch, POLL_RETRY_MS 3000)

## Eliminated

- hypothesis: stale .next build on disk (build older than the 02-13 fix)
  evidence: BUILD_ID 02:32 is after 47fb985 (02:26); the built chunks contain photosRefetchInterval(..., e.state.status)
  timestamp: 2026-10-20T19:10:00Z

- hypothesis: the app's default retry:3 (the test used retry:false) keeps status from reaching 'error' or blocks the interval
  evidence: repro1.mjs replays query-core 5.104.2 with the real config: error at 7.7 s, interval refetch at 10.8 s, cleared 1.1 s after the server returned
  timestamp: 2026-10-20T19:12:00Z

- hypothesis: the React/useQuery layer or the browser (real timers, visibility, fetch failure mode) defeats the interval
  evidence: the HEAD bundle in headless Chrome (abort and real TCP refuse) and in headless Firefox Developer Edition 159 (the user's browser, real TCP refuse) cleared the alert 0.5-2.6 s after the server returned, on /upload and /spines
  timestamp: 2026-10-20T19:25:00Z

- hypothesis: /api/photos fails or returns a bad shape after a restart, while /api/status works
  evidence: /api/photos returns 200 in 3 ms with {"photos":[...]}; the orchestrator's probe at 11:25:06 also got 200
  timestamp: 2026-10-20T19:16:00Z

## Evidence

- timestamp: 2026-10-20T19:00:00Z
  checked: knowledge base / prior sessions
  found: no knowledge-base.md; prior session couldnt-refresh-alert-never-clears.md diagnosed refetchInterval ignoring error state; its repro and the 02-13 regression test both ran QueryObserver with retry:false (test file sets defaultOptions.queries.retry=false).
  implication: the fix was never exercised with the app's real QueryClient options (only refetchOnWindowFocus:true, default retry 3).

- timestamp: 2026-10-20T19:00:00Z
  checked: src/lib/photo-status.ts, photo-status-list.tsx, spines-view.tsx, providers.tsx, status-indicator.tsx
  found: refetchInterval = photosRefetchInterval(q.state.data?.photos, q.state.status) -> 1500 if active, 3000 if status==='error', else false. Alert = query.isError. Header StatusIndicator does not use TanStack (own setTimeout chain, 5 s, /api/status).
  implication: header recovery proves server up and /api/status reachable, not that /api/photos is fetched or succeeds.

- timestamp: 2026-10-20T19:00:00Z
  checked: query-core 5.104.2 queryObserver.js
  found: onQueryUpdate -> updateResult + #updateTimers (clear + re-create setInterval with #computeRefetchInterval()). Interval callback runs #executeFetch only if refetchIntervalInBackground || focusManager.isFocused(). focusManager listens to visibilitychange only. #shouldScheduleTimer requires !isServer() and enabled !== false.
  implication: interval should re-arm at 3000 on the error dispatch.

- timestamp: 2026-10-20T19:10:00Z
  checked: .next build (BUILD_ID 02:32, after 47fb985 at 02:26); chunks 0xeqeamxbfq77.js / 4200wj5c18orb.js
  found: built client code contains refetchInterval:e=>(0,ep.h)(e.state.data?.photos,e.state.status) and the /spines equivalent.
  implication: the build on disk has the 02-13 fix.

- timestamp: 2026-10-20T19:12:00Z
  checked: scratchpad repro1.mjs - query-core 5.104.2 QueryObserver, REAL app config (only refetchOnWindowFocus:true, default retry 3, real timers), focus refetch while down, server up at 12.7 s
  found: focus fetch + 3 retries (0.7/1.7/3.7/7.7 s) -> status=error at 7.7 s; interval fires at 10.8 s; server up 12.7 s; retry at 13.8 s OK -> isError=false.
  implication: retry:3 vs retry:false does not break recovery at the query-core level.

- timestamp: 2026-10-20T19:15:00Z
  checked: scratchpad browser1.mjs / browser2.mjs - headless google-chrome-stable against the running prod server (HEAD build), /api/* aborted, then a real TCP-refusing proxy (3002->3001) closed and re-listened; visibility hidden->visible simulated
  found: alert shown; after the server returned, GET /api/photos 200 and ALERT CLEARED within 0.5-2 s.
  implication: the shipped React + TanStack code recovers in a real Chrome page.

- timestamp: 2026-10-20T19:16:00Z
  checked: curl 127.0.0.1:3001/api/photos and /api/status now
  found: both 200 in ~3 ms; /api/photos body {"photos":[...]} well-formed.
  implication: no server-side failure of /api/photos.

- timestamp: 2026-10-20T19:20:00Z
  checked: xdg default browser + running processes
  found: user browser is Firefox Developer Edition 159.0b4 (profile f11pkleh.dev-edition-default)
  implication: re-test in that engine.

- timestamp: 2026-10-20T19:25:00Z
  checked: scratchpad ff1.mjs - puppeteer-core + /usr/lib/firefox-developer-edition/firefox headless, real TCP refuse via proxy, HEAD build
  found: /upload: alert shown at 23.4 s, server up 23.4 s, GET /api/photos 200, ALERT CLEARED 23.9 s. /spines: cleared 2.1 s after up.
  implication: the fixed code works in the user's browser engine.

- timestamp: 2026-10-20T19:30:00Z
  checked: UAT session transcript 373eb8a0 (11:24-11:25) + 3dc1bfd0 (01:44-01:46) + subagent transcripts
  found: 01:44:41 `npm run build` (pre-fix code) -> 01:45:20 `npm run serve -- -p 3001` (the G-02-3 discovery UAT). 02-13 fix commits 02:25-02:26; executor ran `pnpm build` (BUILD_ID 02:32) but nobody restarted the 3001 server. 11:24:15 user: "kill the server, i have /upload open". 11:24:25 killed pid 3022224 (that 01:45 server). 11:25:05 new server (HEAD build) up. 11:25:39 user: "it's still not changing" with no reload in between.
  implication: the tab under test was opened against the pre-fix build and kept its in-memory JS across the restart.

- timestamp: 2026-10-20T19:35:00Z
  checked: Firefox cache2 entries for 127.0.0.1:3001/_next/static/chunks (gunzipped bodies)
  found: 01:44:52 1k1byvgszfe8w.js -> refetchInterval:e=>(0,ep.h)(e.state.data?.photos) (PRE-FIX /upload). 02:00:10 20vcc8v_hfw3v.js -> (e.state.data?.photoOptions) (pre-fix /spines). 11:28:06 4200wj5c18orb.js -> (e.state.data?.photoOptions,e.state.status) (POST-FIX /spines, test 2). POST-FIX /upload chunk 0xeqeamxbfq77.js: NOT in cache, never fetched.
  implication: direct proof that the browser never ran the fixed /upload code during test 1.

- timestamp: 2026-10-20T19:40:00Z
  checked: control - built be3d8b0 (pre-fix) in scratchpad (git archive, DB copy, port 3012), same Firefox harness
  found: PRE-FIX: after the error, zero /api/photos requests; server up at 18.5 s; header -> "Worker idle"; alert STILL shown at 43.6 s (exact UAT symptom). POST-FIX (HEAD): alert cleared 2.6 s after up.
  implication: the UAT observation matches the pre-fix bundle exactly and does not match the fixed one. Root cause confirmed.

## Resolution

root_cause: Test-environment artifact, not a code regression. The /upload tab used for UAT test 1 ran the pre-02-13 client bundle. It was loaded at 01:44:52 (Firefox cache: 1k1byvgszfe8w.js, one-argument photosRefetchInterval(photos), so no polling while idle and in error) from the server started at 01:45:20 off the 01:44:41 build. The fix was committed at 02:26 and built to disk at 02:32, but the running 3001 server was not restarted until 11:25:05, during the test, and the tab was never reloaded, so the post-fix /upload chunk 0xeqeamxbfq77.js was never fetched. The header recovers because StatusIndicator's own 5 s poll exists in both builds. The 02-13 code works: the HEAD bundle clears the alert 0.5-2.6 s after the server returns in Chrome and in Firefox Dev Edition 159, on both /upload and /spines. Contributing cause (AND-gate): the UAT procedure and orchestrator checked that ".next is current with HEAD" but not that the running process, and the tab's loaded JS, came from that build.
fix: (diagnose-only) none to src/. Re-run UAT test 1: restart the server from the current build, hard-reload /upload (and /spines) BEFORE stopping the server, then stop, refocus, restart and watch. Optional process guard: the UAT step should restart the server and tell the user to hard-reload each page under test after any rebuild.
verification: 'control experiment: pre-fix bundle reproduces the symptom (alert stuck 25+ s, header Worker idle); HEAD bundle recovers in 0.5-2.6 s (Chrome x2, Firefox x2 incl. /spines)'
files_changed: []
