# Roadmap: Discogs AI Importer

## Milestones

- ✅ **v1 MVP** — Phases 1-4 (shipped 2026-10-23)
- ✅ **Next** — Phase 5 (demo site, completed 2026-10-23)

## Phases

<details>
<summary>✅ v1 MVP (Phases 1-4) — SHIPPED 2026-10-23</summary>

- [x] Phase 1: Foundation (6/6 plans) — completed 2026-10-19
- [x] Phase 2: Shelf Scan (14/14 plans) — completed 2026-10-20
- [x] Phase 3: Discogs Match (15/15 plans) — completed 2026-10-22
- [x] Phase 4: Import & Review Queue (15/15 plans) — completed 2026-10-23

Full details: [milestones/v1-ROADMAP.md](milestones/v1-ROADMAP.md)

</details>

### ✅ Next (Phase 5)

- [x] **Phase 5: Stubbed Demo Site** - A public demo anyone can try, with Claude and Discogs fully stubbed (completed 2026-10-23)

## Phase Details

### Phase 5: Stubbed Demo Site

**Goal:** A demo build of the app that anyone can open and play with to see how it works end to end (upload a shelf photo, review spines, see Discogs matches, confirm and "import"), with no calls to Claude or Discogs and no real credentials. Every external call is replaced by canned stub data.
**Requirements**: DEMO-01..DEMO-10 (proposed in 05-RESEARCH.md from the 05-CONTEXT.md decisions)
**Depends on:** Phase 4
**Plans:** 9/9 plans complete

