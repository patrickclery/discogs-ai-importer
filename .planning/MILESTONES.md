# Milestones

## v1.1 Demo & Polish (Shipped: 2026-10-28)

**Phases completed:** 3 phases, 36 plans, 28 tasks

**Key accomplishments:**
- A demo build (`NEXT_PUBLIC_DEMO=1`) now statically exports the real Spines page under `/discogs-ai-importer/`, answers every `/api` call in the browser through a fetch shim backed by an in-memory store, builds only in a scratch copy, and is checked for server code, secrets and family photos on every build.
- The demo's sample shelf (61 spines, the exact 1449x2576 vision JPEG, 61 downscaled crops at 886 KB) was built by the real pipeline from cd-spines.heic. Text-only Discogs candidates were recorded once for every spine (51 matched, 10 no match) plus a canned release, and 264 generated SVG covers were written. All of it is guarded by privacy and integrity tests.
- The demo now opens on the owner's 61-spine cd-spines.heic shelf with downscaled crops, recorded Discogs matches and generated covers. Every D-09 state is seeded, and every status is computed by the real src/lib rules. The real app's image URLs go through a new seam that returns exactly the old strings.
- Every action on the demo's Spines page now works in memory with the real request and response contracts. That covers field edits, Search again, the Search Discogs dialog, candidates, Not on Discogs, add to collection, the duplicate and already-in-collection warnings, Change match, Retry and Retry all failed. Each moves through the real states after short delays, and polling always stops.
- In the demo, dropping any photo now plays a fake 3-second analysis in the real upload row and then adds a fresh 61-spine copy of the sample shelf. That copy's Discogs lookups finish from the recordings. The file itself is never read: only its name is used. Re-scan animates a new run, the base URL lands on Upload, and the app's own error screen is kept.
- The Claude model list, status types and readiness check now live in client-safe `src/lib/claude-types.ts`, and the demo build swaps the Settings server actions for an in-memory module that answers like the real ones and keeps typed credentials only as masked tails.
- The demo Settings page shows a ready Claude CLI and Discogs connected as demo-user. Connect, paste code, Test, Disconnect, folders, credentials and model all run in page memory, and the full four-page export passes verify-export and the smoke check.
- A failed pressing lookup is retried by Retry import (and Retry all failed) on the same bulk item under its `pressing:{itemId}` job key; a lookup whose job died is marked failed on the next lease tick; and the header's "left" count includes lookups.
- POST /api/spines/bulk-import re-checks each pick (eligibility plus still the top match) and starts one paced run in a single IMMEDIATE transaction. A demo twin answers the same request through startBulk, with the same codes and messages.
- /spines now opens as a 1/2/3/4-column grid of compact cards, each with the spine crop above its top or confirmed match (48px cover, clamped title, year · country · catno). A URL-backed Compact/Detailed toggle switches layouts, and Edit spine opens any card in place into the full Phase 4 card.
- Every card form (compact, expanded and Detailed) now shows the bulk states: a "Finding pressing" badge, a map-pin or "Fallback: {country}" badge before the state badge, the fallback reason, the skipped-duplicate line, and a lookup failure with Retry import.
- Every /spines card now has a select checkbox. Ineligible cards show a disabled box whose tooltip gives the reason. A sticky bar offers tri-state "Select all shown ({e})", the selected count, Clear selection and the accent "Import {s} selected". The confirm dialog ("Import {n} to {folder} as Canadian pressings") POSTs only spine and candidate ids. The bar then shows "Bulk import: {d} / {n} done" during the run and "Last bulk import: …" after it. One toast per watched run summarizes the result, with Show failed or Show fallbacks.
- The fake Discogs now serves `GET /masters/{id}/versions`. `scripts/verify-bulk-import.ts` runs the built app, the worker and the gate against it, and checks four things: each Canadian pressing is added exactly once, the run is paced at about 1.1 s per request, only one run can go at a time, and a SIGKILL mid-run never adds a copy twice.
- In-memory demo bulk import (startBulk) that resolves each pick at its readyAt from canned pressing outcomes, with the demo read model emitting the same spine.bulk, response.bulk (shared summarizeRun), Fallback and status-lane fields as the real one
- A `Fallback {k}` toggle in the /spines filter bar, saved in the URL as `?fallback=1`. It uses 06-04's server filter to list only the spines whose bulk import used another country. It comes with a "No fallbacks" empty state, an updated combined-filters empty state, and server-rendered initial data on both the app and demo pages.
- The /spines status tabs now wrap onto extra lines as separate outlined buttons, so All through Failed are all on screen at phone width (G-06-9).


**Closeout:** override_closeout (all phases verified passed; 2 open items acknowledged)

**Known verification overrides:** 2 newly acknowledged, 7 carried forward
- Debug session search-uses-only-catno: the fix is shipped, but the demo spines 01, 02, 07, 22 and 59 still need re-recording against live Discogs.
- Todo: add a GitHub repo link icon to the top bar.
- Phases 5–7 overrides: owner design decisions G-06-side-2 and G-07-side-1/2 (no card numbering, stronger card fade), recorded in each VERIFICATION.md.

**Known tech debt:** see `milestones/v1.1-MILESTONE-AUDIT.md`. Master is unpushed, so the live demo is stale.

---

## v1 MVP (Shipped: 2026-10-23)

**Delivered:** Photograph a CD shelf, get every spine read by one Claude call, matched on Discogs, reviewed, and added to the owner's collection exactly once.

**Phases completed:** 4 phases, 50 plans, 111 tasks
**Timeline:** 2026-10-18 → 2026-10-23 (400 commits)
**Code:** ~25k lines TypeScript app code, ~23k lines tests (1606 Vitest tests)
**Closeout:** override_closeout

**Key accomplishments:**
- Portable local app on 127.0.0.1: SQLite data folder migrated at boot, lease-gated durable job queue that survives kill -9 and dev hot reload, secrets kept outside the data folder.
- One headless `claude -p` vision call per photo (on the owner's subscription), HEIC/EXIF-normalized images, raw answers saved before parsing, and horizontal spine crops cut locally.
- Editable review list with Claude's original read kept alongside, re-scan that preserves edits, and orphan re-attach/dismiss.
- Discogs OAuth 1.0a with a single paced, 429-aware gate; automatic catalog-number → artist/title → free-text search, manual search and paste-a-release-ID.
- Explicit confirm-to-import into a chosen folder, exactly once across crashes, timeouts and retries (intent before POST, adopt a copy that already landed); duplicate and already-in-collection warnings.
- Status-driven queue (pending, matched, imported, not found, not on Discogs, failed) with counts, retry, retry-all and "not on Discogs".

**Known verification overrides:** 9 newly acknowledged, 0 carried forward
- Phases 1–3: VERIFICATION.md status passed but covered-file fingerprints stale (later phases edited shared files); owner declared them done and the v1 audit re-confirmed their requirements in current code.
- Phase 4: 4 owner overrides in 04-VERIFICATION.md (WR-06 status rule, CR-01 check-only Change match ×2, UAT test 5 accepted without a browser check).
- 5 diagnosed debug sessions acknowledged as deferred (see STATE.md Deferred Items).

**Known tech debt:** see `milestones/v1-MILESTONE-AUDIT.md` (undo import deferred, match ranking, migrations only at boot, Phase 2 backlog 999.1–999.4).

---
