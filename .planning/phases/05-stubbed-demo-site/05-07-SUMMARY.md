---
phase: 05-stubbed-demo-site
plan: 07
subsystem: demo-runtime
tags: [demo, settings, discogs, static-export]
status: complete

requires: ["05-05", "05-06"]
provides:
  - "src/demo/ops/account.ts: connect, finish, test, disconnect, readFolders, refreshFolders on state.account; demoAuthorizeUrl()"
  - "src/demo/routes/account.ts: POST discogs/connect, finish, test, disconnect; GET/POST discogs/folders"
  - "src/app/settings/page.demo.tsx: client Settings page fed from the demo account"
affects: [05-08, 05-09]

actuals:
  tokens: 15000
  tasks: 2
  commits: 3
plan_head_before: 9a2d1f89fe2d4180d5277c085489387db06d1bf2
plan_head_after: 21ef649bc63bfc1e0c2b5303fb0e8985ea9a477d

tech-stack:
  added: []
  patterns:
    - "Connect answers a constant basePath URL; the full reload is the demo's 'come back connected'"
    - "Demo page reuses the real server-free cards (ClaudeCliCard, DiscogsCard, StoragePaths) from a 'use client' page"

key-files:
  created:
    - src/demo/ops/account.ts
    - src/demo/ops/account.test.ts
    - src/app/settings/page.demo.tsx
  modified:
    - src/demo/routes/account.ts
    - src/demo/store.ts
    - src/demo/seed.ts

key-decisions:
  - "authorizeUrl = NEXT_PUBLIC_BASE_PATH + '/settings/?discogs=connected', never from request data (T-05-24)"
  - "The demo page reports pendingConnect whenever Discogs is disconnected, so the paste-code form is the in-page way back; finish accepts any non-empty code as demo-user"
  - "Test connection and Reload folders answer after 400 ms; other account mutations use the shared 250 ms"
  - "Seed folders: Uncategorized, Jazz, Soundtracks; DemoAccount gained foldersFetchedAt (null = read at load, so no auto-refresh on open)"

requirements-completed: [DEMO-08, DEMO-09]

coverage:
  - id: S1
    description: "Account routes mirror the real bodies and codes; disconnect shows in Spines and status; connect URL fixed"
    requirement: DEMO-08
    verification:
      - kind: unit
        ref: "src/demo/ops/account.test.ts (15 tests)"
        status: pass
  - id: S2
    description: "Four-page export: banner on every page, Settings shows demo-user, empty server-reference manifest, zero /api requests"
    requirement: DEMO-09
    verification:
      - kind: e2e
        ref: "scripts/demo/build-demo.ts (verify-export PASS 392 files, rules a-h) + scripts/demo/smoke.ts (PASS 4 pages)"
        status: pass

duration: 6min
completed: 2026-10-23
---

# Phase 5 Plan 07: Demo Discogs Account and Settings Page Summary

**The demo Settings page shows a ready Claude CLI and Discogs connected as demo-user. Connect, paste code, Test, Disconnect, folders, credentials and model all run in page memory, and the full four-page export passes verify-export and the smoke check.**

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (RED) | Failing demo Discogs account route checks | 26413c5 |
| 1 (GREEN) | Simulated Discogs account routes | daca8ec |
| 2 | Demo Settings page and full export check | 21ef649 |

## TDD Gate Compliance

RED 26413c5: all 15 account tests failed (the routes answered 501). GREEN daca8ec: they pass. No refactor commit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Folder list and its read time were missing from the demo account**
- **Found during:** Task 1
- **Issue:** The seed had only Uncategorized, and `DemoAccount` had nowhere to store the `fetchedAt` that `FoldersGetResult` needs.
- **Fix:** The seed now has Jazz and Soundtracks too (counts still come from the collection). `foldersFetchedAt` was added to `DemoAccount`; GET falls back to `initAt` so the picker doesn't auto-refresh on open.
- **Files modified:** src/demo/store.ts, src/demo/seed.ts
- **Commit:** daca8ec

**2. [Rule 2 - Missing] The paste-code form had no way to appear in the demo**
- **Issue:** `DiscogsCard` shows `PasteCodeForm` only when `pendingConnect` is set, and Connect reloads the page. Without a change, a disconnected visitor could reconnect only by reloading.
- **Fix:** The demo page reports `pendingConnect` whenever the account is disconnected. No component was changed.
- **Commit:** 21ef649

## Verification

- vitest (full) 98 files / 1747 tests, tsc --noEmit, biome check: pass
- build-demo: routes /, /_not-found, /settings, /spines, /upload are all static; `[verify-export] PASS: 392 files, rules a-h`
- smoke with the four --expect markers: `PASS 4 page(s), zero /api requests`

## Self-Check: PASSED

- FOUND: src/demo/ops/account.ts, src/demo/ops/account.test.ts, src/demo/routes/account.ts, src/app/settings/page.demo.tsx
- FOUND: 26413c5, daca8ec, 21ef649