Plans:
**Wave 1**
- [x] 05-01-PLAN.md — Tracer: NEXT_PUBLIC_DEMO static export of /spines answered by the in-browser fetch shim, scratch-copy build, export checks (wave 1)
- [x] 05-02-PLAN.md — Fixtures: sample shelf assets from the real pipeline, Discogs recordings (text only), generated covers (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 05-03-PLAN.md — Seeded shelf: image-URL seam, seed with every review state, full read model (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 05-04-PLAN.md — Spines interactions in memory: edits, searches, dialog, imports, warnings, retries (wave 3)
- [x] 05-05-PLAN.md — Upload (fake analysis, second shelf copy), Re-scan, root redirect and error page (wave 3)
- [x] 05-06-PLAN.md — Client-safe Claude types and simulated Settings actions behind the demo alias (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 05-07-PLAN.md — Simulated Discogs account routes and the demo Settings page; full four-page export check (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 05-08-PLAN.md — Mock-coverage gate, Pages workflow, README link; committed locally, not pushed (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 05-09-PLAN.md — Publish decision (blocking), enable Pages, push, live check (wave 6)

## Backlog

### Phase 999.1: Follow-up — Phase 02 deferred UAT follow-up: Test 4 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 02 verification
**Source phase:** 02
**Deferred at:** 2026-10-20 during /gsd-verify-work 02 session completion
**Follow-ups:**
- [ ] Test 4: it's good, but is it possible that it can rotate the spine to be perfectly horizontal ? (crops of tilted spines are axis-aligned, so they sit at a slant and neighbouring spines bleed in; crop.ts only rotates in 90-degree steps) (deferred 2026-10-20)

### Phase 999.2: Follow-up — Phase 02 deferred UAT follow-up: Test 9 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 02 verification
**Source phase:** 02
**Deferred at:** 2026-10-20 during /gsd-verify-work 02 session completion
**Follow-ups:**
- [ ] Test 9: I can't change the image from here to make it scroll to the top. I have to scroll to the top first to get to the drop down. (filter bar / photo Select is not sticky, so it is unreachable once scrolled into a long list) (deferred 2026-10-20)

### Phase 999.3: Follow-up — Phase 02 deferred UAT follow-up: Test 3 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 02 verification
**Source phase:** 02
**Deferred at:** 2026-10-20 during /gsd-verify-work 02 session completion
**Follow-ups:**
- [ ] Test 3: Manually check orphan Re-attach spine... and Dismiss spine in the browser (automated coverage: scripts/verify-rescan.ts) (deferred 2026-10-20)

### Phase 999.4: Follow-up — Phase 02 deferred UAT follow-up: Test 5 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 02 verification
**Source phase:** 02
**Deferred at:** 2026-10-20 during /gsd-verify-work 02 session completion
**Follow-ups:**
- [ ] Test 5: Manually check Re-scan from a failed /upload row, the narrow-window Re-scan icon (greyed out + tooltip while analyzing), and Use new read after a re-scan (deferred 2026-10-20)

### Phase 6: Bulk Canada auto-import with compact review cards

**Goal:** After photographing a shelf, the user can import every disc in bulk as the Canadian pressing of its top match without verifying hundreds one by one. The review list gets a compact card layout (spine crop with the top match directly below it; edit fields hidden until the card is expanded) so many cards fit on one screen, plus multi-select and a bulk action that resolves each selected spine's top match to its Canada release (falling back visibly when none exists) and adds them to the Discogs collection through the existing rate-limited queue.
**Requirements**: BULK-01..BULK-12 (proposed in 06-RESEARCH.md from the 06-CONTEXT.md decisions)
**Depends on:** Phase 5
**Plans:** 18/18 plans executed

Plans:
**Wave 1**
- [x] 06-01-PLAN.md — Pressing choice core: versions parsing, choosePressing (D-01..D-04, D-18, D-19, D-21), bulk contracts, eligibility (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-02-PLAN.md — Tracer: bulk tables + migration 0004, startBulkRun, resolve_pressing job through createImport (wave 2)
- [x] 06-03-PLAN.md — Preferred country setting, Settings field and demo twin (D-14) (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-04-PLAN.md — /spines read model: per-spine eligibility and lookup, run summary, Fallback filter, lookup-aware status (wave 3)
- [x] 06-05-PLAN.md — Lookup failure, Retry, interrupted-lookup recovery, header count (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 06-07-PLAN.md — Compact cards, responsive grid, Edit spine expand, Compact/Detailed toggle (wave 4)
- [x] 06-11-PLAN.md — Demo bulk run: canned pressings, startBulk, demo read-model bulk fields (D-17) (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 06-06-PLAN.md — POST /api/spines/bulk-import and its demo route (wave 5)
- [x] 06-08-PLAN.md — Bulk states on cards: Finding pressing, country badge, fallback, skipped, lookup failure (wave 5)
- [x] 06-12-PLAN.md — Fallback filter toggle, filter empty states, fallback param on both /spines pages (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*
- [x] 06-09-PLAN.md — Selection, bulk bar, confirm dialog, start and finished toasts, demo export check (wave 6)
- [x] 06-10-PLAN.md — Live-stack proof against the fake Discogs: pacing, one run at a time, crash mid-run (wave 6)

**Gap closure (UAT: G-06-side-1, G-06-9)**
**Wave 1**
- [x] 06-13-PLAN.md — Pressing core: fallback-country tier (Preferred -> Fallback -> top match), needsFallbackLookup, outcome fallback_country (G-06-side-1)
- [x] 06-14-PLAN.md — Fallback country setting (default US) on the Settings Discogs card, with demo twin (G-06-side-1)
- [x] 06-15-PLAN.md — Status tab row wraps at phone width (G-06-9)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 06-16-PLAN.md — Real bulk run: migration 0005 fallback snapshot, second versions lookup only when needed, live-stack proof (G-06-side-1)
- [x] 06-17-PLAN.md — Demo bulk run: fallback snapshot and canned US pressing (G-06-side-1)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 06-18-PLAN.md — Truthful fallback copy on cards, finding line and dialog; read models carry the fallback country; UI-SPEC amendment (G-06-side-1)

### Phase 7: Match the patrickclery.com/awesomer color palette

**Goal:** Restyle the app to use the same color palette as https://patrickclery.com/awesomer (Catppuccin Mocha, dark only; colors only, fonts unchanged), applied through the existing Tailwind/shadcn theme tokens so every screen picks it up.
**Requirements**: THEME-01..THEME-07 (proposed in 07-01-PLAN.md from the 07-CONTEXT.md decisions)
**Depends on:** Phase 6
**Plans:** 2/3 plans executed

Plans:
**Wave 1**
- [x] 07-01-PLAN.md — Tracer: Mocha tokens in one :root, forced dark (layouts, provider, toasts), blurred header, verify-export dark rule (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 07-02-PLAN.md — Primitives: lavender primary hover, solid-red destructive fills with base text (C-1, C-2), description link hover (wave 2)
- [ ] 07-03-PLAN.md — Counts readable in pressed toggles (C-3, C-4) and lavender hover on inline links (wave 2)
