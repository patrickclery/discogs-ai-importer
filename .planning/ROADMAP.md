# Roadmap: Discogs AI Importer

## Milestones

- ✅ **v1 MVP** — Phases 1-4 (shipped 2026-10-23)

## Phases

<details>
<summary>✅ v1 MVP (Phases 1-4) — SHIPPED 2026-10-23</summary>

- [x] Phase 1: Foundation (6/6 plans) — completed 2026-10-19
- [x] Phase 2: Shelf Scan (14/14 plans) — completed 2026-10-20
- [x] Phase 3: Discogs Match (15/15 plans) — completed 2026-10-22
- [x] Phase 4: Import & Review Queue (15/15 plans) — completed 2026-10-23

Full details: [milestones/v1-ROADMAP.md](milestones/v1-ROADMAP.md)

</details>

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
