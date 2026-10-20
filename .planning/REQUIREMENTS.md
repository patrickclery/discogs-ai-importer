# Requirements: Discogs AI Importer

**Defined:** 2026-10-18
**Core Value:** Photograph a shelf once and get every disc on it reliably into Discogs — with the spine image always visible next to what the AI read, so mistakes are easy to see and fix.

## v1 Requirements

### Foundation

- [x] **FOUND-01**: User can run the app locally with one command; it binds to 127.0.0.1 only
- [x] **FOUND-02**: All app state (SQLite DB + photos + crops + cached thumbnails) lives under a single relative data folder that can be copied to another machine and still works
- [x] **FOUND-03**: User can enter and save their Discogs app credentials in a settings page and verify the local Claude CLI (subscription login) works (env vars override; secrets masked in UI/API, never committed)
- [x] **FOUND-04**: Background work (vision calls, Discogs requests) runs in a durable job queue that survives app restarts and dev hot-reloads without duplicating workers

### Ingest

- [ ] **INGEST-01**: User can drag and drop one or more photos into the upload page
- [x] **INGEST-02**: User sees per-photo processing status (queued / analyzing / done / error)
- [ ] **INGEST-03**: Re-uploading an identical photo (same SHA-256 hash) makes zero Claude calls and links to the existing result
- [ ] **INGEST-04**: User can explicitly re-scan a photo; re-scan is the only way a photo is sent to Claude again, and user edits are preserved where spines still match
- [x] **INGEST-05**: Photos are EXIF-rotated and resized locally before analysis so the image sent to Claude is the same image crops are cut from

### Vision

- [x] **VIS-01**: Each photo is analyzed with exactly ONE Claude vision call that returns every detected spine as structured JSON
- [x] **VIS-02**: Each spine result includes artist, title, format, label, catalog number, raw text as printed, bounding box, per-field confidence, and text orientation
- [x] **VIS-03**: The raw Claude response is persisted before parsing; truncated or refused responses are surfaced as errors, not silently dropped
- [x] **VIS-04**: Each detected spine is cropped locally from its bounding box (with padding) and shown rotated to horizontal — no extra AI calls

### Review

- [x] **REV-01**: User sees a list of all spines with the spine crop next to the extracted fields on every row
- [ ] **REV-02**: User can edit any extracted field; edits are stored separately from the original AI output
- [ ] **REV-03**: User can filter the list by status: pending, matched, imported, not found, not on Discogs, failed — with counts per status
- [ ] **REV-04**: User can retry a failed item without re-uploading the photo
- [ ] **REV-05**: User can mark a spine "not on Discogs" (e.g. obscure or self-released CDs)

### Discogs

- [ ] **DISC-01**: User can connect their Discogs account via OAuth 1.0a and see which account is connected
- [ ] **DISC-02**: All Discogs requests go through a single throttled queue that respects the rate limit (reads rate-limit headers, backs off on 429)
- [ ] **DISC-03**: After extraction, each music spine is searched on Discogs automatically (catalog number first, then artist + title + format, then free text)
- [ ] **DISC-04**: User sees candidate releases with cover thumbnail, year, country, label, catalog number and format
- [ ] **DISC-05**: Editing a spine's fields lets the user re-run the Discogs search for that spine
- [ ] **DISC-06**: User can manually search Discogs or paste a Discogs release URL/ID for any spine

### Import

- [ ] **IMP-01**: User must explicitly confirm a candidate before anything is added to their Discogs collection (no auto-add)
- [ ] **IMP-02**: Confirmed releases are added to the user's chosen collection folder (default Uncategorized)
- [ ] **IMP-03**: User is warned if a release is already in their Discogs collection or already imported from another photo
- [ ] **IMP-04**: Collection adds are never duplicated by retries or crashes; the Discogs instance ID is recorded for each import

## v2 Requirements

### Review speed

- **SPEED-01**: Bounding-box overlay on the original photo; click a box to jump to its row
- **SPEED-02**: User can draw a box for a missed spine and enter its text manually (no AI call)
- **SPEED-03**: Keyboard-driven review (next/prev, accept, edit, not-on-Discogs)
- **SPEED-04**: User-initiated bulk accept of selected rows
- **SPEED-05**: Smart candidate ranking (catno > format > label > country > have-count)
- **SPEED-06**: Adjustable crop (nudge bbox edges, re-crop locally)

### Data

- **DATA-01**: Undo an import (delete the Discogs instance)
- **DATA-02**: Export the local catalogue to CSV/JSON, including "not on Discogs" items
- **DATA-03**: One-click backup of the data folder (VACUUM INTO)
- **DATA-04**: Shelf location written to a Discogs custom field / notes
- **DATA-05**: Per-photo cost/usage display

## Out of Scope

| Feature | Reason |
|---------|--------|
| Creating new releases on Discogs | Discogs API does not support release submission |
| DVDs / Blu-rays / non-CD media | User's collection to import is CDs only; non-CD spines in a photo are ignored |
| Auto-add high-confidence matches | Wrong versions pollute the collection; always confirm |
| Per-spine second vision call | Explicitly rejected for cost — one call per photo |
| Live camera / mobile scanning | Different product; phone photos + desktop drop covers it |
| Marketplace pricing / selling | Collection only |
| Local Discogs data-dump mirror | Many GB for a one-off job; throttled queue suffices |
| Multi-user / hosted deployment | Personal local tool |
| Websockets / SSE | Polling is enough for one local user |
| Wantlist, ratings, tracklist editing | It's an importer, not a Discogs client |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| INGEST-01 | Phase 2 | Pending |
| INGEST-02 | Phase 2 | Complete |
| INGEST-03 | Phase 2 | Pending |
| INGEST-04 | Phase 2 | Pending |
| INGEST-05 | Phase 2 | Complete |
| VIS-01 | Phase 2 | Complete |
| VIS-02 | Phase 2 | Complete |
| VIS-03 | Phase 2 | Complete |
| VIS-04 | Phase 2 | Complete |
| REV-01 | Phase 2 | Complete |
| REV-02 | Phase 2 | Pending |
| REV-03 | Phase 4 | Pending |
| REV-04 | Phase 4 | Pending |
| REV-05 | Phase 4 | Pending |
| DISC-01 | Phase 3 | Pending |
| DISC-02 | Phase 3 | Pending |
| DISC-03 | Phase 3 | Pending |
| DISC-04 | Phase 3 | Pending |
| DISC-05 | Phase 3 | Pending |
| DISC-06 | Phase 3 | Pending |
| IMP-01 | Phase 4 | Pending |
| IMP-02 | Phase 4 | Pending |
| IMP-03 | Phase 4 | Pending |
| IMP-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-18*
*Last updated: 2026-10-18 after roadmap creation (traceability filled; v1 count corrected from 27 to 28)*
