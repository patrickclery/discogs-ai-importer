# Roadmap: Discogs AI Importer

## Milestones

- ✅ **v1 MVP** — Phases 1-4 (shipped 2026-10-23)
- 🚧 **Next** — Phase 5 (planning)

## Phases

<details>
<summary>✅ v1 MVP (Phases 1-4) — SHIPPED 2026-10-23</summary>

- [x] Phase 1: Foundation (6/6 plans) — completed 2026-10-19
- [x] Phase 2: Shelf Scan (14/14 plans) — completed 2026-10-20
- [x] Phase 3: Discogs Match (15/15 plans) — completed 2026-10-22
- [x] Phase 4: Import & Review Queue (15/15 plans) — completed 2026-10-23

Full details: [milestones/v1-ROADMAP.md](milestones/v1-ROADMAP.md)

</details>

### 🚧 Next (Phase 5)

- [ ] **Phase 5: Stubbed Demo Site** - A public demo anyone can try, with Claude and Discogs fully stubbed

## Phase Details

### Phase 5: Stubbed Demo Site

**Goal:** A demo build of the app that anyone can open and play with to see how it works end to end (upload a shelf photo, review spines, see Discogs matches, confirm and "import"), with no calls to Claude or Discogs and no real credentials. Every external call is replaced by canned stub data.
**Requirements**: DEMO-01..DEMO-10 (proposed in 05-RESEARCH.md from the 05-CONTEXT.md decisions)
**Depends on:** Phase 4
**Plans:** 9/9 plans executed

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
