# Roadmap: Discogs AI Importer

## Overview

The build starts with a local, portable app shell: settings, a SQLite data folder and a durable job queue. Next comes the core value, a shelf photo turned into reviewable spine crops with editable AI-read text from one Claude call per photo. Discogs connect and candidate matching go on top of that, routed through a single throttled gate. The last phase adds explicit confirm-and-import (never a duplicate) and a status-driven review queue, so a whole shelf can be worked through to completion.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Local one-command app with settings, a portable data folder and a restart-safe job queue
- [ ] **Phase 2: Shelf Scan** - Drop photos, one Claude call each, review horizontal spine crops next to editable AI-read fields
- [ ] **Phase 3: Discogs Match** - Connect Discogs via OAuth and get throttled candidate releases per spine, with manual search and paste-ID
- [ ] **Phase 4: Import & Review Queue** - Confirm a candidate to add it to the collection exactly once; filter, retry and resolve every spine

## Phase Details

### Phase 1: Foundation
**Goal**: The owner can launch the app locally with one command and save their credentials. All state lives in one portable data folder, and background work survives restarts and hot reloads.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04
**Success Criteria** (what must be TRUE):
  1. User runs one command and the app opens at `http://127.0.0.1:<port>`; it is not reachable from another device on the LAN
  2. User can enter and save their Discogs app credentials on the settings page and confirm the local Claude CLI works on their subscription (no API key); after a reload saved values show masked, an env var overrides the saved value, and no secret appears unmasked in any API response or in `git status`
  3. User can copy the data folder to another location or machine, start the app against it, and see the same state (database and stored files)
  4. A job queued before the app is killed completes exactly once after restart, and a dev hot reload never starts a second worker
**Plans:** 4 plans

Plans:
- [ ] 01-01-PLAN.md — Walking skeleton: D-06 and package-legitimacy gates, then scaffold, 127.0.0.1 launch, proxy guard, boot migrations, jobs table, singleton worker, status indicator and Queue test job (wave 1)
- [ ] 01-02-PLAN.md — Restart-safe single worker and portable data folder: retry/backoff, crash recovery, worker lease, handler timeout, resolveData, kill -9 / HMR / copy-folder proofs (wave 2)
- [ ] 01-03-PLAN.md — Discogs credentials on the settings page: secrets.json outside DATA_DIR, masked SecretField, env override, Data folder card, canary leak proof (wave 2)
- [ ] 01-04-PLAN.md — Claude CLI card (D-18): install/login detection, ANTHROPIC_API_KEY warning, vision model, Test Claude, child-process runner, Upload readiness (wave 3)
**UI hint**: yes

### Phase 2: Shelf Scan
**Goal**: User drops shelf photos and sees every detected spine as a horizontal crop next to the AI-extracted fields, which they can correct. Each photo costs exactly one Claude call.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: INGEST-01, INGEST-02, INGEST-03, INGEST-04, INGEST-05, VIS-01, VIS-02, VIS-03, VIS-04, REV-01, REV-02
**Success Criteria** (what must be TRUE):
  1. User drags several shelf photos onto the upload page and watches each one move through queued, analyzing and done. A failure, including a truncated or refused Claude response, shows as an error with a reason and is never silently dropped
  2. Every spine row shows its crop, rotated to horizontal and aligned with the real spine (portrait and EXIF-rotated phone photos included), next to artist, title, format, label, catalog number, raw text, kind and per-field confidence
  3. Each analyzed photo has exactly one recorded Claude call with its raw response persisted, and re-uploading an identical photo makes zero calls and shows the existing spines
  4. User can edit any extracted field; the edit survives a reload and the original AI value is still kept
  5. User can explicitly re-scan a photo. This is the only way a photo goes back to Claude, and the user's earlier edits survive on spines that still match
**Plans**: TBD
**UI hint**: yes

### Phase 3: Discogs Match
**Goal**: User connects their Discogs account and, for each music spine, sees candidate releases they can recognize. Manual search and paste-ID cover the cases auto-search misses, and every request respects the rate limit.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06
**Success Criteria** (what must be TRUE):
  1. User completes the Discogs OAuth 1.0a flow from the app and sees the connected Discogs username
  2. Once a photo's spines are extracted, each music spine gets candidate releases automatically (catalog number first, then artist + title + format, then free text). Each candidate shows a cover thumbnail, year, country, label, catalog number and format
  3. Searching a large batch of spines never loses work to Discogs rate limiting; requests are paced, and after a 429 they back off and resume on their own
  4. After editing a spine's fields, user can re-run its search and see updated candidates
  5. For any spine, user can run a manual Discogs search or paste a Discogs release URL or ID and get that release as a candidate
**Plans**: TBD
**UI hint**: yes

### Phase 4: Import & Review Queue
**Goal**: User confirms the right release for each spine and it lands in their Discogs collection exactly once. A status-driven list lets them work through the whole shelf to completion.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, REV-03, REV-04, REV-05
**Success Criteria** (what must be TRUE):
  1. Nothing reaches Discogs until the user confirms a specific candidate. After confirming, the release is in the chosen collection folder on discogs.com (Uncategorized by default) and the spine shows as imported
  2. Before confirming, user is warned if the release is already in their Discogs collection or was already imported from another photo
  3. Killing the app mid-import or retrying a failed import never creates a duplicate collection entry, and every imported spine records its Discogs instance ID
  4. User can filter the spine list by pending, matched, imported, not found, not on Discogs and failed, with a count for each status
  5. User can retry any failed item without re-uploading its photo, and can mark a spine "not on Discogs". Film spines get this suggested by default, and the user can override it
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/4 | Planned | - |
| 2. Shelf Scan | 0/TBD | Not started | - |
| 3. Discogs Match | 0/TBD | Not started | - |
| 4. Import & Review Queue | 0/TBD | Not started | - |
