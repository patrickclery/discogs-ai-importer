# Discogs AI Importer

## What This Is

A local, portable web app that turns photos of DVD/CD shelves into Discogs collection entries. The user drags and drops photos of disc spines; Claude's vision API reads every spine in a photo in a single call; each detected spine is cropped, stored locally (SQLite), matched against the Discogs database, reviewed/corrected by the user, and added to their Discogs collection. Built for a single user (the owner) cataloguing their own physical media.

## Core Value

Photograph a shelf once and get every disc on it reliably into Discogs — with the spine image always visible next to what the AI read, so mistakes are easy to see and fix.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can drag and drop one or more shelf/spine photos into the web UI
- [ ] Each uploaded photo is processed with exactly ONE Claude vision API call that returns all spines in the photo as structured JSON (artist, title, format, catalog number / label if visible, bounding box per spine)
- [ ] Each detected spine is cropped locally (sharp) from its bounding box and stored as its own image — no additional AI calls for cropping
- [ ] Duplicate uploads are detected by image hash and not re-sent to Claude; re-scanning a photo only happens on explicit user action
- [ ] All photos, spine crops, and extracted data are stored locally (SQLite + files on disk) so the whole thing is portable
- [ ] User can connect their Discogs account via OAuth 1.0a
- [ ] For each spine, the app searches Discogs and proposes candidate releases (with cover thumbnails) for the user to confirm
- [ ] Discogs requests are queued/throttled to respect the 60 req/min authenticated rate limit
- [ ] User can confirm a match and add the release to their Discogs collection
- [ ] User sees a list of all spines with status: pending, matched, imported, not found, failed
- [ ] Every item in the list shows its spine crop next to the extracted text
- [ ] User can edit/correct the extracted fields and re-run the Discogs search for that spine
- [ ] Items with no Discogs match can be flagged "not on Discogs"
- [ ] User can configure their Anthropic API key and Discogs app credentials locally

### Out of Scope

- Creating new releases on Discogs — the Discogs API does not support release submission; only existing releases can be added to a collection
- Non-music movie DVDs on Discogs — Discogs only catalogs music-related releases; these will end up as "not on Discogs"
- Multi-user / hosted deployment — this is a personal local tool
- Marketplace listing / selling — collection only
- One Claude call per spine — explicitly rejected for cost; one call per photo

## Context

- Physical collection of DVDs and CDs, photographed as spines on shelves (many spines per photo).
- Discogs API: search (`/database/search`) requires authentication; adding to collection is `POST /users/{username}/collection/folders/{folder_id}/releases/{release_id}`. Rate limit 60/min authenticated.
- Claude vision with structured output (tool use / JSON schema) can return an array of spines with bounding boxes from one image.
- Spine text is often vertical, small, stylized — expect OCR errors, hence the correction UI is central, not optional.

## Constraints

- **Tech stack**: Next.js (App Router, TypeScript) — user's choice for the UI
- **Storage**: SQLite (preferred for portability); Postgres acceptable but not default
- **Cost**: Exactly one Claude vision call per uploaded photo; no per-spine AI calls; cache by image hash
- **Rate limits**: Discogs 60 req/min authenticated — must queue
- **Portability**: Whole app state (DB + images) lives in the project/data folder and can be copied elsewhere
- **Secrets**: API keys stored locally (.env or local settings), never committed

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite (via Drizzle) over Postgres | Portability; single-user local tool | — Pending |
| Claude vision, one call per photo returning all spines + bounding boxes | Avoid N calls per photo; cost control | — Pending |
| Local cropping with sharp from AI bounding boxes | Spine images for review without extra AI calls | — Pending |
| Human confirms Discogs match before adding to collection | OCR + search is fuzzy; avoid polluting collection | — Pending |
| Image-hash dedup; re-scan only on explicit action | Prevent accidental repeat API spend | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-18 after initialization*
